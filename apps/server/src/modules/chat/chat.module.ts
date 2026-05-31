import { Module } from '@nestjs/common';
import { HistoryStoreService } from './services/history-store.service';
import { OocService } from './services/ooc.service';
import { PromptBuilderService } from './services/prompt-builder.service';
import { LlmService } from './services/llm.service';
import { ChatOrchestratorService } from './services/chat-orchestrator.service';

@Module({
  providers: [HistoryStoreService, OocService, PromptBuilderService, LlmService, ChatOrchestratorService],
  exports: [HistoryStoreService, OocService, PromptBuilderService, LlmService, ChatOrchestratorService],
})
export class ChatModule {}


