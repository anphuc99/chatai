import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GptSovitsClient } from './gptsovits.client';
import { AppException } from '../../shared/errors/app-exception';
import axios from 'axios';

jest.mock('axios');

describe('GptSovitsClient', () => {
  let client: GptSovitsClient;
  let mockAxiosInstance: any;

  beforeEach(async () => {
    mockAxiosInstance = {
      post: jest.fn(),
      get: jest.fn(),
    };
    (axios.create as jest.Mock).mockReturnValue(mockAxiosInstance);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GptSovitsClient,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('http://mock-tts-engine'),
          },
        },
      ],
    }).compile();

    client = module.get<GptSovitsClient>(GptSovitsClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(client).toBeDefined();
  });

  describe('infer', () => {
    it('should return buffer on successful post', async () => {
      const mockData = Buffer.from('audio_data');
      mockAxiosInstance.post.mockResolvedValue({ data: mockData });

      const result = await client.infer('Text', 'ref.wav', 'ref text');
      expect(result).toEqual(mockData);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/tts', {
        text: 'Text',
        text_lang: 'zh',
        ref_audio_path: 'ref.wav',
        prompt_text: 'ref text',
        prompt_lang: 'zh',
      });
    });

    it('should retry once and succeed on temporary network failure', async () => {
      const mockData = Buffer.from('audio_data');
      
      const networkError = new Error('Network Error');
      (axios.isAxiosError as unknown as jest.Mock).mockReturnValue(true);

      mockAxiosInstance.post
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({ data: mockData });

      const result = await client.infer('Text', 'ref.wav', 'ref text');
      expect(result).toEqual(mockData);
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(2);
    });

    it('should map 404 error to REFERENCE_NOT_FOUND', async () => {
      const error404 = {
        message: 'Request failed with status code 404',
        response: { status: 404, data: 'Not Found' },
      };
      (axios.isAxiosError as unknown as jest.Mock).mockReturnValue(true);
      mockAxiosInstance.post.mockRejectedValue(error404);

      await expect(client.infer('Text', 'ref.wav', 'ref text')).rejects.toThrow(AppException);
    });

    it('should map other errors to TTS_ENGINE_DOWN', async () => {
      const error500 = {
        message: 'Internal Server Error',
        response: { status: 500, data: 'Server Error' },
      };
      (axios.isAxiosError as unknown as jest.Mock).mockReturnValue(true);
      mockAxiosInstance.post.mockRejectedValue(error500);

      await expect(client.infer('Text', 'ref.wav', 'ref text')).rejects.toThrow(AppException);
    });
  });

  describe('health', () => {
    it('should return true on successful get', async () => {
      mockAxiosInstance.get.mockResolvedValue({});
      const isHealthy = await client.health();
      expect(isHealthy).toBe(true);
    });

    it('should return true on 400 Bad Request error (missing params but alive)', async () => {
      const error400 = { response: { status: 400 } };
      (axios.isAxiosError as unknown as jest.Mock).mockReturnValue(true);
      mockAxiosInstance.get.mockRejectedValue(error400);

      const isHealthy = await client.health();
      expect(isHealthy).toBe(true);
    });

    it('should return false on connection error', async () => {
      (axios.isAxiosError as unknown as jest.Mock).mockReturnValue(true);
      mockAxiosInstance.get.mockRejectedValue(new Error('Connection error'));

      const isHealthy = await client.health();
      expect(isHealthy).toBe(false);
    });
  });
});
