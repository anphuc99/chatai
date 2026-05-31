import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of, firstValueFrom } from 'rxjs';
import { RedisService } from '../redis/redis.service';
import { AppException, ERR } from '../errors/app-exception';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const handler = context.getHandler();
    const meta = this.reflector.get<{ scope: string; ttlSec: number }>('idempotent', handler);
    if (!meta) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest();
    const rawKey = req.headers['idempotency-key'];
    if (!rawKey || typeof rawKey !== 'string') {
      return next.handle();
    }

    const uid = req.user?.uid ?? 'anon';
    const redisKey = `idemp:${meta.scope}:${uid}:${rawKey}`;

    const cached = await this.redis.get(redisKey);
    if (cached) {
      try {
        return of(JSON.parse(cached));
      } catch {
        // Bỏ qua nếu dữ liệu cache bị hỏng
      }
    }

    const lockKey = `idemp:lock:${meta.scope}:${uid}:${rawKey}`;
    const lock = await this.redis.acquireLock(lockKey, 30000);
    if (!lock) {
      throw new AppException(
        ERR.IDEMPOTENCY_CONFLICT,
        'Concurrent request with same idempotency-key',
      );
    }

    try {
      const result = await firstValueFrom(next.handle());
      await this.redis.set(redisKey, JSON.stringify(result), meta.ttlSec);
      return of(result);
    } finally {
      await this.redis.releaseLock(lockKey, lock.token);
    }
  }
}
