import { Test, TestingModule } from '@nestjs/testing';
import { MemoryService } from './memory.service';
import { ChromaClient } from './chroma.client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import { EmbeddingService } from './embedding.service';
import { LlmService } from '../chat/services/llm.service';
import { MultiQueryGenerator } from './services/multi-query-generator';
import { SlidingWindow } from './services/sliding-window';
import { getQueueToken } from '@nestjs/bullmq';
import { MemoryChunk } from './types/memory-document';

describe('MemoryService', () => {
  let service: MemoryService;
  let chroma: jest.Mocked<ChromaClient>;
  let embeddingService: jest.Mocked<EmbeddingService>;
  let llmService: jest.Mocked<LlmService>;
  let multiQueryGenerator: jest.Mocked<MultiQueryGenerator>;
  let slidingWindow: jest.Mocked<SlidingWindow>;

  const mockQueue = {
    add: jest.fn(),
  };

  const mockChroma = {
    query: jest.fn(),
    getByIndexRange: jest.fn(),
  };

  const mockPrisma = {
    session: {
      findUnique: jest.fn(),
    },
    character: {
      findMany: jest.fn(),
    },
  };

  const mockRedis = {
    get: jest.fn(),
    set: jest.fn(),
    incr: jest.fn(),
  };

  const mockEmbeddingService = {
    embedBatch: jest.fn(),
  };

  const mockLlmService = {
    summarize: jest.fn(),
    chatJson: jest.fn(),
  };

  const mockMultiQueryGenerator = {
    generate: jest.fn(),
  };

  const mockSlidingWindow = {
    expand: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemoryService,
        { provide: getQueueToken('memory-write'), useValue: mockQueue },
        { provide: ChromaClient, useValue: mockChroma },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: EmbeddingService, useValue: mockEmbeddingService },
        { provide: LlmService, useValue: mockLlmService },
        { provide: MultiQueryGenerator, useValue: mockMultiQueryGenerator },
        { provide: SlidingWindow, useValue: mockSlidingWindow },
      ],
    }).compile();

    service = module.get<MemoryService>(MemoryService);
    chroma = module.get(ChromaClient);
    embeddingService = module.get(EmbeddingService);
    llmService = module.get(LlmService);
    multiQueryGenerator = module.get(MultiQueryGenerator);
    slidingWindow = module.get(SlidingWindow);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getNextChunkIndex', () => {
    it('should call redis.incr and return value', async () => {
      mockRedis.incr.mockResolvedValue(2);
      const res = await service.getNextChunkIndex('user1', 'story1', 'plot');
      expect(mockRedis.incr).toHaveBeenCalledWith('mem:idx:user1:story1:plot');
      expect(res).toBe(2);
    });

    it('should throw Error if redis.incr fails', async () => {
      mockRedis.incr.mockRejectedValue(new Error('Redis down'));
      await expect(service.getNextChunkIndex('user1', 'story1', 'plot')).rejects.toThrow(
        'Failed to generate chunk index: Redis down',
      );
    });
  });

  describe('retrieveContext', () => {
    const userId = 'user-123';
    const storyId = 'story-456';
    const userMessage = 'HÃ nh trÃ¬nh Ä‘i sÄƒn quÃ¡i thÃº';
    const activeChars = ['Linh'];

    const mockEmbeddings = [
      [0.1, 0.2],
      [0.3, 0.4],
      [0.5, 0.6],
    ];

    it('should successfully retrieve formatted context string', async () => {
      // 1. Setup multi-query
      multiQueryGenerator.generate.mockResolvedValue(['q1', 'q2', 'q3']);
      // 2. Setup embeddings
      embeddingService.embedBatch.mockResolvedValue(mockEmbeddings);

      // 3. Setup Chroma query results
      const plotChunk: MemoryChunk = {
        id: 'chunk-plot-1',
        content: 'ChÃºng tÃ´i báº¯t Ä‘áº§u Ä‘i sÄƒn á»Ÿ rá»«ng sÃ¢u.',
        metadata: {
          user_id: userId,
          story_id: storyId,
          session_id: 'session-1',
          chunk_index: 1,
          memory_type: 'plot',
          character_name: null,
          timestamp: Date.now(),
          turn_start: 0,
          turn_end: 10,
        },
      };

      const charChunk: MemoryChunk = {
        id: 'chunk-char-1',
        content: 'Linh tá» ra ráº¥t lo láº¯ng trÆ°á»›c chuyáº¿n Ä‘i.',
        metadata: {
          user_id: userId,
          story_id: storyId,
          session_id: 'session-1',
          chunk_index: 2,
          memory_type: 'character',
          character_name: 'Linh',
          timestamp: Date.now(),
          turn_start: 11,
          turn_end: 20,
        },
      };

      chroma.query.mockImplementation(async (emb, filter) => {
        if (filter.memory_type === 'plot') {
          return [plotChunk];
        }
        if (filter.memory_type === 'character' && filter.character_name === 'Linh') {
          return [charChunk];
        }
        return [];
      });

      // 4. Setup sliding window expansion (return same seeds + some neighbors)
      const neighborChunk: MemoryChunk = {
        id: 'chunk-plot-0',
        content: 'Rá»«ng sÃ¢u lÃ  nÆ¡i nguy hiá»ƒm.',
        metadata: {
          user_id: userId,
          story_id: storyId,
          session_id: 'session-1',
          chunk_index: 0,
          memory_type: 'plot',
          character_name: null,
          timestamp: Date.now(),
          turn_start: 0,
          turn_end: 0,
        },
      };

      slidingWindow.expand.mockResolvedValue([neighborChunk, plotChunk, charChunk]);

      // Execution
      const result = await service.retrieveContext(userId, storyId, userMessage, activeChars);

      // Verifications
      expect(multiQueryGenerator.generate).toHaveBeenCalledWith(userMessage);
      expect(embeddingService.embedBatch).toHaveBeenCalledWith(['q1', 'q2', 'q3'], 3);

      // Plot query: 3 queries x 1 call = 3 calls
      // Character Linh query: 3 queries x 1 character x 1 call = 3 calls
      expect(chroma.query).toHaveBeenCalledTimes(6);
      expect(slidingWindow.expand).toHaveBeenCalledWith(
        expect.arrayContaining([plotChunk, charChunk]),
        { user_id: userId, story_id: storyId },
        5,
      );

      // Result should be sorted: Plot first, then Character Linh, ordered by chunk_index
      // Index 0 Plot -> Index 1 Plot -> Index 2 Linh
      const expectedText =
        `[#0 Plot] Rá»«ng sÃ¢u lÃ  nÆ¡i nguy hiá»ƒm.\n\n` +
        `[#1 Plot] ChÃºng tÃ´i báº¯t Ä‘áº§u Ä‘i sÄƒn á»Ÿ rá»«ng sÃ¢u.\n\n` +
        `[#2 Linh] Linh tá» ra ráº¥t lo láº¯ng trÆ°á»›c chuyáº¿n Ä‘i.`;

      expect(result).toBe(expectedText);
      expect(llmService.summarize).not.toHaveBeenCalled();
    });

    it('should fallback to [userMessage] if MultiQueryGenerator returns fallback', async () => {
      multiQueryGenerator.generate.mockResolvedValue([userMessage]);
      embeddingService.embedBatch.mockResolvedValue([[0.1]]);
      chroma.query.mockResolvedValue([]);

      const result = await service.retrieveContext(userId, storyId, userMessage, activeChars);

      expect(embeddingService.embedBatch).toHaveBeenCalledWith([userMessage], 3);
      expect(result).toBe('');
    });

    it('should return empty string if no seeds found', async () => {
      multiQueryGenerator.generate.mockResolvedValue(['q1']);
      embeddingService.embedBatch.mockResolvedValue([[0.1]]);
      chroma.query.mockResolvedValue([]);

      const result = await service.retrieveContext(userId, storyId, userMessage, activeChars);

      expect(slidingWindow.expand).not.toHaveBeenCalled();
      expect(result).toBe('');
    });

    it('should summarize the context if formatted string exceeds 3000 characters', async () => {
      multiQueryGenerator.generate.mockResolvedValue(['q1']);
      embeddingService.embedBatch.mockResolvedValue([[0.1]]);

      // Generate a long chunk content
      const longContent = 'A'.repeat(3100);
      const longChunk: MemoryChunk = {
        id: 'chunk-plot-long',
        content: longContent,
        metadata: {
          user_id: userId,
          story_id: storyId,
          session_id: 'session-1',
          chunk_index: 1,
          memory_type: 'plot',
          character_name: null,
          timestamp: Date.now(),
          turn_start: 0,
          turn_end: 10,
        },
      };

      chroma.query.mockResolvedValue([longChunk]);
      slidingWindow.expand.mockResolvedValue([longChunk]);
      llmService.summarize.mockResolvedValue('TÃ³m táº¯t ngáº¯n gá»n dÆ°á»›i 3000 kÃ­ tá»±.');

      const result = await service.retrieveContext(userId, storyId, userMessage, activeChars);

      expect(llmService.summarize).toHaveBeenCalledWith(`[#1 Plot] ${longContent}`, 'session');
      expect(result).toBe('TÃ³m táº¯t ngáº¯n gá»n dÆ°á»›i 3000 kÃ­ tá»±.');
    });

    it('should gracefully degrade and return empty string if ChromaClient fails', async () => {
      multiQueryGenerator.generate.mockResolvedValue(['q1']);
      embeddingService.embedBatch.mockResolvedValue([[0.1]]);
      chroma.query.mockRejectedValue(new Error('Chroma Connection Refused'));

      const result = await service.retrieveContext(userId, storyId, userMessage, activeChars);

      expect(result).toBe('');
    });
  });
});
