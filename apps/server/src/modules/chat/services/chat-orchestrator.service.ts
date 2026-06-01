import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
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
import { CheckpointService } from './checkpoint.service';
import { AssistantBatchSchema, AssistantMessage } from '../schemas/assistant-batch.schema';
import { MemoryService } from '../../memory/memory.service';
import { ChatContext } from '../types/chat-context';
import { Character, Prisma } from '@prisma/client';
import { TemplateLoader } from '@chatai/prompts';

const AUTO_PLACEHOLDER_MSG = '[AUTO]';

@Injectable()
export class ChatOrchestratorService {
  private readonly logger = new Logger(ChatOrchestratorService.name);
  private readonly autoOocTemplate: string;

  constructor(
    private readonly historyStore: HistoryStoreService,
    private readonly ooc: OocService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly llm: LlmService,
    private readonly prisma: PrismaService,
    private readonly firestore: FirestoreService,
    private readonly redis: RedisService,
    private readonly eventEmitter: EventEmitter2,
    private readonly checkpointService: CheckpointService,
    @Inject(forwardRef(() => MemoryService))
    private readonly memoryService: MemoryService,
  ) {
    this.autoOocTemplate = TemplateLoader.loadTemplate('auto_turn_ooc');
  }

  async handleUserTurn(
    ctx: ChatContext,
    userMessage: string,
    extraEphemeralOOC?: string,
    opts?: { isAuto?: boolean; skipMemory?: boolean },
  ): Promise<AssistantBatchDto> {
    const isAuto = opts?.isAuto ?? false;

    // Input validation (skipped for auto-generated content)
    if (!isAuto) {
      if (!userMessage || userMessage.length < 1 || userMessage.length > 2000) {
        throw new AppException(ERR.INVALID_PAYLOAD, 'User message length must be between 1 and 2000 characters');
      }
      if (extraEphemeralOOC && extraEphemeralOOC.length > 500) {
        throw new AppException(ERR.INVALID_PAYLOAD, 'Ephemeral OOC length must not exceed 500 characters');
      }
    }

    const ts = Date.now();

    // Append user entry to JSONL only for real user turns
    if (!isAuto) {
      await this.historyStore.append(ctx.sessionId, {
        type: 'user',
        timestamp: ts,
        data: { text: userMessage, ephemeralOOC: extraEphemeralOOC },
      });
    }

    try {
      // OOC pulls
      const persistentOOC = await this.ooc.getPersistent(ctx.sessionId);
      const ephemeralsFromQueue = await this.ooc.pullAllEphemeral(ctx.sessionId);
      const allEphemerals = extraEphemeralOOC
        ? [extraEphemeralOOC, ...ephemeralsFromQueue]
        : ephemeralsFromQueue;

      // Active characters + temporary characters
      const activeCharIds = await this.ooc.getActiveCharacters(ctx.sessionId);
      const characters: Character[] = activeCharIds.length > 0
        ? await this.prisma.character.findMany({
            where: { id: { in: activeCharIds } },
          })
        : [];
      const tempChars = await this.ooc.getTemporaries(ctx.sessionId);

      // Story
      const story = await this.prisma.story.findUnique({
        where: { id: ctx.storyId },
      });
      if (!story) {
        throw new AppException(ERR.NOT_FOUND, 'Story not found');
      }

      // User preferences
      const { hskLevel, narratorLanguage } = await this.fetchUserPreferences(ctx.userId);

      // Build system prompt
      const systemPrompt = this.promptBuilder.buildSystemPrompt({
        story: {
          title: story.title,
          initialSetting: story.initialSetting,
          currentProgress: story.currentProgress ?? '',
        },
        activeCharacters: characters as any,
        temporaryCharacters: tempChars,
        hskLevel,
        narratorLanguage,
      });

      // Parallel: history read + memory context retrieval
      // Skip RAG when there is no meaningful user query (auto turns use the '[AUTO]'
      // placeholder; shop-choice turns use canned strings) — embedding those would
      // only pull noisy context and waste an embed + Chroma query.
      const activeCharNames = characters.map((c) => c.name);
      const skipMemory = isAuto || opts?.skipMemory === true;
      const [history, memoryContext] = await Promise.all([
        this.historyStore.readSinceLastCheckpoint(ctx.sessionId),
        skipMemory
          ? Promise.resolve('')
          : this.safeRetrieveMemory(ctx.userId, ctx.storyId, userMessage, activeCharNames),
      ]);

      // For real user turns, exclude the just-appended user entry (it will be the final message)
      const historyForLLM = isAuto ? history : history.slice(0, -1);

      const llmMessages = this.promptBuilder.buildLlmMessages(
        systemPrompt,
        historyForLLM,
        userMessage,
        persistentOOC,
        allEphemerals,
        memoryContext || null,
      );

      // Call LLM
      const llmResp = await this.llm.chatJson(llmMessages, AssistantBatchSchema);

      // Append assistant batch into JSONL
      await this.historyStore.append(ctx.sessionId, {
        type: 'assistant_batch',
        timestamp: Date.now(),
        data: {
          messages: llmResp.content,
          triggerMemory: llmResp.triggerMemory ?? false,
        },
      });

      // Persist to DB
      const insertedAssistantMessages = await this.persistMessages(
        ctx.sessionId,
        userMessage,
        isAuto ? undefined : extraEphemeralOOC,
        llmResp.content,
        characters,
        isAuto,
      );

      // Emit events
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

      // Trigger checkpoint check asynchronously
      this.checkpointService.maybeTriggerAsync(ctx.sessionId);

      // Transform to DTO
      return this.transformToDto(insertedAssistantMessages, llmResp.triggerMemory ?? false, isAuto);
    } catch (error: any) {
      this.logger.error(`Failed to handle user turn for session ${ctx.sessionId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async handleAutoTurn(ctx: ChatContext): Promise<AssistantBatchDto> {
    return this.handleUserTurn(ctx, AUTO_PLACEHOLDER_MSG, this.autoOocTemplate, { isAuto: true });
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
    isAuto?: boolean,
  ): Promise<Prisma.MessageGetPayload<{}>[]> {
    return this.prisma.$transaction(async (tx) => {
      const maxAgg = await tx.message.aggregate({
        where: { sessionId },
        _max: { turnOrder: true },
      });
      const startOrder = (maxAgg._max.turnOrder ?? 0) + 1;

      // Skip user message for auto turns (placeholder is not a real user message)
      if (!isAuto) {
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
      }

      // Assistant messages
      const assistantStartOrder = isAuto ? startOrder : startOrder + 1;
      for (let i = 0; i < assistantMsgs.length; i++) {
        const m = assistantMsgs[i]!;
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
            turnOrder: assistantStartOrder + i,
            timestamp: BigInt(Date.now()),
          },
        });
      }

      // Re-query exact inserted records to return
      return tx.message.findMany({
        where: {
          sessionId,
          role: 'assistant',
          turnOrder: { gte: assistantStartOrder },
        },
        orderBy: { turnOrder: 'asc' },
        take: assistantMsgs.length,
      });
    });
  }

  private async safeRetrieveMemory(
    userId: string,
    storyId: string,
    userMessage: string,
    activeCharNames: string[],
  ): Promise<string> {
    const t0 = Date.now();
    try {
      const memoryContext = await this.memoryService.retrieveContext(
        userId,
        storyId,
        userMessage,
        activeCharNames,
      );
      this.logger.debug({
        msg: 'Memory context retrieved successfully',
        retrievalTimeMs: Date.now() - t0,
        contextLength: memoryContext.length,
      });
      return memoryContext;
    } catch (error: any) {
      this.logger.warn({
        msg: 'Failed to retrieve memory context, continuing with empty string',
        error: error.message || error,
        retrievalTimeMs: Date.now() - t0,
      });
      return '';
    }
  }

  private transformToDto(
    records: Prisma.MessageGetPayload<{}>[],
    triggerMemory: boolean,
    isAuto?: boolean,
  ): AssistantBatchDto {
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
      ...(isAuto ? { isAuto: true } : {}),
    };
  }
}
