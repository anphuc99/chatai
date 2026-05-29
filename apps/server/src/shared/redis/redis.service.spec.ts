import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

// Mock ioredis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(0),
    expire: jest.fn().mockResolvedValue(1),
    incr: jest.fn().mockResolvedValue(1),
    ping: jest.fn().mockResolvedValue('PONG'),
    eval: jest.fn().mockResolvedValue(1),
    on: jest.fn(),
  }));
});

describe('RedisService', () => {
  let service: RedisService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              const map: Record<string, any> = {
                redisUrl: 'redis://localhost:6379',
              };
              return map[key];
            },
          },
        },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('ping returns true', async () => {
    const result = await service.ping();
    expect(result).toBe(true);
  });

  it('setJson then getJson returns typed object', async () => {
    const mockData = { name: 'test', value: 123 };
    const mockClient = (service as any).client;
    mockClient.get.mockResolvedValueOnce(JSON.stringify(mockData));

    const result = await service.getJson<typeof mockData>('test-key');
    expect(result).toEqual(mockData);
  });

  it('acquireLock returns token when set succeeds', async () => {
    const mockClient = (service as any).client;
    mockClient.set.mockResolvedValueOnce('OK');

    const result = await service.acquireLock('test-lock', 5000);
    expect(result).not.toBeNull();
    expect(result?.key).toBe('test-lock');
    expect(result?.token).toBeDefined();
  });

  it('acquireLock returns null when key exists', async () => {
    const mockClient = (service as any).client;
    mockClient.set.mockResolvedValueOnce(null);

    const result = await service.acquireLock('test-lock', 5000);
    expect(result).toBeNull();
  });

  it('releaseLock with correct token deletes', async () => {
    const mockClient = (service as any).client;
    mockClient.eval.mockResolvedValueOnce(1);

    const result = await service.releaseLock('test-lock', 'correct-token');
    expect(result).toBe(true);
  });

  it('releaseLock with wrong token returns false', async () => {
    const mockClient = (service as any).client;
    mockClient.eval.mockResolvedValueOnce(0);

    const result = await service.releaseLock('test-lock', 'wrong-token');
    expect(result).toBe(false);
  });
});
