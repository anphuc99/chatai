import { Test, TestingModule } from '@nestjs/testing';
import { MemoryWorker } from './memory.worker';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { LlmService } from '../chat/services/llm.service';
import { EmbeddingService } from './embedding.service';
import { ChromaClient } from './chroma.client';
import { MemoryService } from './memory.service';
import { Job } from 'bullmq';
import { MemoryJob } from './types/memory-job';
import { TemplateLoader } from '@chatai/prompts';

jest.mock('@chatai/prompts', () => ({
  TemplateLoader: {
    loadTemplate: jest.fn(() => 'Mock character prompt template {{CHAR_NAME}} {{HISTORY_TEXT}}'),
  },
}));

describe('MemoryWorker', () => {
  let worker: MemoryWorker;
  let prisma: PrismaService;
  let llmService: LlmService;
  let embeddingService: EmbeddingService;
  let chroma: ChromaClient;
  let memoryService: MemoryService;

  const mockPrisma = {
    message: {
      findMany: jest.fn(),
    },
  };

  const mockLlmService = {
    summarize: jest.fn(),
  };

  const mockEmbeddingService = {
    embed: jest.fn(),
  };

  const mockChroma = {
    query: jest.fn(),
    addDocuments: jest.fn(),
  };

  const mockMemoryService = {
    formatMessagesForSummary: jest.fn(),
    getLastChunkIndex: jest.fn(),
    getActiveCharactersInSession: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemoryWorker,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LlmService, useValue: mockLlmService },
        { provide: EmbeddingService, useValue: mockEmbeddingService },
        { provide: ChromaClient, useValue: mockChroma },
        { provide: MemoryService, useValue: mockMemoryService },
      ],
    }).compile();

    worker = module.get<MemoryWorker>(MemoryWorker);
    prisma = module.get<PrismaService>(PrismaService);
    llmService = module.get<LlmService>(LlmService);
    embeddingService = module.get<EmbeddingService>(EmbeddingService);
    chroma = module.get<ChromaClient>(ChromaClient);
    memoryService = module.get<MemoryService>(MemoryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(worker).toBeDefined();
  });

  describe('process', () => {
    const jobData: MemoryJob = {
      sessionId: 'session-123',
      userId: 'user-456',
      storyId: 'story-789',
      type: 'plot',
    };

    const mockJob = {
      data: jobData,
    } as Job<MemoryJob>;

    it('should skip processing if session has no messages', async () => {
      mockPrisma.message.findMany.mockResolvedValue([]);

      await worker.process(mockJob);

      expect(prisma.message.findMany).toHaveBeenCalledWith({
        where: { sessionId: 'session-123' },
        orderBy: { turnOrder: 'asc' },
      });
      expect(chroma.query).not.toHaveBeenCalled();
    });

    it('should skip processing if memory already exists in Chroma (idempotency check)', async () => {
      const mockMessages = [{ id: 'msg-1', turnOrder: 1, role: 'user', text: 'hello' }];
      mockPrisma.message.findMany.mockResolvedValue(mockMessages);
      mockChroma.query.mockResolvedValue([{ id: 'existing-plot' }]); // already exists

      await worker.process(mockJob);

      expect(chroma.query).toHaveBeenCalledWith(
        expect.any(Array),
        {
          user_id: 'user-456',
          story_id: 'story-789',
          session_id: 'session-123',
          memory_type: 'plot',
        },
        1,
      );
      expect(memoryService.getLastChunkIndex).not.toHaveBeenCalled();
    });

    it('should process plot and character memories successfully', async () => {
      const mockMessages = [
        { id: 'msg-1', turnOrder: 1, role: 'user', text: 'Hello AI' },
        { id: 'msg-2', turnOrder: 2, role: 'assistant', text: 'Hello human', characterId: 'char-1' },
      ];
      const mockCharacters = [{ id: 'char-1', name: 'Garen' }];
      const formattedText = 'User: Hello AI\nGaren: Hello human';
      const mockEmbedding = [0.1, 0.2, 0.3];

      mockPrisma.message.findMany.mockResolvedValue(mockMessages);
      mockChroma.query.mockResolvedValue([]); // cache miss for idempotency check
      mockMemoryService.formatMessagesForSummary.mockReturnValue(formattedText);
      mockMemoryService.getLastChunkIndex.mockResolvedValue(2); // last chunk index is 2
      mockLlmService.summarize.mockImplementation((text, mode) => {
        if (mode === 'plot') return Promise.resolve('Plot summary content');
        if (mode === 'character') return Promise.resolve('Character memory content');
        return Promise.resolve('');
      });
      mockEmbeddingService.embed.mockResolvedValue(mockEmbedding);
      mockMemoryService.getActiveCharactersInSession.mockResolvedValue(mockCharacters);

      await worker.process(mockJob);

      // Verify plot index retrieval
      expect(memoryService.getLastChunkIndex).toHaveBeenCalledWith('user-456', 'story-789', 'plot');

      // Verify plot summary + embedding
      expect(llmService.summarize).toHaveBeenCalledWith(formattedText, 'plot');
      expect(embeddingService.embed).toHaveBeenCalledWith('Plot summary content');

      // Verify character active retrieval
      expect(memoryService.getActiveCharactersInSession).toHaveBeenCalledWith(mockMessages);

      // Verify character prompt building
      expect(TemplateLoader.loadTemplate).toHaveBeenCalledWith('summary_character');
      expect(llmService.summarize).toHaveBeenCalledWith(
        expect.stringContaining('Garen'),
        'character',
        { CHAR_NAME: 'Garen' },
      );
      expect(embeddingService.embed).toHaveBeenCalledWith('Character memory content');

      // Verify Chroma add documents (plot + character)
      expect(chroma.addDocuments).toHaveBeenCalledTimes(2);

      // Verify plot addition args
      expect(chroma.addDocuments).toHaveBeenNthCalledWith(1, [
        expect.objectContaining({
          id: 'session-123_plot',
          content: 'Plot summary content',
          embedding: mockEmbedding,
          metadata: expect.objectContaining({
            user_id: 'user-456',
            story_id: 'story-789',
            session_id: 'session-123',
            chunk_index: 3, // next index (lastIdx + 1)
            memory_type: 'plot',
            turn_start: 1,
            turn_end: 2,
          }),
        }),
      ]);

      // Verify character addition args
      expect(chroma.addDocuments).toHaveBeenNthCalledWith(2, [
        expect.objectContaining({
          id: 'session-123_char_char-1',
          content: 'Character memory content',
          embedding: mockEmbedding,
          metadata: expect.objectContaining({
            user_id: 'user-456',
            story_id: 'story-789',
            session_id: 'session-123',
            chunk_index: 3,
            memory_type: 'character',
            character_name: 'Garen',
            turn_start: 1,
            turn_end: 2,
          }),
        }),
      ]);
    });

    it('should skip character memories if no active characters', async () => {
      const mockMessages = [{ id: 'msg-1', turnOrder: 1, role: 'user', text: 'Hello' }];
      mockPrisma.message.findMany.mockResolvedValue(mockMessages);
      mockChroma.query.mockResolvedValue([]);
      mockMemoryService.formatMessagesForSummary.mockReturnValue('User: Hello');
      mockMemoryService.getLastChunkIndex.mockResolvedValue(0);
      mockLlmService.summarize.mockResolvedValue('Plot summary only');
      mockEmbeddingService.embed.mockResolvedValue([0.1]);
      mockMemoryService.getActiveCharactersInSession.mockResolvedValue([]); // no active chars

      await worker.process(mockJob);

      expect(chroma.addDocuments).toHaveBeenCalledTimes(1); // only plot
      expect(chroma.addDocuments).toHaveBeenCalledWith([
        expect.objectContaining({
          id: 'session-123_plot',
        }),
      ]);
    });
  });
});
