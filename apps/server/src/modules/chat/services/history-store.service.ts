import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { AppException, ERR } from '../../../shared/errors/app-exception';
import { HistoryEntry } from '../types/history-entry';
import { TokenCounterService } from './token-counter.service';

@Injectable()
export class HistoryStoreService implements OnModuleInit {
  private readonly logger = new Logger(HistoryStoreService.name);
  private basePath!: string;
  private readonly writeLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly config: ConfigService,
    private readonly tokenCounter: TokenCounterService,
  ) {}

  async onModuleInit() {
    this.basePath = this.config.get<string>('historyStoreBasePath') || './data/chat-cache';
    try {
      await fs.mkdir(this.basePath, { recursive: true });
    } catch (error) {
      this.logger.error(`Failed to create history store base path: ${this.basePath}`, error);
      throw error;
    }
  }

  /**
   * Helper to resolve path for a session ID.
   * Throws bad request if session ID is not a valid UUID format (safety check).
   */
  private pathFor(sid: string): string {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(sid)) {
      throw new AppException(ERR.INVALID_PAYLOAD, 'Invalid session ID format');
    }
    return path.join(this.basePath, `${sid}.jsonl`);
  }

  /**
   * Enqueue a write operation per session to prevent concurrent I/O race conditions (mutex).
   */
  private enqueueWrite(sid: string, fn: () => Promise<void>): Promise<void> {
    const prev = this.writeLocks.get(sid) ?? Promise.resolve();
    const next = prev.then(fn, fn).catch((e) => {
      this.logger.error(`Sequential write failed for session: ${sid}`, e);
      throw e;
    });

    this.writeLocks.set(
      sid,
      next.then(() => {
        if (this.writeLocks.get(sid) === next) {
          this.writeLocks.delete(sid);
        }
      }),
    );

    return next;
  }

  /**
   * Append a new history entry to the session file.
   */
  async append(sid: string, entry: HistoryEntry): Promise<void> {
    const filePath = this.pathFor(sid);
    await this.enqueueWrite(sid, async () => {
      const line = JSON.stringify(entry) + '\n';
      await fs.appendFile(filePath, line, 'utf8');
    });
  }

  /**
   * Read all history entries for a given session.
   */
  async readAll(sid: string): Promise<HistoryEntry[]> {
    const filePath = this.pathFor(sid);
    if (!(await this.exists(sid))) {
      return [];
    }

    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const lines = raw.split('\n').filter((line) => line.trim() !== '');
      return lines.map((line) => this.parseLine(line));
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }
      this.logger.error(`Failed to read history for session: ${sid}`, error);
      throw new AppException(ERR.INTERNAL_ERROR, 'Failed to read chat history');
    }
  }

  /**
   * Read history entries starting from the last checkpoint entry.
   * Includes the checkpoint entry itself.
   */
  async readSinceLastCheckpoint(sid: string): Promise<HistoryEntry[]> {
    const all = await this.readAll(sid);
    let lastCheckpointIndex = -1;

    // Traverse backwards to find the last checkpoint
    for (let i = all.length - 1; i >= 0; i--) {
      const entry = all[i];
      if (entry && entry.type === 'checkpoint') {
        lastCheckpointIndex = i;
        break;
      }
    }

    if (lastCheckpointIndex === -1) {
      return all;
    }

    const last = all[lastCheckpointIndex];
    if (last && last.type === 'checkpoint' && last.data.coveredUntilTimestamp !== undefined) {
      const coveredUntil = last.data.coveredUntilTimestamp;
      return [
        last,
        ...all.filter((e) => e.timestamp > coveredUntil && e.type !== 'checkpoint'),
      ];
    }

    return all.slice(lastCheckpointIndex);
  }

  /**
   * Estimate the token usage for the entries since the last checkpoint.
   */
  async estimateTokens(sid: string): Promise<number> {
    const entries = await this.readSinceLastCheckpoint(sid);
    return this.tokenCounter.estimateHistoryTokens(entries);
  }

  /**
   * Delete the history cache file for the session.
   */
  async cleanup(sid: string): Promise<void> {
    const filePath = this.pathFor(sid);
    await this.enqueueWrite(sid, async () => {
      try {
        await fs.unlink(filePath);
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          this.logger.error(`Failed to delete history file for session: ${sid}`, error);
          throw error;
        }
      }
    });
  }

  /**
   * Return the messages array of the most recent assistant_batch entry, or [] if none found.
   */
  async getLastAssistantBatch(sid: string): Promise<import('../types/history-entry').AssistantMessage[]> {
    const entries = await this.readAll(sid);
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry && entry.type === 'assistant_batch') {
        return entry.data.messages;
      }
    }
    return [];
  }

  /**
   * Check if history file exists for a session.
   */
  async exists(sid: string): Promise<boolean> {
    const filePath = this.pathFor(sid);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parse a JSON line into a HistoryEntry object.
   */
  private parseLine(line: string): HistoryEntry {
    try {
      return JSON.parse(line) as HistoryEntry;
    } catch (error) {
      this.logger.warn({ line }, 'Corrupted jsonl line found in history file');
      throw new AppException(ERR.INTERNAL_ERROR, 'Corrupt history');
    }
  }
}
