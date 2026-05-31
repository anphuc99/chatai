import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { HistoryStoreService } from './history-store.service';
import { TokenCounterService } from './token-counter.service';
import { LlmService } from './llm.service';
import { RedisService } from '../../../shared/redis/redis.service';
import { ChatConfig } from '../../../config/chat.config';
import { HistoryEntry } from '../types/history-entry';

@Injectable()
export class CheckpointService {
  private readonly logger = new Logger(CheckpointService.name);

  constructor(
    private readonly historyStore: HistoryStoreService,
    private readonly tokenCounter: TokenCounterService,
    private readonly llmService: LlmService,
    private readonly redis: RedisService,
    private readonly config: ChatConfig,
  ) {}

  /**
   * Schedule check and trigger checkpoint creation asynchronously (fire-and-forget).
   */
  maybeTriggerAsync(sid: string): void {
    setImmediate(() => {
      this.maybeTrigger(sid).catch((e) => {
        this.logger.error({ sid, err: e }, 'Checkpoint trigger failed');
      });
    });
  }

  /**
   * Main check and trigger checkpoint logic.
   */
  async maybeTrigger(sid: string): Promise<void> {
    const tokens = await this.historyStore.estimateTokens(sid);
    const threshold = this.config.triggerThreshold();
    if (tokens < threshold) {
      return;
    }

    try {
      const result = await this.redis.withLock(`chat:lock:${sid}`, 120000, async () => {
        const tokens2 = await this.historyStore.estimateTokens(sid);
        if (tokens2 < threshold) {
          return { skipped: true };
        }
        await this.createCheckpoint(sid);
        return { created: true };
      });
      this.logger.debug({ sid, result }, 'checkpoint maybe done');
    } catch (e: any) {
      if (e instanceof ConflictException && e.message === 'SESSION_LOCKED') {
        this.logger.debug({ sid }, 'Checkpoint lock is busy, skipping');
        return;
      }
      throw e;
    }
  }

  /**
   * Create and write checkpoint for the session.
   */
  async createCheckpoint(sid: string): Promise<void> {
    const entries = await this.historyStore.readSinceLastCheckpoint(sid);

    // entries may start with checkpoint if exists; drop that for summary scope
    const contentEntries = entries[0]?.type === 'checkpoint' ? entries.slice(1) : entries;
    if (contentEntries.length === 0) {
      return; // nothing to summarize
    }

    // Giữ lại 10 entries user/assistant gần nhất
    const RETAINED_TURNS = 10;
    let userAssistantCount = 0;
    let splitIndex = -1;

    for (let i = contentEntries.length - 1; i >= 0; i--) {
      const entry = contentEntries[i];
      if (entry && (entry.type === 'user' || entry.type === 'assistant_batch')) {
        userAssistantCount++;
        if (userAssistantCount === RETAINED_TURNS) {
          splitIndex = i;
          break;
        }
      }
    }

    // Nếu không đủ số lượt chat thô để giữ lại, không cần tóm tắt
    if (splitIndex === -1) {
      return;
    }

    const summarizeEntries = contentEntries.slice(0, splitIndex);
    if (summarizeEntries.length === 0) {
      return;
    }

    const lastSummarizedEntry = summarizeEntries[summarizeEntries.length - 1];
    if (!lastSummarizedEntry) {
      return;
    }

    const tokensBefore = this.tokenCounter.estimateHistoryTokens(summarizeEntries);
    const historyText = this.formatHistoryForSummary(summarizeEntries);

    let summary = await this.llmService.summarize(historyText, 'session');

    // safety: trim, max 4000 chars
    if (summary.length > 4000) {
      summary = summary.slice(0, 4000) + '...';
    }

    await this.historyStore.append(sid, {
      type: 'checkpoint',
      timestamp: Date.now(),
      data: {
        summary,
        tokensBefore,
        entriesCovered: summarizeEntries.length,
        coveredUntilTimestamp: lastSummarizedEntry.timestamp,
      },
    });

    this.logger.log(
      { sid, tokensBefore, entries: summarizeEntries.length, coveredUntil: lastSummarizedEntry.timestamp },
      'Checkpoint saved',
    );
  }

  /**
   * Format history entries into readable text for summarizing.
   */
  formatHistoryForSummary(entries: HistoryEntry[]): string {
    const lines: string[] = [];
    for (const e of entries) {
      switch (e.type) {
        case 'user':
          lines.push(`User: ${e.data.text}`);
          if (e.data.ephemeralOOC) {
            lines.push(`(Ngữ cảnh: ${e.data.ephemeralOOC})`);
          }
          break;
        case 'assistant_batch':
          if (e.data.messages) {
            for (const m of e.data.messages) {
              const emotion = m.emotion ? ` (${m.emotion})` : '';
              lines.push(`${m.characterName}${emotion}: ${m.text}`);
            }
          }
          break;
        case 'persistent_ooc':
          lines.push(`[Bối cảnh: ${e.data.text}]`);
          break;
        case 'ephemeral_ooc':
          lines.push(`[OOC tạm: ${e.data.text}]`);
          break;
        case 'character_toggle': {
          const action = e.data.on ? 'xuất hiện trong cảnh' : 'rời khỏi cảnh';
          lines.push(`[Nhân vật: ${e.data.name} ${action}]`);
          break;
        }
        default:
          // skip system and checkpoint
          break;
      }
    }
    return lines.join('\n');
  }
}
