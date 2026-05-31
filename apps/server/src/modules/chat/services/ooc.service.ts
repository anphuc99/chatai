import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { RedisService } from '../../../shared/redis/redis.service';
import { REDIS_PREFIX } from '../../../shared/redis/redis.constants';
import { AppException, ERR } from '../../../shared/errors/app-exception';
import { TempCharacter } from '../types/temp-character';

@Injectable()
export class OocService {
  private readonly logger = new Logger(OocService.name);
  private readonly TTL = 86400; // 24 hours

  constructor(private readonly redis: RedisService) {}

  private persistentKey(sid: string): string {
    return `${REDIS_PREFIX.OOC_PERSISTENT}${sid}`;
  }

  private ephemeralKey(sid: string): string {
    return `${REDIS_PREFIX.OOC_EPHEMERAL}${sid}`;
  }

  private activeCharsKey(sid: string): string {
    return `${REDIS_PREFIX.OOC_ACTIVE_CHARS}${sid}`;
  }

  private tempCharsKey(sid: string): string {
    return `${REDIS_PREFIX.OOC_TEMP_CHARS}${sid}`;
  }

  async setPersistent(sid: string, text: string): Promise<void> {
    if (text.length > 5000) {
      throw new AppException(ERR.INVALID_PAYLOAD, 'Persistent OOC text length cannot exceed 5000 characters');
    }
    const key = this.persistentKey(sid);
    await this.redis.set(key, text, this.TTL);
  }

  async getPersistent(sid: string): Promise<string | null> {
    const key = this.persistentKey(sid);
    return this.redis.get(key);
  }

  async clearPersistent(sid: string): Promise<void> {
    const key = this.persistentKey(sid);
    await this.redis.del(key);
  }

  async pushEphemeral(sid: string, text: string): Promise<void> {
    const key = this.ephemeralKey(sid);
    await this.redis.raw().rpush(key, text);
    await this.redis.expire(key, this.TTL);
  }

  async pullAllEphemeral(sid: string): Promise<string[]> {
    const key = this.ephemeralKey(sid);
    // Lua script to atomically read and delete the list
    const items = await this.redis.raw().eval(
      `local items = redis.call('LRANGE', KEYS[1], 0, -1)
       redis.call('DEL', KEYS[1])
       return items`,
      1,
      key
    );
    return (items as string[]) || [];
  }

  async setActiveCharacters(sid: string, ids: string[]): Promise<void> {
    const key = this.activeCharsKey(sid);
    const pipeline = this.redis.raw().multi();
    pipeline.del(key);
    if (ids.length > 0) {
      pipeline.sadd(key, ...ids);
    }
    pipeline.expire(key, this.TTL);
    await pipeline.exec();
  }

  async addActive(sid: string, id: string): Promise<void> {
    const key = this.activeCharsKey(sid);
    await this.redis.raw().sadd(key, id);
    await this.redis.expire(key, this.TTL);
  }

  async removeActive(sid: string, id: string): Promise<void> {
    const key = this.activeCharsKey(sid);
    await this.redis.raw().srem(key, id);
    await this.redis.expire(key, this.TTL);
  }

  async getActiveCharacters(sid: string): Promise<string[]> {
    const key = this.activeCharsKey(sid);
    return this.redis.raw().smembers(key);
  }

  async addTemporary(sid: string, tc: { name: string; description: string }): Promise<string> {
    const tempId = `tmp_${uuidv4()}`;
    const key = this.tempCharsKey(sid);
    const value = JSON.stringify({
      tempId,
      name: tc.name,
      description: tc.description,
      createdAt: Date.now(),
    });
    await this.redis.raw().hset(key, tempId, value);
    await this.redis.expire(key, this.TTL);
    return tempId;
  }

  async getTemporaries(sid: string): Promise<TempCharacter[]> {
    const key = this.tempCharsKey(sid);
    const raw = await this.redis.raw().hvals(key);
    if (!raw || raw.length === 0) return [];
    return raw.map((val) => JSON.parse(val) as TempCharacter);
  }

  async removeTemporary(sid: string, tempId: string): Promise<void> {
    const key = this.tempCharsKey(sid);
    await this.redis.raw().hdel(key, tempId);
  }

  async cleanupSession(sid: string): Promise<void> {
    await this.redis.del(
      this.persistentKey(sid),
      this.ephemeralKey(sid),
      this.activeCharsKey(sid),
      this.tempCharsKey(sid)
    );
  }
}
