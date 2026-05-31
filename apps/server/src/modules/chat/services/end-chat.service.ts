import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { RedisService } from '../../../shared/redis/redis.service';
import { AppException, ERR } from '../../../shared/errors/app-exception';
import { EVENTS } from '../../../shared/events/event-names';
import { HistoryStoreService } from './history-store.service';
import { OocService } from './ooc.service';
import { LlmService } from './llm.service';
import { EndChatResultDto as EndChatResult } from '@chatai/shared-types';
import { HistoryEntry } from '../types/history-entry';

@Injectable()
export class EndChatService {
  private readonly logger = new Logger(EndChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly eventEmitter: EventEmitter2,
    private readonly historyStore: HistoryStoreService,
    private readonly oocService: OocService,
    private readonly llmService: LlmService,
  ) {}

  /**
   * Main execution logic for ending a chat session.
   */
  async execute(sid: string, uid: string): Promise<EndChatResult> {
    const session = await this.loadAndValidateSession(sid, uid);

    if (session.status === 'ended') {
      const cached = await this.loadCachedResult(sid);
      if (cached) {
        return { ...cached, alreadyEnded: true };
      }
      return this.reconstructFromDB(session);
    }

    try {
      return await this.redis.withLock(`chat:lock:${sid}`, 120000, async () => {
        // Re-check status after acquiring lock
        const s2 = await this.prisma.session.findUnique({ where: { id: sid } });
        if (!s2) {
          throw new AppException(ERR.NOT_FOUND, 'Session not found');
        }
        if (s2.status === 'ended') {
          return this.reconstructFromDB(s2);
        }

        const entries = await this.historyStore.readAll(sid);
        const msgCount = await this.prisma.message.count({ where: { sessionId: sid } });

        const hasConversation = entries.some(
          (e) => e.type === 'user' || e.type === 'assistant_batch',
        );

        if (!hasConversation && msgCount === 0) {
          // Empty session edge case
          await this.prisma.session.update({
            where: { id: sid },
            data: {
              status: 'ended',
              summary: '(Phiên trống)',
              endedAt: BigInt(Date.now()),
            },
          });
          
          await this.cleanup(sid);

          const ts = Date.now();
          this.eventEmitter.emit(EVENTS.SESSION_ENDED, {
            sessionId: sid,
            userId: uid,
            storyId: session.storyId,
            endedAt: ts,
          });
          // Note: Intentionally skipping MEMORY_TRIGGER for empty sessions

          const result: EndChatResult = {
            journalSessionId: sid,
            summary: '(Phiên trống)',
            messageCount: 0,
            alreadyEnded: false,
          };
          await this.cacheResult(sid, result);
          return result;
        }

        const { plotSummary, sessionSummary } = await this.summarizeBoth(entries);

        const commitResult = await this.commit(
          sid,
          session.storyId,
          plotSummary,
          sessionSummary,
        );

        await this.cleanup(sid);

        this.emitDomainEvents(sid, uid, session.storyId);

        const result: EndChatResult = {
          journalSessionId: sid,
          summary: sessionSummary,
          messageCount: commitResult.messageCount,
          alreadyEnded: false,
        };

        await this.cacheResult(sid, result);
        return result;
      });
    } catch (error: any) {
      if (error instanceof ConflictException && error.message === 'SESSION_LOCKED') {
        throw new AppException(ERR.SESSION_LOCKED, 'End already in progress');
      }
      throw error;
    }
  }

  private async loadAndValidateSession(sid: string, uid: string) {
    const s = await this.prisma.session.findUnique({ where: { id: sid } });
    if (!s) {
      throw new AppException(ERR.NOT_FOUND, 'Session not found');
    }
    if (s.userId !== uid) {
      throw new AppException(ERR.FORBIDDEN, 'Access denied');
    }
    return s;
  }

