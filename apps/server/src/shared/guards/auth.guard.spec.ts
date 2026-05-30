import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AppException, ERR } from '../errors/app-exception';

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let firebaseAdminMock: any;
  let reflectorMock: any;

  beforeEach(() => {
    firebaseAdminMock = {
      auth: jest.fn().mockReturnValue({
        verifyIdToken: jest.fn(),
      }),
    };
    reflectorMock = {
      getAllAndOverride: jest.fn(),
    };
    guard = new AuthGuard(firebaseAdminMock, reflectorMock as Reflector);
  });

  const createMockContext = (headers: any = {}): ExecutionContext => {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ headers, user: null }),
      }),
    } as unknown as ExecutionContext;
  };

  it('AuthGuard returns true for @Public', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(true);
    const context = createMockContext();
    
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('AuthGuard rejects when no header', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(false);
    const context = createMockContext({});
    
    await expect(guard.canActivate(context)).rejects.toThrow(AppException);
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      code: ERR.INVALID_TOKEN,
    });
  });

  it('AuthGuard rejects bad bearer format', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(false);
    const context = createMockContext({ authorization: 'Basic xyz' });
    
    await expect(guard.canActivate(context)).rejects.toThrow(AppException);
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      code: ERR.INVALID_TOKEN,
    });
  });

  it('AuthGuard attaches req.user on valid', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(false);
    const req = { headers: { authorization: 'Bearer valid_token' }, user: null };
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as unknown as ExecutionContext;

    firebaseAdminMock.auth().verifyIdToken.mockResolvedValue({
      uid: 'user123',
      email: 'user@example.com',
      name: 'User Name',
    });

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(req.user).toBeDefined();
    expect((req.user as any).uid).toBe('user123');
    expect((req.user as any).email).toBe('user@example.com');
  });

  it('AuthGuard rejects on invalid token verification', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(false);
    const context = createMockContext({ authorization: 'Bearer invalid_token' });
    
    firebaseAdminMock.auth().verifyIdToken.mockRejectedValue(new Error('verify error'));

    await expect(guard.canActivate(context)).rejects.toThrow(AppException);
  });
});
