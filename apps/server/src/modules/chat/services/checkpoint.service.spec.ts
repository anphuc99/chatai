import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { CheckpointService } from './checkpoint.service';
import { HistoryStoreService } from './history-store.service';
import { TokenCounterService } from './token-counter.service';
import { LlmService } from './llm.service';
import { RedisService } from '../../../shared/redis/redis.service';
import { ChatConfig } from '../../../config/chat.config';
import { HistoryEntry } from '../types/history-entry';

describe('CheckpointService', () => {
  let service: CheckpointService;
  let historyStore: jest.Mocked<HistoryStoreService>;
  let tokenCounter: jest.Mocked<TokenCounterService>;
  let llmService: jest.Mocked<LlmService>;
  let redis: jest.Mocked<RedisService>;
  let config: jest.Mocked<ChatConfig>;

  beforeEach(async () => {
    const mockHistoryStore = {
      estimateTokens: jest.fn(),
      readSinceLastCheckpoint: jest.fn(),
      append: jest.fn(),
    };
    const mockTokenCounter = {
      estimateHistoryTokens: jest.fn(),
    };
    const mockLlmService = {
      summarize: jest.fn(),
    };
    const mockRedis = {
      withLock: jest.fn().mockImplementation(async (key: string, ttl: number, fn: () => Promise<any>) => {
        return await fn();
      }),
    };
    const mockChatConfig = {
      triggerThreshold: jest.fn().mockReturnValue(4800),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckpointService,
        { provide: HistoryStoreService, useValue: mockHistoryStore },
        { provide: TokenCounterService, useValue: mockTokenCounter },
        { provide: LlmService, useValue: mockLlmService },
        { provide: RedisService, useValue: mockRedis },
        { provide: ChatConfig, useValue: mockChatConfig },
      ],
    }).compile();

    service = module.get<CheckpointService>(CheckpointService);
    historyStore = module.get(HistoryStoreService);
    tokenCounter = module.get(TokenCounterService);
    llmService = module.get(LlmService);
    redis = module.get(RedisService);
    config = module.get(ChatConfig);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('formatHistoryForSummary', () => {
    it('should format user, assistant_batch, persistent_ooc, ephemeral_ooc correctly and skip others', () => {
      const entries: HistoryEntry[] = [
        { type: 'user', timestamp: 1, data: { text: 'Hello', ephemeralOOC: 'Shy' } },
        {
          type: 'assistant_batch',
          timestamp: 2,
          data: {
            messages: [
              { characterName: 'Mimi', emotion: 'happy', text: 'Hi!' },
              { characterName: 'Narrator', text: 'Some narrative text' },
            ],
          },
        },
        { type: 'persistent_ooc', timestamp: 3, data: { text: 'Keep it friendly' } },
        { type: 'ephemeral_ooc', timestamp: 4, data: { text: 'Temp detail' } },
        { type: 'system', timestamp: 5, data: { storyId: 'story-1', activeCharacters: ['1'] } }, // should be skipped
      ];

      const result = service.formatHistoryForSummary(entries);
      expect(result).toBe(
        'User: Hello\n' +
        '(Ngữ cảnh: Shy)\n' +
        'Mimi (happy): Hi!\n' +
        'Narrator: Some narrative text\n' +
        '[Bối cảnh: Keep it friendly]\n' +
        '[OOC tạm: Temp detail]'
      );
    });
  });

  describe('maybeTriggerAsync', () => {
    it('should do nothing in maybeTriggerAsync if tokens are below threshold', (done) => {
      historyStore.estimateTokens.mockResolvedValue(1000);
      config.triggerThreshold.mockReturnValue(4800);

      service.maybeTriggerAsync('session-1');

      setImmediate(() => {
        try {
          expect(historyStore.estimateTokens).toHaveBeenCalledWith('session-1');
          expect(redis.withLock).not.toHaveBeenCalled();
          done();
        } catch (e) {
          done(e);
        }
      });
    });

    it('should lock, double-check, and call createCheckpoint in maybeTriggerAsync if tokens exceed threshold', (done) => {
      historyStore.estimateTokens.mockResolvedValueOnce(5000); // 1st check
      historyStore.estimateTokens.mockResolvedValueOnce(5000); // 2nd check (inside lock)
      config.triggerThreshold.mockReturnValue(4800);
      
      const createCheckpointSpy = jest.spyOn(service, 'createCheckpoint').mockResolvedValue(undefined);

      service.maybeTriggerAsync('session-1');

      setImmediate(() => {
        try {
          expect(redis.withLock).toHaveBeenCalledWith('chat:ckpt-lock:session-1', 120000, expect.any(Function));
          expect(createCheckpointSpy).toHaveBeenCalledWith('session-1');
          done();
        } catch (e) {
          done(e);
        }
      });
    });

    it('should skip checkpoint if double check token count falls below threshold', (done) => {
      historyStore.estimateTokens.mockResolvedValueOnce(5000); // 1st check
      historyStore.estimateTokens.mockResolvedValueOnce(1000); // 2nd check
      config.triggerThreshold.mockReturnValue(4800);
      
      const createCheckpointSpy = jest.spyOn(service, 'createCheckpoint');

      service.maybeTriggerAsync('session-1');

      setImmediate(() => {
        try {
          expect(createCheckpointSpy).not.toHaveBeenCalled();
          done();
        } catch (e) {
          done(e);
        }
      });
    });

    it('should handle SESSION_LOCKED ConflictException without throwing', (done) => {
      historyStore.estimateTokens.mockResolvedValue(5000);
      config.triggerThreshold.mockReturnValue(4800);
      redis.withLock.mockRejectedValue(new ConflictException('SESSION_LOCKED'));

      service.maybeTriggerAsync('session-1');

      setImmediate(() => {
        try {
          expect(redis.withLock).toHaveBeenCalled();
          done();
        } catch (e) {
          done(e);
        }
      });
    });
  });

  describe('createCheckpoint', () => {
    it('should read history since checkpoint, filter out first checkpoint if any, call LLM to summarize, and append checkpoint', async () => {
      const entries: HistoryEntry[] = [
        { type: 'checkpoint', timestamp: 0, data: { summary: 'Old summary', tokensBefore: 100, entriesCovered: 2 } },
        { type: 'user', timestamp: 1, data: { text: 'New message' } },
      ];
      historyStore.readSinceLastCheckpoint.mockResolvedValue(entries);
      tokenCounter.estimateHistoryTokens.mockReturnValue(200);
      llmService.summarize.mockResolvedValue('New checkpoint summary');

      await service.createCheckpoint('session-1');

      expect(historyStore.readSinceLastCheckpoint).toHaveBeenCalledWith('session-1');
      expect(tokenCounter.estimateHistoryTokens).toHaveBeenCalledWith([entries[1]]);
      expect(llmService.summarize).toHaveBeenCalledWith('User: New message', 'session');
      expect(historyStore.append).toHaveBeenCalledWith('session-1', expect.objectContaining({
        type: 'checkpoint',
        data: {
          summary: 'New checkpoint summary',
          tokensBefore: 200,
          entriesCovered: 1,
        },
      }));
    });

    it('should truncate summary if it exceeds 4000 characters', async () => {
      const entries: HistoryEntry[] = [
        { type: 'user', timestamp: 1, data: { text: 'Msg' } },
      ];
      historyStore.readSinceLastCheckpoint.mockResolvedValue(entries);
      tokenCounter.estimateHistoryTokens.mockReturnValue(100);
      
      const longSummary = 'A'.repeat(5000);
      llmService.summarize.mockResolvedValue(longSummary);

      await service.createCheckpoint('session-1');

      expect(historyStore.append).toHaveBeenCalledWith('session-1', expect.objectContaining({
        type: 'checkpoint',
        data: expect.objectContaining({
          summary: 'A'.repeat(4000) + '...',
        }),
      }));
    });

    it('should return early and not call LLM or append if content entries are empty', async () => {
      const entries: HistoryEntry[] = [
        { type: 'checkpoint', timestamp: 0, data: { summary: 'Old summary', tokensBefore: 100, entriesCovered: 2 } },
      ];
      historyStore.readSinceLastCheckpoint.mockResolvedValue(entries);

      await service.createCheckpoint('session-1');

      expect(llmService.summarize).not.toHaveBeenCalled();
      expect(historyStore.append).not.toHaveBeenCalled();
    });
  });
});
