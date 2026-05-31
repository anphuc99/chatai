import { Module } from '@nestjs/common';
import { ChromaClient } from './chroma.client';
import { LoggerModule } from '../../shared/logger/logger.module';
import { RedisModule } from '../../shared/redis/redis.module';
import { EmbeddingService } from './embedding.service';

@Module({
  imports: [LoggerModule, RedisModule],
  providers: [ChromaClient, EmbeddingService],
  exports: [ChromaClient, EmbeddingService],
})
export class MemoryModule {}