  private async reconstructFromDB(session: any): Promise<EndChatResult> {
    const msgCount = await this.prisma.message.count({ where: { sessionId: session.id } });
    return {
      journalSessionId: session.id,
      summary: session.summary ?? '',
      messageCount: msgCount,
      alreadyEnded: true,
    };
  }

  private async summarizeBoth(entries: HistoryEntry[]) {
    const [plotRaw, sessionRaw] = await Promise.all([
      this.llmService.summarize(this.formatForPlot(entries), 'plot'),
      this.llmService.summarize(this.formatForOverview(entries), 'session'),
    ]);

    let plotSummary = plotRaw;
    let sessionSummary = sessionRaw;

    if (plotSummary.length > 2000) {
      plotSummary = plotSummary.slice(0, 2000) + '...';
    }
    if (sessionSummary.length > 4000) {
      sessionSummary = sessionSummary.slice(0, 4000) + '...';
    }

    return { plotSummary, sessionSummary };
  }

  private formatForPlot(entries: HistoryEntry[]): string {
    const lines: string[] = [];
    for (const e of entries) {
      if (!e) continue;
      switch (e.type) {
        case 'checkpoint':
          lines.unshift(`[TÓM TẮT TRƯỚC ĐÓ]: ${e.data.summary}`);
          break;
        case 'user':
          lines.push(`(Người chơi): ${e.data.text}`);
          break;
        case 'assistant_batch':
          if (e.data.messages) {
            for (const m of e.data.messages) {
              lines.push(`${m.characterName}: ${m.text}`);
            }
          }
          break;
        default:
          break;
      }
    }
    return lines.join('\n');
  }

  private formatForOverview(entries: HistoryEntry[]): string {
    const lines: string[] = [];
    for (const e of entries) {
      if (!e) continue;
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
          break;
      }
    }
    return lines.join('\n');
  }

  private async commit(
    sid: string,
    storyId: string,
    plotSummary: string,
    sessionSummary: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.session.update({
        where: { id: sid },
        data: {
          status: 'ended',
          summary: sessionSummary,
          endedAt: BigInt(Date.now()),
        },
      });

      const story = await tx.story.findUniqueOrThrow({
        where: { id: storyId },
        select: { currentProgress: true },
      });

      const newProgress = story.currentProgress
        ? `${story.currentProgress}\n\n---\n${plotSummary}`
        : plotSummary;

      const trimmedProgress =
        newProgress.length > 50000 ? newProgress.slice(-50000) : newProgress;

      await tx.story.update({
        where: { id: storyId },
        data: { currentProgress: trimmedProgress },
      });

      const messageCount = await tx.message.count({
        where: { sessionId: sid },
      });

      return { messageCount };
    });
  }

  private async cleanup(sid: string) {
    try {
      await this.historyStore.cleanup(sid);
    } catch (error) {
      this.logger.warn(`Failed to cleanup history file for session ${sid}:`, error);
    }

    try {
      await this.oocService.cleanupSession(sid);
    } catch (error) {
      this.logger.warn(`Failed to cleanup OOC keys for session ${sid}:`, error);
    }
  }

  private emitDomainEvents(sid: string, uid: string, storyId: string) {
    const ts = Date.now();
    this.eventEmitter.emit(EVENTS.SESSION_ENDED, {
      sessionId: sid,
      userId: uid,
      storyId,
      endedAt: ts,
    });
    this.eventEmitter.emit(EVENTS.MEMORY_TRIGGER, {
      sessionId: sid,
      userId: uid,
      type: 'plot',
    });
  }

  private async cacheResult(sid: string, result: EndChatResult) {
    const key = `endchat:result:${sid}`;
    const TTL_1H = 3600;
    await this.redis.setJson(key, result, TTL_1H);
  }

  private async loadCachedResult(sid: string): Promise<EndChatResult | null> {
    const key = `endchat:result:${sid}`;
    return this.redis.getJson<EndChatResult>(key);
  }
}
