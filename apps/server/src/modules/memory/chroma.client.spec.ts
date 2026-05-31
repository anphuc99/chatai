import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ChromaClient } from './chroma.client';
import { Logger } from '@nestjs/common';
import { AppException } from '../../shared/errors/app-exception';
import { MemoryDocument, MemoryType } from './types/memory-document';

const mockGetOrCreateCollection = jest.fn();
const mockHeartbeat = jest.fn();

// Mock chromadb
jest.mock('chromadb', () => {
  return {
    ChromaClient: jest.fn().mockImplementation(() => {
      return {
        getOrCreateCollection: mockGetOrCreateCollection,
        heartbeat: mockHeartbeat,
      };
    }),
  };
});

describe('ChromaClient', () => {
  let client: ChromaClient;
  let configService: ConfigService;
  let mockCollection: any;
  let mockChromaClientInstance: any;

  beforeEach(async () => {
    // Tắt log trong test
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    mockCollection = {
      add: jest.fn(),
      query: jest.fn(),
      get: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChromaClient,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('http://localhost:8000'),
          },
        },
      ],
    }).compile();

    client = module.get<ChromaClient>(ChromaClient);
    configService = module.get<ConfigService>(ConfigService);

    const { ChromaClient: MockChromaClient } = require('chromadb');
    mockChromaClientInstance = new MockChromaClient();
    mockGetOrCreateCollection.mockResolvedValue(mockCollection);
    
    // override internal client instance property for tests
    (client as any).client = mockChromaClientInstance;
    (client as any).collection = mockCollection;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('should connect to ChromaDB and create collection', async () => {
      await client.onModuleInit();
      expect(configService.get).toHaveBeenCalledWith('chromaUrl');
      expect(mockGetOrCreateCollection).toHaveBeenCalledWith({
        name: 'roleplay_memory',
        metadata: { 'hnsw:space': 'cosine' },
      });
      expect(Logger.prototype.log).toHaveBeenCalled();
    });

    it('should throw CHROMA_UNAVAILABLE on connection error', async () => {
      mockGetOrCreateCollection.mockRejectedValue(new Error('Connection refused'));
      await expect(client.onModuleInit()).rejects.toThrow(AppException);
      await expect(client.onModuleInit()).rejects.toMatchObject({
        code: 'CHROMA_UNAVAILABLE',
      });
    });
  });

  describe('addDocuments', () => {
    const mockDocs: MemoryDocument[] = [
      {
        id: 'doc1',
        content: 'hello',
        embedding: [0.1, 0.2],
        metadata: {
          user_id: 'u1',
          story_id: 's1',
          session_id: 'se1',
          chunk_index: 1,
          memory_type: 'plot' as MemoryType,
          character_name: null,
          timestamp: 123,
          turn_start: 1,
          turn_end: 2,
        },
      },
    ];

    it('should skip if empty array', async () => {
      await client.addDocuments([]);
      expect(mockCollection.add).not.toHaveBeenCalled();
    });

    it('should call collection.add with correct mapped data', async () => {
      await client.addDocuments(mockDocs);
      expect(mockCollection.add).toHaveBeenCalledWith({
        ids: ['doc1'],
        embeddings: [[0.1, 0.2]],
        documents: ['hello'],
        metadatas: [mockDocs[0]?.metadata as any],
      });
    });

    it('should throw CHROMA_WRITE_FAIL if missing required fields', async () => {
      const invalidDocs = [{ id: 'doc2' }] as MemoryDocument[];
      await expect(client.addDocuments(invalidDocs)).rejects.toThrow(AppException);
    });

    it('should throw CHROMA_WRITE_FAIL if chroma add fails', async () => {
      mockCollection.add.mockRejectedValue(new Error('Write error'));
      await expect(client.addDocuments(mockDocs)).rejects.toThrow(AppException);
    });
  });

  describe('query', () => {
    it('should call collection.query and map results', async () => {
      mockCollection.query.mockResolvedValue({
        ids: [['doc1', 'doc2']],
        distances: [[0.1, 0.2]],
        documents: [['content1', 'content2']],
        metadatas: [[{ user_id: 'u1' }, { user_id: 'u2' }]],
      });

      const res = await client.query([0.1, 0.2], { user_id: 'u1' }, 2);
      expect(mockCollection.query).toHaveBeenCalledWith({
        queryEmbeddings: [[0.1, 0.2]],
        where: { user_id: 'u1' },
        nResults: 2,
      });
      expect(res).toHaveLength(2);
      expect(res[0]?.id).toBe('doc1');
      expect(res[0]?.distance).toBe(0.1);
    });

    it('should return empty array if no ids', async () => {
      mockCollection.query.mockResolvedValue({ ids: [] });
      const res = await client.query([0.1], {});
      expect(res).toEqual([]);
    });

    it('should throw CHROMA_QUERY_FAIL on error', async () => {
      mockCollection.query.mockRejectedValue(new Error('Query error'));
      await expect(client.query([0.1], {})).rejects.toThrow(AppException);
    });
  });

  describe('getByIndexRange', () => {
    it('should use $and operator for range query', async () => {
      mockCollection.get.mockResolvedValue({
        ids: ['doc1'],
        documents: ['content'],
        metadatas: [{}],
      });

      await client.getByIndexRange({ user_id: 'u1' }, 1, 5);
      
      expect(mockCollection.get).toHaveBeenCalledWith({
        where: {
          $and: [
            { user_id: 'u1' },
            { chunk_index: { $gte: 1 } },
            { chunk_index: { $lte: 5 } },
          ],
        },
      });
    });
  });

  describe('delete', () => {
    it('should delete by ids', async () => {
      await client.delete(['id1', 'id2']);
      expect(mockCollection.delete).toHaveBeenCalledWith({ ids: ['id1', 'id2'] });
    });
    it('should skip if empty', async () => {
      await client.delete([]);
      expect(mockCollection.delete).not.toHaveBeenCalled();
    });
  });

  describe('count', () => {
    it('should count ids length from get', async () => {
      mockCollection.get.mockResolvedValue({ ids: ['1', '2'] });
      const count = await client.count({ user_id: 'u1' });
      expect(count).toBe(2);
      expect(mockCollection.get).toHaveBeenCalledWith({
        where: { user_id: 'u1' },
        include: [],
      });
    });
  });

  describe('health', () => {
    it('should return true if heartbeat success', async () => {
      mockHeartbeat.mockResolvedValue(12345);
      const isHealthy = await client.health();
      expect(isHealthy).toBe(true);
    });

    it('should return false if heartbeat throws', async () => {
      mockHeartbeat.mockRejectedValue(new Error('down'));
      const isHealthy = await client.health();
      expect(isHealthy).toBe(false);
    });
  });
});
