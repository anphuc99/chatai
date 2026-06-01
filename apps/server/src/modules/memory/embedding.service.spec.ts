import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../shared/redis/redis.service';
import { EmbeddingService } from './embedding.service';
import { AppException } from '../../shared/errors/app-exception';
import axios from 'axios';

jest.mock('axios');

describe('EmbeddingService', () => {
  let service: EmbeddingService;
  let redisService: RedisService;
  let mockAxiosInstance: any;

  const mockRedis = {
    getJson: jest.fn(),
    setJson: jest.fn(),
  };

  const mockConfig = {
    get: jest.fn((key: string, defaultValue?: any) => {
      if (key === 'ollamaBaseUrl') return 'http://localhost:11434';
      if (key === 'ollamaEmbedModel') return 'bge-m3';
      return defaultValue;
    }),
  };

  beforeEach(async () => {
    mockAxiosInstance = {
      post: jest.fn(),
    };
    (axios.create as jest.Mock).mockReturnValue(mockAxiosInstance);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmbeddingService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<EmbeddingService>(EmbeddingService);
    redisService = module.get<RedisService>(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('embed', () => {
    it('should return cached embedding if available (cache hit)', async () => {
      const text = 'test text';
      const mockVector = [0.1, 0.2, 0.3];
      mockRedis.getJson.mockResolvedValue(mockVector);

      const result = await service.embed(text);

      expect(redisService.getJson).toHaveBeenCalled();
      expect(mockAxiosInstance.post).not.toHaveBeenCalled();
      expect(result).toEqual(mockVector);
    });

    it('should call Ollama, cache vector and return it on cache miss', async () => {
      const text = 'test text';
      const mockVector = [0.1, 0.2, 0.3];
      mockRedis.getJson.mockResolvedValue(null);
      mockAxiosInstance.post.mockResolvedValue({
        data: { embedding: mockVector },
      });

      const result = await service.embed(text);

      expect(redisService.getJson).toHaveBeenCalled();
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/embeddings', {
        model: 'bge-m3',
        prompt: text,
      });
      expect(redisService.setJson).toHaveBeenCalledWith(
        expect.stringContaining('embed:bge-m3:'),
        mockVector,
        86400,
      );
      expect(result).toEqual(mockVector);
    });

    it('should truncate text > 8000 characters', async () => {
      const longText = 'a'.repeat(9000);
      const expectedTruncated = 'a'.repeat(8000);
      const mockVector = [0.1];
      mockRedis.getJson.mockResolvedValue(null);
      mockAxiosInstance.post.mockResolvedValue({
        data: { embedding: mockVector },
      });

      await service.embed(longText);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/embeddings', {
        model: 'bge-m3',
        prompt: expectedTruncated,
      });
    });

    it('should throw INVALID_PAYLOAD if input is empty after trimming', async () => {
      await expect(service.embed('   ')).rejects.toThrow(AppException);
      await expect(service.embed('   ')).rejects.toMatchObject({
        code: 'INVALID_PAYLOAD',
      });
    });

    it('should throw INVALID_PAYLOAD if input is not a string', async () => {
      await expect(service.embed(123 as any)).rejects.toThrow(AppException);
    });

    it('should throw EMBED_UNAVAILABLE if Ollama returns invalid format', async () => {
      mockRedis.getJson.mockResolvedValue(null);
      mockAxiosInstance.post.mockResolvedValue({
        data: { embedding: 'not-an-array' },
      });

      await expect(service.embed('test')).rejects.toThrow(AppException);
      await expect(service.embed('test')).rejects.toMatchObject({
        code: 'EMBED_UNAVAILABLE',
      });
    });

    it('should throw EMBED_UNAVAILABLE if Ollama connection fails', async () => {
      mockRedis.getJson.mockResolvedValue(null);
      const error: any = new Error('Connection refused');
      error.code = 'ECONNREFUSED';
      mockAxiosInstance.post.mockRejectedValue(error);

      await expect(service.embed('test')).rejects.toThrow(AppException);
      await expect(service.embed('test')).rejects.toMatchObject({
        code: 'EMBED_UNAVAILABLE',
      });
    });

    it('should continue and call Ollama even if Redis throws an error', async () => {
      mockRedis.getJson.mockRejectedValue(new Error('Redis connection failed'));
      const mockVector = [0.1, 0.2];
      mockAxiosInstance.post.mockResolvedValue({
        data: { embedding: mockVector },
      });

      const result = await service.embed('test');

      expect(mockAxiosInstance.post).toHaveBeenCalled();
      expect(result).toEqual(mockVector);
    });
  });

  describe('embedBatch', () => {
    it('should embed multiple texts concurrently with limited concurrency', async () => {
      const texts = ['one', 'two', 'three', 'four'];
      const mockVector = [0.1];
      mockRedis.getJson.mockResolvedValue(null);
      mockAxiosInstance.post.mockResolvedValue({
        data: { embedding: mockVector },
      });

      const results = await service.embedBatch(texts, 2);

      expect(results).toHaveLength(4);
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(4);
      expect(results[0]).toEqual(mockVector);
    });

    it('should throw INVALID_PAYLOAD if input is not an array', async () => {
      await expect(service.embedBatch('not-an-array' as any)).rejects.toThrow(AppException);
    });
  });
});
