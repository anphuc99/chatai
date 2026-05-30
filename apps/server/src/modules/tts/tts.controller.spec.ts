import { Test, TestingModule } from '@nestjs/testing';
import { TtsController } from './tts.controller';
import { TtsService } from './tts.service';
import { RedisService } from '../../shared/redis/redis.service';
import { Reflector } from '@nestjs/core';
import { RedisThrottlerGuard } from '../../shared/throttler/redis-throttler.guard';
import { ExecutionContext } from '@nestjs/common';
import { AppException, ERR } from '../../shared/errors/app-exception';
import { SynthesizeDto } from './dto/synthesize.dto';
import { TestVoiceDto } from './dto/test-voice.dto';

describe('TtsController', () => {
  let controller: TtsController;
  let ttsService: jest.Mocked<TtsService>;
  let redisService: jest.Mocked<RedisService>;
  let reflector: jest.Mocked<Reflector>;
  let guard: RedisThrottlerGuard;

  beforeEach(async () => {
    const mockTtsService = {
      synthesize: jest.fn(),
      testVoice: jest.fn(),
    };
    const mockRedisService = {
      incr: jest.fn(),
      expire: jest.fn(),
    };
    const mockReflector = {
      getAllAndOverride: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TtsController],
      providers: [
        { provide: TtsService, useValue: mockTtsService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: Reflector, useValue: mockReflector },
        RedisThrottlerGuard,
      ],
    }).compile();

    controller = module.get<TtsController>(TtsController);
    ttsService = module.get(TtsService);
    redisService = module.get(RedisService);
    reflector = module.get(Reflector);
    guard = module.get(RedisThrottlerGuard);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(guard).toBeDefined();
  });

  describe('synthesize', () => {
    it('should call ttsService.synthesize and return mapped response', async () => {
      const dto: SynthesizeDto = {
        text: 'Xin chào',
        voiceName: 'Kore',
        emotion: 'Neutral',
        intensity: 'medium',
        pitch: 1.0,
      };
      const user = { uid: 'user123', email: 'test@example.com' };
      const mockResult = { url: 'http://audio.wav', fromCache: true, cacheHash: 'hash123' };
      ttsService.synthesize.mockResolvedValue(mockResult);

      const result = await controller.synthesize(user, dto);

      expect(ttsService.synthesize).toHaveBeenCalledWith(dto);
      expect(result).toEqual({ audioUrl: 'http://audio.wav', cached: true });
    });
  });

  describe('testVoice', () => {
    it('should call ttsService.testVoice and return mapped response', async () => {
      const dto: TestVoiceDto = {
        voiceName: 'Kore',
        pitch: 1.2,
        sampleText: 'Thử nghiệm giọng',
      };
      const user = { uid: 'user123', email: 'test@example.com' };
      const mockResult = { url: 'http://test-audio.wav', fromCache: false, cacheHash: 'hash456' };
      ttsService.testVoice.mockResolvedValue(mockResult);

      const result = await controller.testVoice(user, dto);

      expect(ttsService.testVoice).toHaveBeenCalledWith('Kore', 1.2, 'Thử nghiệm giọng');
      expect(result).toEqual({ audioUrl: 'http://test-audio.wav' });
    });
  });

  describe('RedisThrottlerGuard', () => {
    let mockContext: any;
    let mockRequest: any;

    beforeEach(() => {
      mockRequest = {
        user: { uid: 'user123' },
        method: 'POST',
        url: '/tts/synthesize',
        routeOptions: { url: '/tts/synthesize' },
        ip: '127.0.0.1',
      };
      mockContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(mockRequest),
        }),
        getHandler: jest.fn(),
        getClass: jest.fn(),
      } as unknown as ExecutionContext;
    });

    it('should allow request if no throttle metadata', async () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);

      const canActivate = await guard.canActivate(mockContext);

      expect(canActivate).toBe(true);
      expect(redisService.incr).not.toHaveBeenCalled();
    });

    it('should increment key and set expire on first request', async () => {
      reflector.getAllAndOverride.mockReturnValue({ limit: 5, windowSec: 60 });
      redisService.incr.mockResolvedValue(1);

      const canActivate = await guard.canActivate(mockContext);

      expect(canActivate).toBe(true);
      expect(redisService.incr).toHaveBeenCalled();
      expect(redisService.expire).toHaveBeenCalledWith(expect.stringContaining('rl:user123:POST:/tts/synthesize'), 60);
    });

    it('should throw AppException with RATE_LIMIT if count exceeds limit', async () => {
      reflector.getAllAndOverride.mockReturnValue({ limit: 5, windowSec: 60 });
      redisService.incr.mockResolvedValue(6); // Exceeds limit 5

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        expect.objectContaining({
          code: ERR.RATE_LIMIT,
        })
      );
    });

    it('should use request IP if user is not authenticated', async () => {
      mockRequest.user = undefined;
      reflector.getAllAndOverride.mockReturnValue({ limit: 5, windowSec: 60 });
      redisService.incr.mockResolvedValue(2);

      const canActivate = await guard.canActivate(mockContext);

      expect(canActivate).toBe(true);
      expect(redisService.incr).toHaveBeenCalledWith(expect.stringContaining('rl:127.0.0.1:POST:/tts/synthesize'));
    });

    it('should fail-open (allow request) if Redis service throws error', async () => {
      reflector.getAllAndOverride.mockReturnValue({ limit: 5, windowSec: 60 });
      redisService.incr.mockRejectedValue(new Error('Redis is down'));

      const canActivate = await guard.canActivate(mockContext);

      expect(canActivate).toBe(true);
    });
  });
});
