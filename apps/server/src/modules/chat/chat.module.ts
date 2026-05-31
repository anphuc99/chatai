import { Module } from '@nestjs/common';
import { HistoryStoreService } from './services/history-store.service';
import { OocService } from './services/ooc.service';
import { PromptBuilderService } from './services/prompt-builder.service';
import { LlmService } from './services/llm.service';
import { ChatOrchestratorService } from './services/chat-orchestrator.service';
import { ChatSessionService } from './services/chat-session.service';
import { ChatController } from './chat.controller';
import { TokenCounterService } from './services/token-counter.service';
import { ChatConfig } from '../../config/chat.config';

@Module({
  controllers: [ChatController],
  providers: [
    HistoryStoreService,
    OocService,
    PromptBuilderService,
    LlmService,
    ChatOrchestratorService,
    ChatSessionService,
    TokenCounterService,
    ChatConfig,
  ],
  exports: [
    HistoryStoreService,
    OocService,
    PromptBuilderService,
    LlmService,
    ChatOrchestratorService,
    ChatSessionService,
    TokenCounterService,
    ChatConfig,
  ],
})
export class ChatModule {}



