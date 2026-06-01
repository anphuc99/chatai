import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../shared/redis/redis.service';
import { AppException, ERR } from '../../../shared/errors/app-exception';

@Injectable()
export class AutoRateLimiterService {
  constructor(private readonly redis: RedisService) {}

  async checkAndConsume(sid: string): Promise<void> {
    const key = `auto:rl:${sid}`;
    const ok = await this.redis.raw().set(key, '1', 'EX', 3, 'NX');
    if (!ok) {
      const ttl = await this.redis.raw().ttl(key);
      const retryAfter = Math.max(ttl, 0);
      throw new AppException(ERR.RATE_LIMIT, `Retry after ${retryAfter}s`, undefined, { retryAfter });
    }
  }
}
