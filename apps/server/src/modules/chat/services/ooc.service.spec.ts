import { Test, TestingModule } from '@nestjs/testing';
import { OocService } from './ooc.service';
import { RedisService } from '../../../shared/redis/redis.service';
import { AppException, ERR } from '../../../shared/errors/app-exception';
import { REDIS_PREFIX } from '../../../shared/redis/redis.constants';

describe('OocService', () => {
  let service: OocService;
  let store: Map<string, { type: string; value: any; ttl?: number }>;

  const mockRedisRaw = {
    rpush: jest.fn().mockImplementation(async (key: string, text: string) => {
      if (!store.has(key)) {
        store.set(key, { type: 'list', value: [] });
      }
      const data = store.get(key);
      if (data) {
        data.value.push(text);
        return data.value.length;
      }
      return 0;
    }),

    eval: jest.fn().mockImplementation(async (script: string, numKeys: number, key: string) => {
      // Simulate the pullAll lua script
      if (script.includes('LRANGE') && script.includes('DEL')) {
        const data = store.get(key);
        const items = data && data.type === 'list' ? [...data.value] : [];
        store.delete(key);
        return items;
      }
      return [];
    }),

    sadd: jest.fn().mockImplementation(async (key: string, ...ids: string[]) => {
      if (!store.has(key)) {
        store.set(key, { type: 'set', value: new Set() });
      }
      const data = store.get(key);
      let added = 0;
      if (data) {
        for (const id of ids) {
          if (!data.value.has(id)) {
            data.value.add(id);
            added++;
          }
        }
      }
      return added;
    }),

    srem: jest.fn().mockImplementation(async (key: string, id: string) => {
      const data = store.get(key);
      if (data && data.type === 'set') {
        const deleted = data.value.delete(id);
        return deleted ? 1 : 0;
      }
      return 0;
    }),

    smembers: jest.fn().mockImplementation(async (key: string) => {
      const data = store.get(key);
      if (data && data.type === 'set') {
        return Array.from(data.value);
      }
      return [];
    }),

    hset: jest.fn().mockImplementation(async (key: string, field: string, value: string) => {
      if (!store.has(key)) {
        store.set(key, { type: 'hash', value: new Map() });
      }
      const data = store.get(key);
      if (data) {
        data.value.set(field, value);
      }
      return 1;
    }),

    hvals: jest.fn().mockImplementation(async (key: string) => {
      const data = store.get(key);
      if (data && data.type === 'hash') {
        return Array.from(data.value.values());
      }
      return [];
    }),

    hdel: jest.fn().mockImplementation(async (key: string, field: string) => {
      const data = store.get(key);
      if (data && data.type === 'hash') {
        const deleted = data.value.delete(field);
        return deleted ? 1 : 0;
      }
      return 0;
    }),

    expire: jest.fn().mockImplementation(async (key: string, ttl: number) => {
      const data = store.get(key);
      if (data) {
        data.ttl = ttl;
      }
      return 1;
    }),

    multi: jest.fn().mockImplementation(() => {
      const operations: Array<() => Promise<void>> = [];

      const chain = {
        del: jest.fn().mockImplementation((key: string) => {
          operations.push(async () => {
            store.delete(key);
          });
          return chain;
        }),
        sadd: jest.fn().mockImplementation((key: string, ...ids: string[]) => {
          operations.push(async () => {
            if (!store.has(key)) {
              store.set(key, { type: 'set', value: new Set() });
            }
            const data = store.get(key);
            if (data) {
              for (const id of ids) {
                data.value.add(id);
              }
            }
          });
          return chain;
        }),
        expire: jest.fn().mockImplementation((key: string, ttl: number) => {
          operations.push(async () => {
            const data = store.get(key);
            if (data) {
              data.ttl = ttl;
            }
          });
          return chain;
        }),
        exec: jest.fn().mockImplementation(async () => {
          for (const op of operations) {
            await op();
          }
          return [];
        }),
      };
      return chain;
    }),
  };

  const mockRedisService = {
    get: jest.fn().mockImplementation(async (key: string) => {
      const data = store.get(key);
      return data && data.type === 'string' ? data.value : null;
    }),

    set: jest.fn().mockImplementation(async (key: string, value: string, ttl?: number) => {
      store.set(key, { type: 'string', value, ttl });
    }),

    del: jest.fn().mockImplementation(async (...keys: string[]) => {
      let count = 0;
      for (const key of keys) {
        if (store.delete(key)) {
          count++;
        }
      }
      return count;
    }),

    expire: jest.fn().mockImplementation(async (key: string, ttl: number) => {
      const data = store.get(key);
      if (data) {
        data.ttl = ttl;
        return true;
      }
      return false;
    }),

    raw: jest.fn().mockReturnValue(mockRedisRaw),
  };

  beforeEach(async () => {
    store = new Map();
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OocService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<OocService>(OocService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Persistent OOC', () => {
    const sid = 'session-123';
    const key = `${REDIS_PREFIX.OOC_PERSISTENT}${sid}`;

    it('should set, get and clear persistent text', async () => {
      await service.setPersistent(sid, 'Hello persistent');
      
      const record = store.get(key);
      expect(record).toBeDefined();
      expect(record!.type).toBe('string');
      expect(record!.value).toBe('Hello persistent');
      expect(record!.ttl).toBe(86400);

      const val = await service.getPersistent(sid);
      expect(val).toBe('Hello persistent');

      await service.clearPersistent(sid);
      expect(store.has(key)).toBe(false);
      expect(await service.getPersistent(sid)).toBeNull();
    });

    it('should throw INVALID_PAYLOAD if persistent text is too long (> 5000 characters)', async () => {
      const longText = 'a'.repeat(5001);
      await expect(service.setPersistent(sid, longText)).rejects.toThrow(
        new AppException(ERR.INVALID_PAYLOAD, 'Persistent OOC text length cannot exceed 5000 characters'),
      );
    });
  });

  describe('Ephemeral OOC', () => {
    const sid = 'session-123';
    const key = `${REDIS_PREFIX.OOC_EPHEMERAL}${sid}`;

    it('should push and pull all ephemeral messages atomically', async () => {
      await service.pushEphemeral(sid, 'msg1');
      await service.pushEphemeral(sid, 'msg2');
      await service.pushEphemeral(sid, 'msg3');

      const record = store.get(key);
      expect(record).toBeDefined();
      expect(record!.type).toBe('list');
      expect(record!.value).toEqual(['msg1', 'msg2', 'msg3']);
      expect(record!.ttl).toBe(86400);

      // First pull gets all items and deletes key
      const pulled = await service.pullAllEphemeral(sid);
      expect(pulled).toEqual(['msg1', 'msg2', 'msg3']);
      expect(store.has(key)).toBe(false);

      // Second pull returns empty array
      const pulledAgain = await service.pullAllEphemeral(sid);
      expect(pulledAgain).toEqual([]);
    });
  });

  describe('Active Characters', () => {
    const sid = 'session-123';
    const key = `${REDIS_PREFIX.OOC_ACTIVE_CHARS}${sid}`;

    it('should set active characters and clear old ones via pipeline', async () => {
      // Setup initial characters
      store.set(key, { type: 'set', value: new Set(['char1', 'char2']) });

      await service.setActiveCharacters(sid, ['char3', 'char4']);

      const record = store.get(key);
      expect(record).toBeDefined();
      expect(record!.type).toBe('set');
      expect(Array.from(record!.value)).toEqual(['char3', 'char4']);
      expect(record!.ttl).toBe(86400);
    });

    it('should add and remove active characters', async () => {
      await service.addActive(sid, 'char1');
      await service.addActive(sid, 'char2');

      let active = await service.getActiveCharacters(sid);
      expect(active).toContain('char1');
      expect(active).toContain('char2');
      
      const record = store.get(key);
      expect(record).toBeDefined();
      expect(record!.ttl).toBe(86400);

      await service.removeActive(sid, 'char1');
      active = await service.getActiveCharacters(sid);
      expect(active).not.toContain('char1');
      expect(active).toContain('char2');
    });
  });

  describe('Temporary Characters', () => {
    const sid = 'session-123';
    const key = `${REDIS_PREFIX.OOC_TEMP_CHARS}${sid}`;

    it('should add temporary characters with valid format and retrieve them', async () => {
      const tc1 = { name: 'Temp Character 1', description: 'Friendly merchant' };
      const tc2 = { name: 'Temp Character 2', description: 'Angry dragon' };

      const tempId1 = await service.addTemporary(sid, tc1);
      const tempId2 = await service.addTemporary(sid, tc2);

      expect(tempId1).toMatch(/^tmp_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(tempId2).toMatch(/^tmp_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

      const record = store.get(key);
      expect(record).toBeDefined();
      expect(record!.type).toBe('hash');
      expect(record!.ttl).toBe(86400);

      const temps = await service.getTemporaries(sid);
      expect(temps).toHaveLength(2);

      const char1 = temps.find((t) => t.tempId === tempId1);
      expect(char1).toBeDefined();
      expect(char1!.name).toBe(tc1.name);
      expect(char1!.description).toBe(tc1.description);
      expect(char1!.createdAt).toBeLessThanOrEqual(Date.now());

      await service.removeTemporary(sid, tempId1);
      const tempsRemaining = await service.getTemporaries(sid);
      expect(tempsRemaining).toHaveLength(1);
      expect(tempsRemaining[0]!.tempId).toBe(tempId2);
    });
  });

  describe('Session Cleanup', () => {
    it('should cleanup all 4 keys when cleanupSession is called', async () => {
      const sid = 'session-123';
      
      await service.setPersistent(sid, 'persistent data');
      await service.pushEphemeral(sid, 'ephemeral data');
      await service.addActive(sid, 'char1');
      await service.addTemporary(sid, { name: 'temp', description: 'desc' });

      // Verify keys exist in store
      expect(store.has(`${REDIS_PREFIX.OOC_PERSISTENT}${sid}`)).toBe(true);
      expect(store.has(`${REDIS_PREFIX.OOC_EPHEMERAL}${sid}`)).toBe(true);
      expect(store.has(`${REDIS_PREFIX.OOC_ACTIVE_CHARS}${sid}`)).toBe(true);
      expect(store.has(`${REDIS_PREFIX.OOC_TEMP_CHARS}${sid}`)).toBe(true);

      await service.cleanupSession(sid);

      // Verify all keys are removed
      expect(store.has(`${REDIS_PREFIX.OOC_PERSISTENT}${sid}`)).toBe(false);
      expect(store.has(`${REDIS_PREFIX.OOC_EPHEMERAL}${sid}`)).toBe(false);
      expect(store.has(`${REDIS_PREFIX.OOC_ACTIVE_CHARS}${sid}`)).toBe(false);
      expect(store.has(`${REDIS_PREFIX.OOC_TEMP_CHARS}${sid}`)).toBe(false);
    });
  });
});
