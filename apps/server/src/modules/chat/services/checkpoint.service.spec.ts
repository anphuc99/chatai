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
    it('should format user, assistant_batch, persistent_ooc, ephemeral_ooc, and character_toggle correctly and skip others', () => {
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
        { type: 'character_toggle', timestamp: 5, data: { characterId: 'c1', name: 'Mimi', on: true } },
        { type: 'character_toggle', timestamp: 6, data: { characterId: 'c1', name: 'Mimi', on: false } },
        { type: 'system', timestamp: 7, data: { storyId: 'story-1', activeCharacters: ['1'] } }, // should be skipped
      ];

      const result = service.formatHistoryForSummary(entries);
      expect(result).toBe(
        'User: Hello\n' +
        '(Ngữ cảnh: Shy)\n' +
        'Mimi (happy): Hi!\n' +
        'Narrator: Some narrative text\n' +
        '[Bối cảnh: Keep it friendly]\n' +
        '[OOC tạm: Temp detail]\n' +
        '[Nhân vật: Mimi xuất hiện trong cảnh]\n' +
        '[Nhân vật: Mimi rời khỏi cảnh]'
      );
    });
  });

  describe('maybeTriggerAsync & maybeTrigger', () => {
    it('should do nothing in maybeTrigger if tokens are below threshold', async () => {
      historyStore.estimateTokens.mockResolvedValue(1000);
      config.triggerThreshold.mockReturnValue(4800);

      await service.maybeTrigger('session-1');

      expect(historyStore.estimateTokens).toHaveBeenCalledWith('session-1');
      expect(redis.withLock).not.toHaveBeenCalled();
    });

    it('should lock with chat:lock key, double-check, and call createCheckpoint in maybeTrigger if tokens exceed threshold', async () => {
      historyStore.estimateTokens.mockResolvedValueOnce(5000); // 1st check
      historyStore.estimateTokens.mockResolvedValueOnce(5000); // 2nd check (inside lock)
      config.triggerThreshold.mockReturnValue(4800);

      const createCheckpointSpy = jest.spyOn(service, 'createCheckpoint').mockResolvedValue(undefined);

      await service.maybeTrigger('session-1');

      expect(redis.withLock).toHaveBeenCalledWith('chat:lock:session-1', 120000, expect.any(Function));
      expect(createCheckpointSpy).toHaveBeenCalledWith('session-1');
    });

    it('should skip checkpoint if double check token count falls below threshold', async () => {
      historyStore.estimateTokens.mockResolvedValueOnce(5000); // 1st check
      historyStore.estimateTokens.mockResolvedValueOnce(1000); // 2nd check
      config.triggerThreshold.mockReturnValue(4800);

      const createCheckpointSpy = jest.spyOn(service, 'createCheckpoint');

      await service.maybeTrigger('session-1');

      expect(createCheckpointSpy).not.toHaveBeenCalled();
    });

    it('should handle SESSION_LOCKED ConflictException without throwing', async () => {
      historyStore.estimateTokens.mockResolvedValue(5000);
      config.triggerThreshold.mockReturnValue(4800);
      redis.withLock.mockRejectedValue(new ConflictException('SESSION_LOCKED'));

      await expect(service.maybeTrigger('session-1')).resolves.not.toThrow();
      expect(redis.withLock).toHaveBeenCalled();
    });

    it('should handle concurrency: if two triggers run, only one creates checkpoint', async () => {
      historyStore.estimateTokens.mockResolvedValue(5000);
      config.triggerThreshold.mockReturnValue(4800);

      const createCheckpointSpy = jest.spyOn(service, 'createCheckpoint').mockResolvedValue(undefined);

      let lockAcquiredCount = 0;
      redis.withLock.mockImplementation(async (key: string, ttl: number, fn: () => Promise<any>) => {
        if (lockAcquiredCount === 0) {
          lockAcquiredCount++;
          await new Promise((resolve) => setTimeout(resolve, 50));
          return await fn();
        } else {
          throw new ConflictException('SESSION_LOCKED');
        }
      });

      const t1 = service.maybeTrigger('session-1');
      const t2 = service.maybeTrigger('session-1');

      await Promise.all([t1, t2]);

      expect(createCheckpointSpy).toHaveBeenCalledTimes(1);
    });

    it('should call maybeTrigger via setImmediate in maybeTriggerAsync', (done) => {
      const maybeTriggerSpy = jest.spyOn(service, 'maybeTrigger').mockResolvedValue(undefined);

      service.maybeTriggerAsync('session-1');

      setImmediate(() => {
        try {
          expect(maybeTriggerSpy).toHaveBeenCalledWith('session-1');
          done();
        } catch (e) {
          done(e);
        }
      });
    });
  });

  describe('createCheckpoint', () => {
    it('should read history since checkpoint, retain 10 user/assistant turns, summarize the rest and append checkpoint with coveredUntilTimestamp', async () => {
      const entries: HistoryEntry[] = [];
      for (let i = 0; i < 15; i++) {
        entries.push({
          type: i % 2 === 0 ? 'user' : 'assistant_batch',
          timestamp: i * 1000,
          data: i % 2 === 0 ? { text: `Msg ${i}` } : { messages: [{ characterName: 'Mimi', text: `Resp ${i}` }] },
        } as any);
      }

      historyStore.readSinceLastCheckpoint.mockResolvedValue(entries);
      tokenCounter.estimateHistoryTokens.mockReturnValue(200);
      llmService.summarize.mockResolvedValue('New checkpoint summary');

      await service.createCheckpoint('session-1');

      expect(historyStore.readSinceLastCheckpoint).toHaveBeenCalledWith('session-1');
      // RETAINED_TURNS = 10 -> splitIndex = 15 - 10 = 5.
      // summarizeEntries = entries.slice(0, 5) -> index 0 to 4.
      // Last summarized entry is index 4 (timestamp 4000).
      expect(tokenCounter.estimateHistoryTokens).toHaveBeenCalledWith(entries.slice(0, 5));
      expect(historyStore.append).toHaveBeenCalledWith('session-1', expect.objectContaining({
        type: 'checkpoint',
        data: expect.objectContaining({
          summary: 'New checkpoint summary',
          tokensBefore: 200,
          entriesCovered: 5,
          coveredUntilTimestamp: 4000,
        }),
      }));
    });

    it('should skip checkpoint if number of user/assistant entries is less than RETAINED_TURNS (10)', async () => {
      const entries: HistoryEntry[] = [
        { type: 'user', timestamp: 1, data: { text: 'Hello' } },
        { type: 'assistant_batch', timestamp: 2, data: { messages: [{ characterName: 'Mimi', text: 'Hi' }] } },
      ];
      historyStore.readSinceLastCheckpoint.mockResolvedValue(entries);

      await service.createCheckpoint('session-1');

      expect(llmService.summarize).not.toHaveBeenCalled();
      expect(historyStore.append).not.toHaveBeenCalled();
    });

    it('should truncate summary if it exceeds 4000 characters', async () => {
      const entries: HistoryEntry[] = [];
      for (let i = 0; i < 15; i++) {
        entries.push({
          type: i % 2 === 0 ? 'user' : 'assistant_batch',
          timestamp: i * 1000,
          data: i % 2 === 0 ? { text: `Msg ${i}` } : { messages: [{ characterName: 'Mimi', text: `Resp ${i}` }] },
        } as any);
      }
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
  });
});
