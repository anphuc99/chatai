import { Module } from '@nestjs/common';
import { HistoryStoreService } from './services/history-store.service';
import { OocService } from './services/ooc.service';
import { PromptBuilderService } from './services/prompt-builder.service';

@Module({
  providers: [HistoryStoreService, OocService, PromptBuilderService],
  exports: [HistoryStoreService, OocService, PromptBuilderService],
})
export class ChatModule {}

