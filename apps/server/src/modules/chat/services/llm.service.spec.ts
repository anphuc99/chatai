import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { z } from 'zod';
import { LlmService } from './llm.service';
import { AppException } from '@/shared/errors/app-exception';
import { LlmMessage } from '../types/llm-message';

// Mock axios
jest.mock('axios');

describe('LlmService', () => {
  let service: LlmService;
  let mockAxiosInstance: any;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'ollamaBaseUrl') return 'http://localhost:11434';
      if (key === 'ollamaModelLarge') return 'qwen2.5:14b';
      if (key === 'ollamaModelSmall') return 'qwen2.5:3b';
      return null;
    }),
  };

  beforeEach(async () => {
    mockAxiosInstance = {
      post: jest.fn(),
    };
    (axios.create as jest.Mock).mockReturnValue(mockAxiosInstance);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<LlmService>(LlmService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('chatJson', () => {
    const dummySchema = z.object({
      hello: z.string(),
    });

    const messages: LlmMessage[] = [{ role: 'user', content: 'Say hello' }];

    it('should return valid JSON parsing on first attempt', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          message: {
            role: 'assistant',
            content: '{"hello": "world"}',
          },
          done: true,
          eval_count: 10,
        },
      });

      const result = await service.chatJson(messages, dummySchema);
      expect(result).toEqual({ hello: 'world' });
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);
    });

    it('should retry if JSON is invalid on first attempt and succeeds on second', async () => {
      // 1st attempt: invalid JSON
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          message: {
            role: 'assistant',
            content: 'invalid-json-content',
          },
          done: true,
        },
      });

      // 2nd attempt: valid JSON
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          message: {
            role: 'assistant',
            content: '{"hello": "world"}',
          },
          done: true,
        },
      });

      const result = await service.chatJson(messages, dummySchema);
      expect(result).toEqual({ hello: 'world' });
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(2);

      // Check that the second call contains the retry system hint
      const secondCallArgs = mockAxiosInstance.post.mock.calls[1][1];
      expect(secondCallArgs.messages).toHaveLength(2);
      expect(secondCallArgs.messages[1].role).toBe('system');
      expect(secondCallArgs.messages[1].content).toContain('Lần trước response KHÔNG hợp lệ JSON schema');
    });

    it('should retry if JSON is valid but does not match schema, then succeeds on third attempt', async () => {
      // 1st attempt: invalid JSON
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          message: {
            role: 'assistant',
            content: 'invalid-json-content',
          },
          done: true,
        },
      });

      // 2nd attempt: wrong schema
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          message: {
            role: 'assistant',
            content: '{"wrong_key": "world"}',
          },
          done: true,
        },
      });

      // 3rd attempt: correct schema
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          message: {
            role: 'assistant',
            content: '{"hello": "world"}',
          },
          done: true,
        },
      });

      const result = await service.chatJson(messages, dummySchema);
      expect(result).toEqual({ hello: 'world' });
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(3);

      const thirdCallArgs = mockAxiosInstance.post.mock.calls[2][1];
      expect(thirdCallArgs.messages).toHaveLength(3);
    });

    it('should throw LLM_PARSE_FAIL when all retries are exhausted', async () => {
      // 3 attempts returning invalid JSON
      mockAxiosInstance.post.mockResolvedValue({
        data: {
          message: {
            role: 'assistant',
            content: 'invalid-json-content',
          },
          done: true,
        },
      });

      await expect(service.chatJson(messages, dummySchema)).rejects.toThrow(AppException);
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(3);
    });

    it('should throw LLM_TIMEOUT on axios timeout', async () => {
      const error: any = new Error('timeout');
      error.code = 'ECONNABORTED';
      mockAxiosInstance.post.mockRejectedValueOnce(error);

      await expect(service.chatJson(messages, dummySchema)).rejects.toThrow(
        expect.objectContaining({ code: 'LLM_TIMEOUT' })
      );
    });

    it('should throw LLM_UNAVAILABLE when connection is refused', async () => {
      const error: any = new Error('Connection refused');
      error.code = 'ECONNREFUSED';
      mockAxiosInstance.post.mockRejectedValueOnce(error);

      await expect(service.chatJson(messages, dummySchema)).rejects.toThrow(
        expect.objectContaining({ code: 'LLM_UNAVAILABLE' })
      );
    });
  });

  describe('extractJson', () => {
    it('should parse direct JSON', () => {
      const raw = '{"hello": "world"}';
      expect((service as any).extractJson(raw)).toEqual({ hello: 'world' });
    });

    it('should parse fenced markdown code blocks', () => {
      const raw = '```json\n{"hello": "world"}\n```';
      expect((service as any).extractJson(raw)).toEqual({ hello: 'world' });

      const rawNoLang = '```\n[1, 2, 3]\n```';
      expect((service as any).extractJson(rawNoLang)).toEqual([1, 2, 3]);
    });

    it('should parse JSON surrounded by text', () => {
      const raw = 'Some random text before {"hello": "world"} and some text after';
      expect((service as any).extractJson(raw)).toEqual({ hello: 'world' });

      const rawArray = 'Prefix text [1, 2, 3] postfix text';
      expect((service as any).extractJson(rawArray)).toEqual([1, 2, 3]);
    });

    it('should throw error if no JSON is found', () => {
      const raw = 'No JSON here at all!';
      expect(() => (service as any).extractJson(raw)).toThrow('No JSON found in response');
    });
  });

  describe('summarize', () => {
    it('should call callOllama with small model and return plain text', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          message: {
            role: 'assistant',
            content: '  This is a summary.  ',
          },
          done: true,
        },
      });

      const result = await service.summarize('Short story text', 'plot');
      expect(result).toBe('This is a summary.');

      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);
      const callArgs = mockAxiosInstance.post.mock.calls[0][1];
      expect(callArgs.model).toBe('qwen2.5:3b');
      expect(callArgs.format).toBeUndefined(); // Plain text, no format json
    });
  });
});
