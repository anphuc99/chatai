import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { FIREBASE_ADMIN } from './firebase-admin.provider';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AppException, ERR } from '../../shared/errors/app-exception';

describe('AuthService', () => {
  let service: AuthService;
  let firebaseAdminMock: any;
  let prismaMock: any;

  beforeEach(async () => {
    firebaseAdminMock = {
      auth: jest.fn().mockReturnValue({
        verifyIdToken: jest.fn(),
        revokeRefreshTokens: jest.fn(),
      }),
    };

    prismaMock = {
      usersMeta: {
        upsert: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: FIREBASE_ADMIN,
          useValue: firebaseAdminMock,
        },
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('verifyIdToken', () => {
    it('verifyIdToken returns decoded on valid', async () => {
      const decodedMock = { uid: '123', email: 'test@test.com' };
      firebaseAdminMock.auth().verifyIdToken.mockResolvedValue(decodedMock);

      const result = await service.verifyIdToken('valid_token');
      expect(result).toEqual(decodedMock);
      expect(firebaseAdminMock.auth().verifyIdToken).toHaveBeenCalledWith('valid_token', true);
    });

    it('verifyIdToken throws INVALID_TOKEN on error', async () => {
      firebaseAdminMock.auth().verifyIdToken.mockRejectedValue(new Error('Firebase error'));

      await expect(service.verifyIdToken('invalid_token')).rejects.toThrow(AppException);
      await expect(service.verifyIdToken('invalid_token')).rejects.toMatchObject({
        code: ERR.INVALID_TOKEN,
      });
    });

    it('verifyIdToken throws USER_DISABLED when disabled true', async () => {
      const decodedMock = { uid: '123', disabled: true };
      firebaseAdminMock.auth().verifyIdToken.mockResolvedValue(decodedMock);

      await expect(service.verifyIdToken('disabled_token')).rejects.toThrow(AppException);
      await expect(service.verifyIdToken('disabled_token')).rejects.toMatchObject({
        code: ERR.USER_DISABLED,
      });
    });
  });

  describe('upsertUser', () => {
    it('upsertUser creates row when none', async () => {
      const decodedMock = { uid: 'uid123', email: 'test@abc.com', name: 'Test' };
      prismaMock.usersMeta.upsert.mockResolvedValue({ userId: 'uid123', tutorialStep: 0 });

      const result = await service.upsertUser(decodedMock as any);
      expect(prismaMock.usersMeta.upsert).toHaveBeenCalledWith({
        where: { userId: 'uid123' },
        create: { userId: 'uid123', tutorialStep: 0 },
        update: {},
      });
      expect(result.uid).toBe('uid123');
      expect(result.email).toBe('test@abc.com');
      expect(result.displayName).toBe('Test');
      expect(result.tutorialStep).toBe(0);
    });
  });

  describe('invalidateSession', () => {
    it('calls revokeRefreshTokens', async () => {
      firebaseAdminMock.auth().revokeRefreshTokens.mockResolvedValue(undefined);
      await service.invalidateSession('uid123');
      expect(firebaseAdminMock.auth().revokeRefreshTokens).toHaveBeenCalledWith('uid123');
    });
  });
});
