import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AssistantBatchDto, HskLevel, NarratorLanguage } from '@chatai/shared-types';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { FirestoreService } from '../../../shared/firebase/firestore.service';
import { RedisService } from '../../../shared/redis/redis.service';
import { AppException, ERR } from '../../../shared/errors/app-exception';
import { EVENTS } from '../../../shared/events/event-names';
import { HistoryStoreService } from './history-store.service';
import { OocService } from './ooc.service';
import { PromptBuilderService } from './prompt-builder.service';
import { LlmService } from './llm.service';
import { AssistantBatchSchema, AssistantMessage } from '../schemas/assistant-batch.schema';
import { ChatContext } from '../types/chat-context';
import { Character, Prisma } from '@prisma/client';

@Injectable()
export class ChatOrchestratorService {
  private readonly logger = new Logger(ChatOrchestratorService.name);

  constructor(
    private readonly historyStore: HistoryStoreService,
    private readonly ooc: OocService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly llm: LlmService,
    private readonly prisma: PrismaService,
    private readonly firestore: FirestoreService,
    private readonly redis: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async handleUserTurn(
    ctx: ChatContext,
    userMessage: string,
    ephemeralOOC?: string,
  ): Promise<AssistantBatchDto> {
    // 1. Input validation
    if (!userMessage || userMessage.length < 1 || userMessage.length > 2000) {
      throw new AppException(ERR.INVALID_PAYLOAD, 'User message length must be between 1 and 2000 characters');
    }
    if (ephemeralOOC && ephemeralOOC.length > 500) {
      throw new AppException(ERR.INVALID_PAYLOAD, 'Ephemeral OOC length must not exceed 500 characters');
    }

    const ts = Date.now();

    // 2. Append user entry to JSONL
    await this.historyStore.append(ctx.sessionId, {
      type: 'user',
      timestamp: ts,
      data: { text: userMessage, ephemeralOOC },
    });

    try {
      // 3. OOC pulls
      const persistentOOC = await this.ooc.getPersistent(ctx.sessionId);
      const ephemeralsFromQueue = await this.ooc.pullAllEphemeral(ctx.sessionId);
      const allEphemerals = ephemeralOOC
        ? [ephemeralOOC, ...ephemeralsFromQueue]
        : ephemeralsFromQueue;

      // 4. Active characters + temporary characters
      const activeCharIds = await this.ooc.getActiveCharacters(ctx.sessionId);
      const characters: Character[] = activeCharIds.length > 0
        ? await this.prisma.character.findMany({
            where: { id: { in: activeCharIds } },
          })
        : [];
      const tempChars = await this.ooc.getTemporaries(ctx.sessionId);

      // 5. Story
      const story = await this.prisma.story.findUnique({
        where: { id: ctx.storyId },
      });
      if (!story) {
        throw new AppException(ERR.NOT_FOUND, 'Story not found');
      }

      // 6. User preferences
      const { hskLevel, narratorLanguage } = await this.fetchUserPreferences(ctx.userId);

      // 7. Build prompts
      const systemPrompt = this.promptBuilder.buildSystemPrompt({
        story: {
          title: story.title,
          initialSetting: story.initialSetting,
          currentProgress: story.currentProgress ?? '',
        },
        activeCharacters: characters,
        temporaryCharacters: tempChars,
        hskLevel,
        narratorLanguage,
      });

      const history = await this.historyStore.readSinceLastCheckpoint(ctx.sessionId);
      // Exclude the just-appended user entry from history (will be appended as final user message in messages array)
      const historyForLLM = history.slice(0, -1);

      const llmMessages = this.promptBuilder.buildLlmMessages(
        systemPrompt,
        historyForLLM,
        userMessage,
        persistentOOC,
        allEphemerals,
        null, // memoryContext: Phase 8 wire
      );

      // 8. Call LLM
      const llmResp = await this.llm.chatJson(llmMessages, AssistantBatchSchema);

      // 9. Append assistant batch into JSONL
      await this.historyStore.append(ctx.sessionId, {
        type: 'assistant_batch',
        timestamp: Date.now(),
        data: {
          messages: llmResp.content,
          triggerMemory: llmResp.triggerMemory ?? false,
        },
      });

      // 10. Persist to DB
      const insertedAssistantMessages = await this.persistMessages(
        ctx.sessionId,
        userMessage,
        ephemeralOOC,
        llmResp.content,
        characters,
      );

      // 11. Emit events
      this.eventEmitter.emit(EVENTS.USER_SENT_MESSAGE, {
        sessionId: ctx.sessionId,
        userId: ctx.userId,
        text: userMessage,
      });
      this.eventEmitter.emit(EVENTS.ASSISTANT_REPLIED, {
        sessionId: ctx.sessionId,
        userId: ctx.userId,
        batch: llmResp,
        triggerMemory: llmResp.triggerMemory ?? false,
      });

      // 12. Transform to DTO
      return this.transformToDto(insertedAssistantMessages, llmResp.triggerMemory ?? false);
    } catch (error: any) {
      this.logger.error(`Failed to handle user turn for session ${ctx.sessionId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async fetchUserPreferences(
    uid: string,
  ): Promise<{ hskLevel: HskLevel; narratorLanguage: NarratorLanguage }> {
    const key = `user:prefs:${uid}`;
    return this.redis.cacheWrap(key, 60, async () => {
      const doc = await this.firestore.getUserDoc(uid);
      if (!doc) {
        return { hskLevel: 'HSK3' as HskLevel, narratorLanguage: 'vi' as NarratorLanguage };
      }
      return {
        hskLevel: doc.hskLevel ?? ('HSK3' as HskLevel),
        narratorLanguage: doc.preferences?.narratorLanguage ?? ('vi' as NarratorLanguage),
      };
    });
  }

  private async persistMessages(
    sessionId: string,
    userText: string,
    ephemeralOOC: string | undefined,
    assistantMsgs: AssistantMessage[],
    characters: Character[],
  ): Promise<Prisma.MessageGetPayload<{}>[]> {
    return this.prisma.$transaction(async (tx) => {
      const maxAgg = await tx.message.aggregate({
        where: { sessionId },
        _max: { turnOrder: true },
      });
      const startOrder = (maxAgg._max.turnOrder ?? 0) + 1;

      // User message
      await tx.message.create({
        data: {
          sessionId,
          role: 'user',
          text: userText,
          characterId: null,
          characterName: null,
          translation: null,
          emotion: null,
          intensity: null,
          turnOrder: startOrder,
          timestamp: BigInt(Date.now()),
        },
      });

      // Ephemeral OOC message if exists
      if (ephemeralOOC) {
        await tx.message.create({
          data: {
            sessionId,
            role: 'ephemeral_ooc',
            text: ephemeralOOC,
            characterId: null,
            characterName: null,
            translation: null,
            emotion: null,
            intensity: null,
            turnOrder: startOrder,
            timestamp: BigInt(Date.now()),
          },
        });
      }

      // Assistant messages
      for (let i = 0; i < assistantMsgs.length; i++) {
        const m = assistantMsgs[i];
        const matchedChar = characters.find((c) => c.name === m.characterName);
        const characterId = matchedChar ? matchedChar.id : null;

        await tx.message.create({
          data: {
            sessionId,
            role: 'assistant',
            characterId,
            characterName: m.characterName,
            text: m.text,
            translation: m.translation ?? null,
            emotion: m.emotion ?? null,
            intensity: m.intensity ?? null,
            words: m.words ?? undefined,
            shopEvent: m.shopEvent ?? undefined,
            turnOrder: startOrder + 1 + i,
            timestamp: BigInt(Date.now()),
          },
        });
      }

      // Re-query exact inserted records to return
      return tx.message.findMany({
        where: {
          sessionId,
          role: 'assistant',
          turnOrder: { gte: startOrder + 1 },
        },
        orderBy: { turnOrder: 'asc' },
        take: assistantMsgs.length,
      });
    });
  }

  private transformToDto(records: Prisma.MessageGetPayload<{}>[], triggerMemory: boolean): AssistantBatchDto {
    return {
      messages: records.map((r) => ({
        id: r.id,
        characterId: r.characterId,
        characterName: r.characterName,
        text: r.text,
        translation: r.translation,
        emotion: r.emotion,
        intensity: r.intensity,
        words: r.words as any,
        shopEvent: r.shopEvent as any,
        timestamp: Number(r.timestamp),
      })),
      triggerMemory,
    };
  }
}
