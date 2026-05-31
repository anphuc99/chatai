import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ChromaClient } from './chroma.client';
import { LoggerModule } from '../../shared/logger/logger.module';
import { RedisModule } from '../../shared/redis/redis.module';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { ChatModule } from '../chat/chat.module';
import { EmbeddingService } from './embedding.service';
import { MemoryService } from './memory.service';
import { MemoryWorker } from './memory.worker';
import { MultiQueryGenerator } from './services/multi-query-generator';
import { SlidingWindow } from './services/sliding-window';

@Module({
  imports: [
    LoggerModule,
    RedisModule,
    PrismaModule,
    ChatModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (cfg: ConfigService) => {
        const redisUrl = cfg.get<string>('redisUrl') || 'redis://localhost:6379';
        const url = new URL(redisUrl);
        return {
          connection: {
            host: url.hostname,
            port: parseInt(url.port, 10) || 6379,
            username: url.username || undefined,
            password: url.password || undefined,
          },
        };
      },
      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: 'memory-write',
    }),
  ],
  providers: [
    ChromaClient,
    EmbeddingService,
    MemoryService,
    MemoryWorker,
    MultiQueryGenerator,
    SlidingWindow,
  ],
  exports: [
    ChromaClient,
    EmbeddingService,
    MemoryService,
    MultiQueryGenerator,
    SlidingWindow,
  ],
})
export class MemoryModule {}
