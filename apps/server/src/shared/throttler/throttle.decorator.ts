import { SetMetadata } from '@nestjs/common';

export interface ThrottleOptions {
  limit: number;
  windowSec: number;
}

export const Throttle = (limit: number, windowSec: number) => SetMetadata('throttle', { limit, windowSec });
