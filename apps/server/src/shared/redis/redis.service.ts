import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { UNLOCK_LUA, REDIS_TTL } from './redis.constants';
import { ConflictException } from '@nestjs/common';

export interface LockToken {
  key: string;
  token: string;
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor(private readonly config: ConfigService) {
    this.client = new Redis(config.get<string>('redisUrl') || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });
  }

  async onModuleInit() {
    await this.client.connect();
    this.client.on('error', (e) => this.logger.error('Redis error', e));
    this.client.on('ready', () => this.logger.log('Redis ready'));
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, val: string, ttlSec?: number): Promise<void> {
    if (ttlSec) {
      await this.client.set(key, val, 'EX', ttlSec);
    } else {
      await this.client.set(key, val);
    }
  }

  async del(...keys: string[]): Promise<number> {
    return this.client.del(...keys);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  async expire(key: string, ttlSec: number): Promise<void> {
    await this.client.expire(key, ttlSec);
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      this.logger.warn(`Failed to parse JSON for key: ${key}`);
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSec?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttlSec);
  }

  async acquireLock(
    key: string,
    ttlMs: number = REDIS_TTL.LOCK_DEFAULT_MS,
  ): Promise<LockToken | null> {
    const token = uuidv4();
    const result = await this.client.set(key, token, 'PX', ttlMs, 'NX');
    if (result === 'OK') {
      return { key, token };
    }
    return null;
  }

  async releaseLock(key: string, token: string): Promise<boolean> {
    const result = await this.client.eval(UNLOCK_LUA, 1, key, token);
    return result === 1;
  }

  async withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const lock = await this.acquireLock(key, ttlMs);
    if (!lock) {
      throw new ConflictException('SESSION_LOCKED');
    }
    try {
      return await fn();
    } finally {
      await this.releaseLock(key, lock.token);
    }
  }

  async cacheWrap<T>(key: string, ttlSec: number, factory: () => Promise<T>): Promise<T> {
    const cached = await this.getJson<T>(key);
    if (cached !== null) return cached;
    const fresh = await factory();
    await this.setJson(key, fresh, ttlSec);
    return fresh;
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  raw(): Redis {
    return this.client;
  }
}
