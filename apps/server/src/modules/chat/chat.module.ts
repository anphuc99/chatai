import { Module, forwardRef } from '@nestjs/common';
import { HistoryStoreService } from './services/history-store.service';
import { OocService } from './services/ooc.service';
import { PromptBuilderService } from './services/prompt-builder.service';
import { LlmService } from './services/llm.service';
import { ChatOrchestratorService } from './services/chat-orchestrator.service';
import { ChatSessionService } from './services/chat-session.service';
import { ChatController } from './chat.controller';
import { TokenCounterService } from './services/token-counter.service';
import { ChatConfig } from '../../config/chat.config';
import { CheckpointService } from './services/checkpoint.service';
import { EndChatService } from './services/end-chat.service';
import { IdempotencyInterceptor } from '../../shared/idempotency/idempotency.interceptor';
import { AutoRateLimiterService } from './services/auto-rate-limiter.service';
import { MemoryModule } from '../memory/memory.module';

@Module({
  imports: [forwardRef(() => MemoryModule)],
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
    CheckpointService,
    EndChatService,
    AutoRateLimiterService,
    IdempotencyInterceptor,
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
    CheckpointService,
    EndChatService,
    AutoRateLimiterService,
    IdempotencyInterceptor,
  ],
})
export class ChatModule {}



