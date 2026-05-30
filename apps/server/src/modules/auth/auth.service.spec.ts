import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { FIREBASE_ADMIN } from '../../shared/firebase/firebase.module';
import { FirestoreService } from '../../shared/firebase/firestore.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AppException, ERR } from '../../shared/errors/app-exception';

describe('AuthService', () => {
  let service: AuthService;
  let firebaseAdminMock: any;
  let prismaMock: any;
  let firestoreMock: any;

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

    firestoreMock = {
      getUserDoc: jest.fn(),
      createUserDoc: jest.fn(),
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
        {
          provide: FirestoreService,
          useValue: firestoreMock,
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
    it('upsertUser creates row and firestore doc when none exist', async () => {
      const decodedMock = { uid: 'uid123', email: 'test@abc.com', name: 'Test', picture: 'pic' };
      prismaMock.usersMeta.upsert.mockResolvedValue({ userId: 'uid123', tutorialStep: 0 });
      
      firestoreMock.getUserDoc
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          email: 'test@abc.com',
          displayName: 'Test',
          photoURL: 'pic',
          hskLevel: 'HSK1',
          preferences: { narratorLanguage: 'vi', showPinyin: true, ttsSpeed: 1.0 },
          gems: 0,
          currentStreak: 0,
          highestStreak: 0,
          streakFreezeCount: 0,
        });

      const result = await service.upsertUser(decodedMock as any);
      expect(prismaMock.usersMeta.upsert).toHaveBeenCalledWith({
        where: { userId: 'uid123' },
        create: { userId: 'uid123', tutorialStep: 0 },
        update: {},
      });
      expect(firestoreMock.createUserDoc).toHaveBeenCalledWith('uid123', {
        email: 'test@abc.com',
        displayName: 'Test',
        photoURL: 'pic',
        hskLevel: 'HSK1',
        preferences: { narratorLanguage: 'vi', showPinyin: true, ttsSpeed: 1.0 },
        gems: 0,
        currentStreak: 0,
        highestStreak: 0,
        streakFreezeCount: 0,
      });
      expect(result.uid).toBe('uid123');
      expect(result.email).toBe('test@abc.com');
      expect(result.displayName).toBe('Test');
      expect(result.tutorialStep).toBe(0);
    });

    it('upsertUser reads from firestore doc when exists', async () => {
      const decodedMock = { uid: 'uid123', email: 'test@abc.com', name: 'Test', picture: 'pic' };
      prismaMock.usersMeta.upsert.mockResolvedValue({ userId: 'uid123', tutorialStep: 0 });
      
      const firestoreUser = {
        email: 'existing@abc.com',
        displayName: 'Existing Name',
        photoURL: 'existing_pic',
        hskLevel: 'HSK2',
        preferences: { narratorLanguage: 'en', showPinyin: false, ttsSpeed: 1.1 },
        gems: 10,
        currentStreak: 2,
        highestStreak: 5,
        streakFreezeCount: 1,
      };
      
      firestoreMock.getUserDoc.mockResolvedValue(firestoreUser);

      const result = await service.upsertUser(decodedMock as any);
      expect(firestoreMock.createUserDoc).not.toHaveBeenCalled();
      expect(result.uid).toBe('uid123');
      expect(result.email).toBe('existing@abc.com');
      expect(result.displayName).toBe('Existing Name');
      expect(result.photoURL).toBe('existing_pic');
      expect(result.hskLevel).toBe('HSK2');
      expect(result.preferences.narratorLanguage).toBe('en');
      expect(result.gems).toBe(10);
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

