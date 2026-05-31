import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ChatOrchestratorService } from './chat-orchestrator.service';
import { HistoryStoreService } from './history-store.service';
import { OocService } from './ooc.service';
import { PromptBuilderService } from './prompt-builder.service';
import { LlmService } from './llm.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { FirestoreService } from '../../../shared/firebase/firestore.service';
import { RedisService } from '../../../shared/redis/redis.service';
import { AppException, ERR } from '../../../shared/errors/app-exception';
import { EVENTS } from '../../../shared/events/event-names';
import { ChatContext } from '../types/chat-context';
import { CheckpointService } from './checkpoint.service';
import { MemoryService } from '../../memory/memory.service';

describe('ChatOrchestratorService', () => {
  let service: ChatOrchestratorService;
  let historyStoreMock: any;
  let oocMock: any;
  let promptBuilderMock: any;
  let llmMock: any;
  let prismaMock: any;
  let firestoreMock: any;
  let redisMock: any;
  let eventEmitterMock: any;
  let checkpointMock: any;
  let memoryMock: any;

  const ctx: ChatContext = {
    sessionId: '00000000-0000-0000-0000-000000000001',
    userId: 'user-123',
    storyId: 'story-123',
  };

  const mockPrismaTx = {
    message: {
      create: jest.fn().mockResolvedValue({}),
      aggregate: jest.fn().mockResolvedValue({
        _max: { turnOrder: 5 },
      }),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'msg-assistant-1',
          sessionId: ctx.sessionId,
          role: 'assistant',
          characterId: 'char-123',
          characterName: 'Mimi',
          text: '你好！',
          translation: 'Xin chào!',
          emotion: 'Happy',
          intensity: 'medium',
          words: null,
          shopEvent: null,
          turnOrder: 6,
          timestamp: BigInt(Date.now()),
        },
      ]),
    },
  };

  beforeEach(async () => {
    historyStoreMock = {
      append: jest.fn().mockResolvedValue(undefined),
      readSinceLastCheckpoint: jest.fn().mockResolvedValue([
        { type: 'user', timestamp: Date.now() - 1000, data: { text: 'Old msg' } },
        { type: 'user', timestamp: Date.now(), data: { text: 'Current msg' } },
      ]),
    };

    oocMock = {
      getPersistent: jest.fn().mockResolvedValue('Persistent OOC Content'),
      pullAllEphemeral: jest.fn().mockResolvedValue(['ephemeral queue msg']),
      getActiveCharacters: jest.fn().mockResolvedValue(['char-123']),
      getTemporaries: jest.fn().mockResolvedValue([
        { tempId: 'tmp_1', name: 'Bác bán rau', description: 'Friendly', createdAt: Date.now() },
      ]),
    };

    promptBuilderMock = {
      buildSystemPrompt: jest.fn().mockReturnValue('Builded System Prompt'),
      buildLlmMessages: jest.fn().mockReturnValue([
        { role: 'system', content: 'system message' },
        { role: 'user', content: 'user message' },
      ]),
    };

    llmMock = {
      chatJson: jest.fn().mockResolvedValue({
        content: [
          {
            characterName: 'Mimi',
            text: '你好！',
            translation: 'Xin chào!',
            emotion: 'Happy',
            intensity: 'medium',
            words: null,
            shopEvent: null,
          },
        ],
        triggerMemory: false,
      }),
    };

    prismaMock = {
      character: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'char-123',
            storyId: ctx.storyId,
            name: 'Mimi',
            age: 18,
            personality: 'Friendly',
            voiceName: 'voice_mimi',
          },
        ]),
      },
      story: {
        findUnique: jest.fn().mockResolvedValue({
          id: ctx.storyId,
          userId: ctx.userId,
          title: 'Cuộc phiêu lưu',
          initialSetting: 'Trong rừng',
          currentProgress: 'Bắt đầu',
        }),
      },
      message: {
        aggregate: jest.fn().mockResolvedValue({
          _max: { turnOrder: 5 },
        }),
      },
      $transaction: jest.fn().mockImplementation(async (cb) => cb(mockPrismaTx)),
    };

    firestoreMock = {
      getUserDoc: jest.fn().mockResolvedValue({
        email: 'user@example.com',
        displayName: 'John Doe',
        photoURL: '',
        hskLevel: 'HSK4',
        preferences: {
          narratorLanguage: 'vi',
          showPinyin: true,
          ttsSpeed: 1.0,
        },
        gems: 10,
        currentStreak: 2,
        highestStreak: 2,
        streakFreezeCount: 0,
      }),
    };

    redisMock = {
      cacheWrap: jest.fn().mockImplementation(async (key, ttl, factory) => factory()),
    };

    eventEmitterMock = {
      emit: jest.fn(),
    };

    checkpointMock = {
      maybeTriggerAsync: jest.fn(),
    };

    memoryMock = {
      retrieveContext: jest.fn().mockResolvedValue('Long-term memory context: Mimi likes apples.'),
    };

    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatOrchestratorService,
        { provide: HistoryStoreService, useValue: historyStoreMock },
        { provide: OocService, useValue: oocMock },
        { provide: PromptBuilderService, useValue: promptBuilderMock },
        { provide: LlmService, useValue: llmMock },
        { provide: PrismaService, useValue: prismaMock },
        { provide: FirestoreService, useValue: firestoreMock },
        { provide: RedisService, useValue: redisMock },
        { provide: EventEmitter2, useValue: eventEmitterMock },
        { provide: CheckpointService, useValue: checkpointMock },
        { provide: MemoryService, useValue: memoryMock },
      ],
    }).compile();

    service = module.get<ChatOrchestratorService>(ChatOrchestratorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleUserTurn', () => {
    it('should run successfully in a happy path', async () => {
      const result = await service.handleUserTurn(ctx, 'Hello there', 'ephemeral OOC');

      expect(historyStoreMock.append).toHaveBeenCalledTimes(2);
      expect(oocMock.getPersistent).toHaveBeenCalledWith(ctx.sessionId);
      expect(oocMock.pullAllEphemeral).toHaveBeenCalledWith(ctx.sessionId);
      expect(oocMock.getActiveCharacters).toHaveBeenCalledWith(ctx.sessionId);
      expect(oocMock.getTemporaries).toHaveBeenCalledWith(ctx.sessionId);
      expect(prismaMock.character.findMany).toHaveBeenCalled();
      expect(prismaMock.story.findUnique).toHaveBeenCalledWith({ where: { id: ctx.storyId } });
      expect(redisMock.cacheWrap).toHaveBeenCalled();
      expect(firestoreMock.getUserDoc).toHaveBeenCalledWith(ctx.userId);

      expect(promptBuilderMock.buildSystemPrompt).toHaveBeenCalled();
      expect(historyStoreMock.readSinceLastCheckpoint).toHaveBeenCalledWith(ctx.sessionId);
      expect(memoryMock.retrieveContext).toHaveBeenCalledWith(
        ctx.userId,
        ctx.storyId,
        'Hello there',
        ['Mimi'],
      );
      expect(promptBuilderMock.buildLlmMessages).toHaveBeenCalledWith(
        'Builded System Prompt',
        expect.any(Array),
        'Hello there',
        'Persistent OOC Content',
        expect.any(Array),
        'Long-term memory context: Mimi likes apples.',
      );
      expect(llmMock.chatJson).toHaveBeenCalled();

      // Verify transaction persisted user & assistant
      expect(prismaMock.$transaction).toHaveBeenCalled();

      // Verify DTO return format
      expect(result).toEqual({
        messages: [
          {
            id: 'msg-assistant-1',
            characterId: 'char-123',
            characterName: 'Mimi',
            text: '你好！',
            translation: 'Xin chào!',
            emotion: 'Happy',
            intensity: 'medium',
            words: null,
            shopEvent: null,
            timestamp: expect.any(Number),
          },
        ],
        triggerMemory: false,
      });

      // Verify events emitted
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(EVENTS.USER_SENT_MESSAGE, {
        sessionId: ctx.sessionId,
        userId: ctx.userId,
        text: 'Hello there',
      });
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(EVENTS.ASSISTANT_REPLIED, {
        sessionId: ctx.sessionId,
        userId: ctx.userId,
        batch: {
          content: [
            {
              characterName: 'Mimi',
              text: '你好！',
              translation: 'Xin chào!',
              emotion: 'Happy',
              intensity: 'medium',
              words: null,
              shopEvent: null,
            },
          ],
          triggerMemory: false,
        },
        triggerMemory: false,
      });

      // Verify checkpoint check was triggered
      expect(checkpointMock.maybeTriggerAsync).toHaveBeenCalledWith(ctx.sessionId);
    });

    it('should throw INVALID_PAYLOAD if userMessage is empty or too long', async () => {
      await expect(service.handleUserTurn(ctx, '')).rejects.toThrow(
        new AppException(ERR.INVALID_PAYLOAD, 'User message length must be between 1 and 2000 characters'),
      );

      const tooLongMsg = 'a'.repeat(2001);
      await expect(service.handleUserTurn(ctx, tooLongMsg)).rejects.toThrow(
        new AppException(ERR.INVALID_PAYLOAD, 'User message length must be between 1 and 2000 characters'),
      );
    });

    it('should throw INVALID_PAYLOAD if ephemeralOOC is too long', async () => {
      const tooLongOOC = 'ooc'.repeat(200); // 600 chars
      await expect(service.handleUserTurn(ctx, 'valid msg', tooLongOOC)).rejects.toThrow(
        new AppException(ERR.INVALID_PAYLOAD, 'Ephemeral OOC length must not exceed 500 characters'),
      );
    });

    it('should throw NOT_FOUND if story is missing', async () => {
      prismaMock.story.findUnique.mockResolvedValue(null);

      await expect(service.handleUserTurn(ctx, 'Hello')).rejects.toThrow(
        new AppException(ERR.NOT_FOUND, 'Story not found'),
      );
    });

    it('should bubble up LLM exceptions and not call persist transaction', async () => {
      llmMock.chatJson.mockRejectedValue(new AppException(ERR.LLM_UNAVAILABLE));

      await expect(service.handleUserTurn(ctx, 'Hello')).rejects.toThrow(
        new AppException(ERR.LLM_UNAVAILABLE),
      );

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('should use default preferences if user profile does not exist', async () => {
      firestoreMock.getUserDoc.mockResolvedValue(null);

      await service.handleUserTurn(ctx, 'Hello');

      expect(promptBuilderMock.buildSystemPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          hskLevel: 'HSK3',
          narratorLanguage: 'vi',
        }),
      );
    });

    it('should degrade gracefully if memory retrieval fails', async () => {
      memoryMock.retrieveContext.mockRejectedValue(new Error('Chroma DB connection error'));

      const result = await service.handleUserTurn(ctx, 'Hello there', 'ephemeral OOC');

      // Test still completes successfully
      expect(result).toBeDefined();
      expect(historyStoreMock.readSinceLastCheckpoint).toHaveBeenCalledWith(ctx.sessionId);
      expect(memoryMock.retrieveContext).toHaveBeenCalled();
      
      // promptBuilder should receive null as memoryContext
      expect(promptBuilderMock.buildLlmMessages).toHaveBeenCalledWith(
        'Builded System Prompt',
        expect.any(Array),
        'Hello there',
        'Persistent OOC Content',
        expect.any(Array),
        null,
      );
    });
  });
});
