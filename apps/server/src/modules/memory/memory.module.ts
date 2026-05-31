import { Module } from '@nestjs/common';
import { ChromaClient } from './chroma.client';
import { LoggerModule } from '../../shared/logger/logger.module';

@Module({
  imports: [LoggerModule],
  providers: [ChromaClient],
  exports: [ChromaClient],
})
export class MemoryModule {}
