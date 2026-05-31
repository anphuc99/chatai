import { Controller, Get, Query, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { JournalService } from './journal.service';
import { ListSessionsDto } from './dto/list-sessions.dto';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { AuthUser } from '../../shared/types/auth-user';
import { RedisThrottlerGuard } from '../../shared/throttler/redis-throttler.guard';
import { Throttle } from '../../shared/throttler/throttle.decorator';

@Controller('journal')
@UseGuards(RedisThrottlerGuard)
export class JournalController {
  constructor(private readonly journalService: JournalService) {}

  @Get('sessions')
  @Throttle(60, 60)
  async list(
    @CurrentUser() u: AuthUser,
    @Query() q: ListSessionsDto,
  ) {
    return this.journalService.list(u.uid, q);
  }

  @Get('sessions/:sid')
  @Throttle(60, 60)
  async detail(
    @CurrentUser() u: AuthUser,
    @Param('sid', ParseUUIDPipe) sid: string,
  ) {
    return this.journalService.detail(u.uid, sid);
  }
}
