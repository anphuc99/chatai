import { ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { RedisService } from '../redis/redis.service';
import { AppException, ERR } from '../errors/app-exception';
import { of, firstValueFrom } from 'rxjs';

describe('IdempotencyInterceptor', () => {
  let interceptor: IdempotencyInterceptor;
  let reflectorMock: any;
  let redisServiceMock: any;

  beforeEach(() => {
    reflectorMock = {
      get: jest.fn(),
    };
    redisServiceMock = {
      get: jest.fn(),
      set: jest.fn(),
      acquireLock: jest.fn(),
      releaseLock: jest.fn(),
    };
    interceptor = new IdempotencyInterceptor(
      reflectorMock as unknown as Reflector,
      redisServiceMock as unknown as RedisService,
    );
  });

  const createMockContext = (
    headers: Record<string, string> = {},
    user: { uid: string } | null = { uid: 'user-123' },
  ): ExecutionContext => {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          headers,
          user,
        }),
      }),
    } as unknown as ExecutionContext;
  };

  const createMockCallHandler = (result: any = { status: 'success' }): CallHandler => {
    return {
      handle: jest.fn().mockReturnValue(of(result)),
    };
  };

  it('should ignore if handler does not have idempotent metadata', async () => {
    reflectorMock.get.mockReturnValue(null);
    const context = createMockContext({ 'idempotency-key': 'test-key' });
    const next = createMockCallHandler();

    const resultObs = await interceptor.intercept(context, next);
    const result = await firstValueFrom(resultObs);

    expect(result).toEqual({ status: 'success' });
    expect(next.handle).toHaveBeenCalled();
    expect(redisServiceMock.get).not.toHaveBeenCalled();
  });

  it('should ignore if request does not have idempotency-key header', async () => {
    reflectorMock.get.mockReturnValue({ scope: 'test', ttlSec: 100 });
    const context = createMockContext({});
    const next = createMockCallHandler();

    const resultObs = await interceptor.intercept(context, next);
    const result = await firstValueFrom(resultObs);

    expect(result).toEqual({ status: 'success' });
    expect(next.handle).toHaveBeenCalled();
    expect(redisServiceMock.get).not.toHaveBeenCalled();
  });

  it('should execute call and cache the response on first request', async () => {
    reflectorMock.get.mockReturnValue({ scope: 'test-scope', ttlSec: 60 });
    const context = createMockContext({ 'idempotency-key': 'key-123' });
    const next = createMockCallHandler({ data: 'fresh' });

    redisServiceMock.get.mockResolvedValue(null);
    redisServiceMock.acquireLock.mockResolvedValue({ key: 'lock-key', token: 'token-xyz' });
    redisServiceMock.set.mockResolvedValue(undefined);
    redisServiceMock.releaseLock.mockResolvedValue(true);

    const resultObs = await interceptor.intercept(context, next);
    const result = await firstValueFrom(resultObs);

    expect(result).toEqual({ data: 'fresh' });
    expect(redisServiceMock.get).toHaveBeenCalledWith('idemp:test-scope:user-123:key-123');
    expect(redisServiceMock.acquireLock).toHaveBeenCalledWith(
      'idemp:lock:test-scope:user-123:key-123',
      30000,
    );
    expect(next.handle).toHaveBeenCalled();
    expect(redisServiceMock.set).toHaveBeenCalledWith(
      'idemp:test-scope:user-123:key-123',
      JSON.stringify({ data: 'fresh' }),
      60,
    );
    expect(redisServiceMock.releaseLock).toHaveBeenCalledWith(
      'idemp:lock:test-scope:user-123:key-123',
      'token-xyz',
    );
  });

  it('should return cached response if exist without running endpoint logic', async () => {
    reflectorMock.get.mockReturnValue({ scope: 'test-scope', ttlSec: 60 });
    const context = createMockContext({ 'idempotency-key': 'key-123' });
    const next = createMockCallHandler();

    redisServiceMock.get.mockResolvedValue(JSON.stringify({ data: 'cached' }));

    const resultObs = await interceptor.intercept(context, next);
    const result = await firstValueFrom(resultObs);

    expect(result).toEqual({ data: 'cached' });
    expect(redisServiceMock.get).toHaveBeenCalledWith('idemp:test-scope:user-123:key-123');
    expect(redisServiceMock.acquireLock).not.toHaveBeenCalled();
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('should throw ConflictException if concurrent request is in progress', async () => {
    reflectorMock.get.mockReturnValue({ scope: 'test-scope', ttlSec: 60 });
    const context = createMockContext({ 'idempotency-key': 'key-123' });
    const next = createMockCallHandler();

    redisServiceMock.get.mockResolvedValue(null);
    redisServiceMock.acquireLock.mockResolvedValue(null); // Lock cannot be acquired

    await expect(interceptor.intercept(context, next)).rejects.toThrow(
      new AppException(ERR.IDEMPOTENCY_CONFLICT, 'Concurrent request with same idempotency-key'),
    );

    expect(redisServiceMock.get).toHaveBeenCalled();
    expect(redisServiceMock.acquireLock).toHaveBeenCalled();
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('should distinguish cache by user ID to prevent cross-user contamination', async () => {
    reflectorMock.get.mockReturnValue({ scope: 'test-scope', ttlSec: 60 });
    const contextUser1 = createMockContext({ 'idempotency-key': 'same-key' }, { uid: 'user-1' });
    const contextUser2 = createMockContext({ 'idempotency-key': 'same-key' }, { uid: 'user-2' });

    // Request from User 1
    redisServiceMock.get.mockResolvedValue(null);
    redisServiceMock.acquireLock.mockResolvedValue({ key: 'lock-key', token: 'token-1' });
    const next1 = createMockCallHandler({ from: 'user-1' });
    const resObs1 = await interceptor.intercept(contextUser1, next1);
    const res1 = await firstValueFrom(resObs1);

    expect(res1).toEqual({ from: 'user-1' });
    expect(redisServiceMock.get).toHaveBeenCalledWith('idemp:test-scope:user-1:same-key');

    // Request from User 2
    redisServiceMock.get.mockResolvedValue(null);
    redisServiceMock.acquireLock.mockResolvedValue({ key: 'lock-key', token: 'token-2' });
    const next2 = createMockCallHandler({ from: 'user-2' });
    const resObs2 = await interceptor.intercept(contextUser2, next2);
    const res2 = await firstValueFrom(resObs2);

    expect(res2).toEqual({ from: 'user-2' });
    expect(redisServiceMock.get).toHaveBeenCalledWith('idemp:test-scope:user-2:same-key');
  });
});
