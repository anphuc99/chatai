import { Injectable, Logger } from '@nestjs/common';
import { ReferenceIndexManager } from './reference-index.manager';
import { GptSovitsClient } from './gptsovits.client';
import { FfmpegService } from './ffmpeg.service';
import { StorageService } from '../../shared/firebase/storage.service';
import { RedisService } from '../../shared/redis/redis.service';
import { Emotion, Intensity } from './tts.constants';
import { AppException, ERR } from '../../shared/errors/app-exception';
import * as crypto from 'crypto';

export interface SynthRequest {
  text: string;
  voiceName: string;
  emotion?: Emotion;
  intensity?: Intensity;
  pitch?: number;
}

export interface SynthResult {
  url: string;
  fromCache: boolean;
  cacheHash: string;
}

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);

  constructor(
    private readonly refIndex: ReferenceIndexManager,
    private readonly sovits: GptSovitsClient,
    private readonly ffmpeg: FfmpegService,
    private readonly storage: StorageService,
    private readonly redis: RedisService,
  ) {}

  async synthesize(req: SynthRequest): Promise<SynthResult> {
    const emotion = req.emotion ?? 'Neutral';
    const intensity = req.intensity ?? 'medium';
    const pitch = req.pitch ?? 1.0;

    // 1. Pick a random emotion-matching reference
    const pick = this.refIndex.pickRandom(req.voiceName, emotion, intensity);

    // 2. Compute MD5 cache hash
    const hash = this.hashKey(req.voiceName, pick.refAudioPath, req.text, pitch);

    // 3. Check cache
    const cachedUrl = await this.checkCache(hash);
    if (cachedUrl) {
      return { url: cachedUrl, fromCache: true, cacheHash: hash };
    }

    // 4. Cache miss: Acquire lock with wait/retry loop (up to 3 retries, 1s sleep each)
    const lockKey = `tts:lock:${hash}`;
    let lock = await this.redis.acquireLock(lockKey, 60000);
    let retryCount = 0;

    while (!lock && retryCount < 3) {
      this.logger.log(`TTS request is locked by another caller. Waiting 1s... (Retry ${retryCount + 1}/3)`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      
      // Check cache again after wait
      const afterWaitCached = await this.checkCache(hash);
      if (afterWaitCached) {
        return { url: afterWaitCached, fromCache: true, cacheHash: hash };
      }

      lock = await this.redis.acquireLock(lockKey, 60000);
      retryCount++;
    }

    if (!lock) {
      throw new AppException(
        ERR.IDEMPOTENCY_CONFLICT,
        'Hệ thống đang xử lý yêu cầu TTS tương tự, vui lòng thử lại sau.'
      );
    }

    try {
      // Double check cache after lock acquired (race condition check)
      const afterLockCached = await this.checkCache(hash);
      if (afterLockCached) {
        return { url: afterLockCached, fromCache: true, cacheHash: hash };
      }

      this.logger.log(`Synthesizing TTS for text: "${req.text.substring(0, 30)}..." with voice: ${req.voiceName}, pitch: ${pitch}`);

      // Call GPT-SoVITS Engine
      let audioBuf = await this.sovits.infer(req.text, pick.refAudioPath, pick.refText, 'zh');

      // Adjust pitch if necessary
      if (pitch !== 1.0) {
        audioBuf = await this.ffmpeg.adjustPitch(audioBuf, pitch);
      }

      // Upload and cache
      const { publicUrl } = await this.storage.uploadTtsAudio(hash, audioBuf);

      return { url: publicUrl, fromCache: false, cacheHash: hash };
    } finally {
      await this.redis.releaseLock(lockKey, lock.token);
    }
  }

  async testVoice(voiceName: string, pitch = 1.0, sampleText?: string): Promise<SynthResult> {
    const text = sampleText ?? '你好，很高兴认识你';
    return this.synthesize({
      text,
      voiceName,
      emotion: 'Neutral',
      intensity: 'medium',
      pitch,
    });
  }

  private hashKey(voice: string, refPath: string, text: string, pitch: number): string {
    return crypto
      .createHash('md5')
      .update(`${voice}|${refPath}|${text}|${pitch}`)
      .digest('hex');
  }

  private async checkCache(hash: string): Promise<string | null> {
    const path = `tts_audio/${hash}.wav`;
    const exists = await this.storage.exists(path);
    if (!exists) {
      return null;
    }
    return this.storage.getPublicUrl(path);
  }
}
