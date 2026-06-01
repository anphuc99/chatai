import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  ConflictException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ChatSessionService } from './services/chat-session.service';
import { ChatOrchestratorService } from './services/chat-orchestrator.service';
import { OocService } from './services/ooc.service';
import { HistoryStoreService } from './services/history-store.service';
import { RedisService } from '../../shared/redis/redis.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { AuthUser } from '../../shared/types/auth-user';
import { RedisThrottlerGuard } from '../../shared/throttler/redis-throttler.guard';
import { Throttle } from '../../shared/throttler/throttle.decorator';
import { AppException, ERR } from '../../shared/errors/app-exception';
import { EndChatService } from './services/end-chat.service';
import { AutoRateLimiterService } from './services/auto-rate-limiter.service';
import { Idempotent } from '../../shared/idempotency/idempotent.decorator';
import { ShopEventResolverService } from './services/shop-event-resolver.service';
import { ShopService } from '../shop/shop.service';
import { TemplateLoader } from '@chatai/prompts';
import {
  StartSessionDto,
  SendMessageDto,
  OocDto,
  ToggleCharacterDto,
  TempCharacterDto,
  ShopChoiceDto,
} from './dto';

@Controller('chat')
@UseGuards(RedisThrottlerGuard)
export class ChatController {
  private readonly shopChoiceTemplates: { buy: string; decline: string };

  constructor(
    private readonly sessionService: ChatSessionService,
    private readonly orchestrator: ChatOrchestratorService,
    private readonly ooc: OocService,
    private readonly historyStore: HistoryStoreService,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly endChatService: EndChatService,
    private readonly autoRateLimiter: AutoRateLimiterService,
    private readonly shopEventResolver: ShopEventResolverService,
    private readonly shopService: ShopService,
  ) {
    const raw = TemplateLoader.loadTemplate('shop_choice_branches');
    const parts = raw.split('---DECLINE---');
    const buyContent = parts[0]!.split('---BUY---')[1]?.trim() ?? '';
    const declineContent = parts[1]?.trim() ?? '';
    this.shopChoiceTemplates = { buy: buyContent, decline: declineContent };
  }

  @Post('sessions')
  @Throttle(20, 60)
  async startSession(
    @CurrentUser() u: AuthUser,
    @Body() dto: StartSessionDto,
  ) {
    return this.sessionService.findOrStart(u.uid, dto.storyId);
  }

  @Get('sessions/:sid/history')
  @Throttle(60, 60)
  async getHistory(
    @CurrentUser() u: AuthUser,
    @Param('sid', ParseUUIDPipe) sid: string,
  ) {
    await this.sessionService.getSessionForUser(u.uid, sid);
    return this.sessionService.getHistoryHydrated(sid);
  }

  @Post('sessions/:sid/message')
  @Throttle(30, 60)
  async sendMessage(
    @CurrentUser() u: AuthUser,
    @Param('sid', ParseUUIDPipe) sid: string,
    @Body() dto: SendMessageDto,
  ) {
    const session = await this.sessionService.getSessionForUser(u.uid, sid);
    if (session.status !== 'active') {
      throw new AppException(ERR.SESSION_ALREADY_ENDED);
    }

    try {
      return await this.redis.withLock(`chat:lock:${sid}`, 30000, async () => {
        return await this.orchestrator.handleUserTurn(
          { sessionId: sid, userId: u.uid, storyId: session.storyId },
          dto.userMessage,
          dto.ephemeralOOC,
        );
      });
    } catch (err: any) {
      if (err instanceof ConflictException && err.message === 'SESSION_LOCKED') {
        throw new AppException(ERR.SESSION_LOCKED);
      }
      throw err;
    }
  }

  @Post('sessions/:sid/ooc')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle(30, 60)
  async setOoc(
    @CurrentUser() u: AuthUser,
    @Param('sid', ParseUUIDPipe) sid: string,
    @Body() dto: OocDto,
  ) {
    await this.sessionService.getSessionForUser(u.uid, sid);
    if (dto.type === 'persistent') {
      await this.ooc.setPersistent(sid, dto.text);
      await this.historyStore.append(sid, {
        type: 'persistent_ooc',
        timestamp: Date.now(),
        data: { text: dto.text },
      });
    } else {
      await this.ooc.pushEphemeral(sid, dto.text);
      await this.historyStore.append(sid, {
        type: 'ephemeral_ooc',
        timestamp: Date.now(),
        data: { text: dto.text },
      });
    }
  }

