import { applyDecorators, SetMetadata, UseInterceptors } from '@nestjs/common';
import { IdempotencyInterceptor } from './idempotency.interceptor';

export const Idempotent = (scope: string, ttlSec = 3600) =>
  applyDecorators(
    SetMetadata('idempotent', { scope, ttlSec }),
    UseInterceptors(IdempotencyInterceptor),
  );
