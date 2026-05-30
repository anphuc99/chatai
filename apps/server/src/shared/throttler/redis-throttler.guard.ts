import { Injectable, CanActivate, ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RedisService } from '../redis/redis.service';
import { AppException, ERR } from '../errors/app-exception';
import { ThrottleOptions } from './throttle.decorator';

@Injectable()
export class RedisThrottlerGuard implements CanActivate {
  private readonly logger = new Logger(RedisThrottlerGuard.name);

  constructor(
    private readonly redis: RedisService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<ThrottleOptions>('throttle', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!meta) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const uid = req.user?.uid ?? req.ip;
    
    // Fastify request pattern uses req.routeOptions?.url or fallback to req.url
    const routeUrl = req.routeOptions?.url ?? req.url;
    const route = `${req.method}:${routeUrl}`;
    
    const windowBucket = Math.floor(Date.now() / 1000 / meta.windowSec) * meta.windowSec;
    const key = `rl:${uid}:${route}:${windowBucket}`;

    try {
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(key, meta.windowSec);
      }

      if (count > meta.limit) {
        this.logger.warn(`Rate limit exceeded for user/IP ${uid} on route ${route}. Current count: ${count}/${meta.limit}`);
        throw new AppException(
          ERR.RATE_LIMIT,
          `Yêu cầu quá thường xuyên. Giới hạn tối đa là ${meta.limit} yêu cầu mỗi ${meta.windowSec} giây.`
        );
      }

      return true;
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }
      this.logger.error(`Failed to execute rate limit guard: ${error instanceof Error ? error.message : String(error)}`);
      // Fail-open to avoid service downtime if Redis fails
      return true;
    }
  }
}