  @Post('sessions/:sid/character-toggle')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle(30, 60)
  async toggleCharacter(
    @CurrentUser() u: AuthUser,
    @Param('sid', ParseUUIDPipe) sid: string,
    @Body() dto: ToggleCharacterDto,
  ) {
    const session = await this.sessionService.getSessionForUser(u.uid, sid);
    const char = await this.prisma.character.findUnique({
      where: { id: dto.characterId },
    });
    if (!char) {
      throw new AppException(ERR.NOT_FOUND);
    }
    if (char.storyId !== session.storyId) {
      throw new AppException(ERR.FORBIDDEN);
    }

    if (dto.on) {
      await this.ooc.addActive(sid, dto.characterId);
      await this.ooc.pushEphemeral(sid, `${char.name} vừa xuất hiện trong cảnh.`);
    } else {
      await this.ooc.removeActive(sid, dto.characterId);
      await this.ooc.pushEphemeral(sid, `${char.name} vừa rời khỏi cảnh.`);
    }

    await this.historyStore.append(sid, {
      type: 'character_toggle',
      timestamp: Date.now(),
      data: { characterId: dto.characterId, name: char.name, on: dto.on },
    });
  }

  @Post('sessions/:sid/temp-character')
  @Throttle(10, 60)
  async addTempCharacter(
    @CurrentUser() u: AuthUser,
    @Param('sid', ParseUUIDPipe) sid: string,
    @Body() dto: TempCharacterDto,
  ) {
    await this.sessionService.getSessionForUser(u.uid, sid);
    const tempId = await this.ooc.addTemporary(sid, {
      name: dto.name,
      description: dto.description,
    });
    await this.ooc.pushEphemeral(
      sid,
      `Một nhân vật tạm thời tên ${dto.name} xuất hiện: ${dto.description}`,
    );
    return { tempId };
  }

  @Post('sessions/:sid/auto-continue')
  @Throttle(10, 60)
  async autoContinue(
    @CurrentUser() u: AuthUser,
    @Param('sid', ParseUUIDPipe) sid: string,
  ) {
    const session = await this.sessionService.getSessionForUser(u.uid, sid);
    if (session.status !== 'active') {
      throw new AppException(ERR.SESSION_ALREADY_ENDED);
    }

    await this.autoRateLimiter.checkAndConsume(sid);

    try {
      return await this.redis.withLock(`chat:auto-lock:${sid}`, 30000, async () => {
        return await this.orchestrator.handleAutoTurn({
          sessionId: sid,
          userId: u.uid,
          storyId: session.storyId,
        });
      });
    } catch (err: any) {
      if (err instanceof ConflictException && err.message === 'SESSION_LOCKED') {
        throw new AppException(ERR.SESSION_LOCKED);
      }
      throw err;
    }
  }

  @Post('sessions/:sid/shop-choice')
  @Throttle(10, 60)
  async shopChoice(
    @CurrentUser() u: AuthUser,
    @Param('sid', ParseUUIDPipe) sid: string,
    @Body() dto: ShopChoiceDto,
  ) {
    const session = await this.sessionService.getSessionForUser(u.uid, sid);
    if (session.status !== 'active') {
      throw new AppException(ERR.SESSION_ALREADY_ENDED);
    }

    // Pre-check before acquiring lock
    await this.shopEventResolver.findPendingShopEvent(sid);

    try {
      return await this.redis.withLock(`chat:shop-lock:${sid}`, 30000, async () => {
        // Re-check after lock to prevent concurrent resolution
        const ref = await this.shopEventResolver.findPendingShopEvent(sid);

        if (dto.choice === 'buy') {
          await this.shopService.applyContextualEvent(u.uid, ref.event.itemName, ref.event.price, 'buy', sid);
        }

        // Mark consumed BEFORE orchestrator to prevent re-entry
        await this.shopEventResolver.markConsumed(sid, ref.msgId);

        const template = this.shopChoiceTemplates[dto.choice];
        const ooc = template
          .replace('{{ITEM}}', ref.event.itemName)
          .replace('{{PRICE}}', ref.event.price.toString());

        const cannedMsg = dto.choice === 'buy' ? '好，我买了' : '不用了，谢谢';

        return await this.orchestrator.handleUserTurn(
          { sessionId: sid, userId: u.uid, storyId: session.storyId },
          cannedMsg,
          ooc,
        );
      });
    } catch (err: any) {
      if (err instanceof ConflictException && err.message === 'SESSION_LOCKED') {
        throw new AppException(ERR.SESSION_LOCKED);
      }
      throw err;
    }
  }

  @Post('sessions/:sid/end')
  @HttpCode(HttpStatus.OK)
  @Throttle(10, 60)
  @Idempotent('chat-end', 3600)
  async endSession(
    @CurrentUser() u: AuthUser,
    @Param('sid', ParseUUIDPipe) sid: string,
  ) {
    return this.endChatService.execute(sid, u.uid);
  }
}
