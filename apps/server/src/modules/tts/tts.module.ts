import { Module } from '@nestjs/common';
import { FirebaseModule } from '../../shared/firebase/firebase.module';
import { RedisModule } from '../../shared/redis/redis.module';
import { TtsService } from './tts.service';
import { ReferenceIndexManager } from './reference-index.manager';
import { GptSovitsClient } from './gptsovits.client';
import { FfmpegService } from './ffmpeg.service';
import { TtsController } from './tts.controller';

@Module({
  imports: [FirebaseModule, RedisModule],
  controllers: [TtsController],
  providers: [
    TtsService,
    ReferenceIndexManager,
    GptSovitsClient,
    FfmpegService,
  ],
  exports: [TtsService],
})
export class TtsModule {}
// Force IDE re-index

