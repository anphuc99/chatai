import { Test, TestingModule } from '@nestjs/testing';
import { TtsService, SynthRequest } from './tts.service';
import { ReferenceIndexManager } from './reference-index.manager';
import { GptSovitsClient } from './gptsovits.client';
import { FfmpegService } from './ffmpeg.service';
import { StorageService } from '../../shared/firebase/storage.service';
import { RedisService } from '../../shared/redis/redis.service';
import { AppException } from '../../shared/errors/app-exception';

describe('TtsService', () => {
  let service: TtsService;
  let refIndex: jest.Mocked<ReferenceIndexManager>;
  let sovits: jest.Mocked<GptSovitsClient>;
  let ffmpeg: jest.Mocked<FfmpegService>;
  let storage: jest.Mocked<StorageService>;
  let redis: jest.Mocked<RedisService>;

  beforeEach(async () => {
    const mockRefIndex = {
      pickRandom: jest.fn(),
    };
    const mockSovits = {
      infer: jest.fn(),
    };
    const mockFfmpeg = {
      adjustPitch: jest.fn(),
    };
    const mockStorage = {
      exists: jest.fn(),
      uploadTtsAudio: jest.fn(),
      getSignedUrl: jest.fn(),
    };
    const mockRedis = {
      acquireLock: jest.fn(),
      releaseLock: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TtsService,
        { provide: ReferenceIndexManager, useValue: mockRefIndex },
        { provide: GptSovitsClient, useValue: mockSovits },
        { provide: FfmpegService, useValue: mockFfmpeg },
        { provide: StorageService, useValue: mockStorage },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<TtsService>(TtsService);
    refIndex = module.get(ReferenceIndexManager);
    sovits = module.get(GptSovitsClient);
    ffmpeg = module.get(FfmpegService);
    storage = module.get(StorageService);
    redis = module.get(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('synthesize', () => {
    const defaultReq: SynthRequest = {
      text: 'Xin chào',
      voiceName: 'Kore',
      emotion: 'Neutral',
      intensity: 'medium',
      pitch: 1.0,
    };

    const mockPick = {
      refAudioPath: 'mock/path/kore.wav',
      refText: 'Mẫu tiếng Trung',
    };

    beforeEach(() => {
      refIndex.pickRandom.mockReturnValue(mockPick);
    });

    it('should return cached URL directly on cache hit', async () => {
      storage.exists.mockResolvedValue(true);
      storage.getSignedUrl.mockResolvedValue('https://storage/cached.wav');

      const result = await service.synthesize(defaultReq);

      expect(result.url).toBe('https://storage/cached.wav');
      expect(result.fromCache).toBe(true);
      expect(storage.exists).toHaveBeenCalled();
      expect(redis.acquireLock).not.toHaveBeenCalled();
      expect(sovits.infer).not.toHaveBeenCalled();
    });

    it('should perform inference and upload when cache miss', async () => {
      storage.exists.mockResolvedValue(false);
      redis.acquireLock.mockResolvedValue({ key: 'lockKey', token: 'token' });
      sovits.infer.mockResolvedValue(Buffer.from('raw_audio'));
      storage.uploadTtsAudio.mockResolvedValue({
        storagePath: 'tts_audio/hash.wav',
      });
      storage.getSignedUrl.mockResolvedValue('https://storage/new.wav');

      const result = await service.synthesize(defaultReq);

      expect(result.url).toBe('https://storage/new.wav');
      expect(result.fromCache).toBe(false);
      expect(sovits.infer).toHaveBeenCalledWith('Xin chào', mockPick.refAudioPath, mockPick.refText, 'zh');
      expect(ffmpeg.adjustPitch).not.toHaveBeenCalled();
      expect(storage.uploadTtsAudio).toHaveBeenCalled();
      expect(redis.releaseLock).toHaveBeenCalledWith(expect.any(String), 'token');
    });

    it('should adjust pitch if pitch is not 1.0', async () => {
      const pitchReq = { ...defaultReq, pitch: 1.2 };
      storage.exists.mockResolvedValue(false);
      redis.acquireLock.mockResolvedValue({ key: 'lockKey', token: 'token' });
      sovits.infer.mockResolvedValue(Buffer.from('raw_audio'));
      ffmpeg.adjustPitch.mockResolvedValue(Buffer.from('pitched_audio'));
      storage.uploadTtsAudio.mockResolvedValue({
        storagePath: 'tts_audio/hash.wav',
      });
      storage.getSignedUrl.mockResolvedValue('https://storage/pitched.wav');

      const result = await service.synthesize(pitchReq);

      expect(result.url).toBe('https://storage/pitched.wav');
      expect(ffmpeg.adjustPitch).toHaveBeenCalledWith(Buffer.from('raw_audio'), 1.2);
    });

    it('should wait and return cached if lock is held by another and resolved in the meantime', async () => {
      storage.exists.mockResolvedValueOnce(false);
      redis.acquireLock.mockResolvedValueOnce(null);
      storage.exists.mockResolvedValueOnce(true);
      storage.getSignedUrl.mockResolvedValue('https://storage/resolved_by_other.wav');

      const result = await service.synthesize(defaultReq);

      expect(result.url).toBe('https://storage/resolved_by_other.wav');
      expect(result.fromCache).toBe(true);
      expect(sovits.infer).not.toHaveBeenCalled();
    });

    it('should throw Conflict Exception if lock cannot be acquired after maximum retries', async () => {
      storage.exists.mockResolvedValue(false);
      redis.acquireLock.mockResolvedValue(null);

      await expect(service.synthesize(defaultReq)).rejects.toThrow(AppException);
    });
  });
});
