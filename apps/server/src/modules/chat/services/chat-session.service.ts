import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { OwnershipService } from '../../../shared/ownership/ownership.service';
import { OocService } from './ooc.service';
import { HistoryStoreService } from './history-store.service';
import { AppException, ERR } from '../../../shared/errors/app-exception';
import { SessionResultDto, HydratedHistoryDto, MessageDto } from '@chatai/shared-types';
import { Session } from '@prisma/client';

@Injectable()
export class ChatSessionService {
  private readonly logger = new Logger(ChatSessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ooc: OocService,
    private readonly historyStore: HistoryStoreService,
    private readonly ownership: OwnershipService,
  ) {}

  async findOrStart(userId: string, storyId: string): Promise<SessionResultDto> {
    await this.ownership.assertStoryOwner(userId, storyId);

    const activeSession = await this.prisma.session.findFirst({
      where: { userId, storyId, status: 'active' },
    });

    if (activeSession) {
      let activeCharIds = await this.ooc.getActiveCharacters(activeSession.id);
      if (activeCharIds.length === 0) {
        this.logger.warn(`Session ${activeSession.id} Redis chars expired, rehydrating from story`);
        // Redis may have expired (24h TTL) → rehydrate from story characters
        const allChars = await this.prisma.character.findMany({
          where: { storyId },
          select: { id: true },
        });
        const allCharIds = allChars.map((c) => c.id);
        await this.ooc.setActiveCharacters(activeSession.id, allCharIds);
        activeCharIds = allCharIds;
      }
      return {
        sessionId: activeSession.id,
        isResumed: true,
        initialActiveCharacters: activeCharIds,
      };
    } else {
      const newSession = await this.initSession(userId, storyId);
      const allChars = await this.prisma.character.findMany({
        where: { storyId },
        select: { id: true },
      });
      const allCharIds = allChars.map((c) => c.id);
      await this.ooc.setActiveCharacters(newSession.id, allCharIds);

      await this.historyStore.append(newSession.id, {
        type: 'system',
        timestamp: Date.now(),
        data: {
          storyId,
          activeCharacters: allCharIds,
          note: 'session start',
        },
      });

      return {
        sessionId: newSession.id,
        isResumed: false,
        initialActiveCharacters: allCharIds,
      };
    }
  }

  async getSessionForUser(userId: string, sid: string): Promise<Session> {
    const s = await this.prisma.session.findUnique({
      where: { id: sid },
    });
    if (!s) {
      throw new AppException(ERR.SESSION_NOT_FOUND);
    }
    if (s.userId !== userId) {
      throw new AppException(ERR.FORBIDDEN);
    }
    return s;
  }

  async getHistoryHydrated(sid: string): Promise<HydratedHistoryDto> {
    const entries = await this.historyStore.readAll(sid);
    const messages: MessageDto[] = [];

    for (const entry of entries) {
      switch (entry.type) {
        case 'user':
          messages.push({
            role: 'user',
            text: entry.data.text,
            timestamp: entry.timestamp,
          });
          break;
        case 'assistant_batch':
          if (entry.data.messages) {
            for (const m of entry.data.messages) {
              messages.push({
                role: 'assistant',
                characterName: m.characterName,
                text: m.text,
                translation: m.translation,
                emotion: m.emotion,
                intensity: m.intensity,
                words: m.words,
                shopEvent: m.shopEvent,
                timestamp: entry.timestamp,
              });
            }
          }
          break;
        case 'persistent_ooc':
        case 'ephemeral_ooc':
          messages.push({
            role: entry.type,
            text: entry.data.text,
            timestamp: entry.timestamp,
          });
          break;
        case 'checkpoint':
          messages.push({
            role: 'system',
            text: `[Tóm tắt: ${entry.data.summary}]`,
            timestamp: entry.timestamp,
          });
          break;
        case 'system':
          // Skip system logging
          break;
      }
    }

    const persistentOOC = await this.ooc.getPersistent(sid);
    const activeCharacters = await this.ooc.getActiveCharacters(sid);

    return {
      messages,
      persistentOOC,
      activeCharacters,
    };
  }

  private async initSession(userId: string, storyId: string): Promise<Session> {
    return this.prisma.session.create({
      data: {
        userId,
        storyId,
        status: 'active',
        startedAt: BigInt(Date.now()),
      },
    });
  }
}
