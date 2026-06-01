import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
import configuration from './config/configuration';
import { validationSchema } from './config/validation.schema';
import { HealthModule } from './modules/health/health.module';
import { PrismaModule } from './shared/prisma/prisma.module';
import { RedisModule } from './shared/redis/redis.module';
import { LoggerModule } from './shared/logger/logger.module';
import { TraceContextService } from './shared/tracing/trace-context.service';
import { TraceInterceptor } from './shared/tracing/trace.interceptor';
import { GlobalExceptionFilter } from './shared/filters/global-exception.filter';
import { AuthModule } from './modules/auth/auth.module';
import { AuthGuard } from './shared/guards/auth.guard';
import { FirebaseModule } from './shared/firebase/firebase.module';
import { UsersModule } from './modules/users/users.module';
import { StoriesModule } from './modules/stories/stories.module';
import { OwnershipModule } from './shared/ownership/ownership.module';
import { CharactersModule } from './modules/characters/characters.module';
import { TtsModule } from './modules/tts/tts.module';
import { ChatModule } from './modules/chat/chat.module';
import { JournalModule } from './modules/journal/journal.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MemoryModule } from './modules/memory/memory.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
    }),
    EventEmitterModule.forRoot(),
    LoggerModule,
    PrismaModule,
    RedisModule,
    HealthModule,
    AuthModule,
    FirebaseModule,
    UsersModule,
    StoriesModule,
    OwnershipModule,
    CharactersModule,
    TtsModule,
    ChatModule,
    JournalModule,
    MemoryModule,
  ],

  providers: [
    TraceContextService,
    {
      provide: APP_INTERCEPTOR,
      useClass: TraceInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule {}
