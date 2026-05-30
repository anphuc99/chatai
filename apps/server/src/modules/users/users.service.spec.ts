import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { FirestoreService } from '../../shared/firebase/firestore.service';
import { StorageService } from '../../shared/firebase/storage.service';
import { RedisService } from '../../shared/redis/redis.service';
import { AppException, ERR } from '../../shared/errors/app-exception';
import { REDIS_PREFIX, REDIS_TTL } from '../../shared/redis/redis.constants';
import { HskLevel } from '@chatai/shared-types';

describe('UsersService', () => {
  let service: UsersService;
  let prismaMock: any;
  let firestoreMock: any;
  let storageMock: any;
  let redisMock: any;

  beforeEach(async () => {
    prismaMock = {
      usersMeta: {
        findUnique: jest.fn(),
      },
    };

    firestoreMock = {
      getUserDoc: jest.fn(),
      updateUserDoc: jest.fn(),
    };

    storageMock = {
      uploadAvatar: jest.fn(),
    };

    redisMock = {
      del: jest.fn(),
      cacheWrap: jest.fn().mockImplementation(async (key, ttl, factory) => {
        return factory();
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: FirestoreService, useValue: firestoreMock },
        { provide: StorageService, useValue: storageMock },
        { provide: RedisService, useValue: redisMock },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getProfile', () => {
    it('should return merged profile from Postgres and Firestore successfully', async () => {
      const uid = 'user123';
      prismaMock.usersMeta.findUnique.mockResolvedValue({
        userId: uid,
        tutorialStep: 3,
      });

      firestoreMock.getUserDoc.mockResolvedValue({
        email: 'user@test.com',
        displayName: 'Test User',
        photoURL: 'avatar.jpg',
        hskLevel: 'HSK2' as HskLevel,
        preferences: {
          narratorLanguage: 'vi',
          showPinyin: true,
          ttsSpeed: 1.0,
        },
        gems: 100,
        currentStreak: 5,
        highestStreak: 10,
        streakFreezeCount: 1,
      });

      const profile = await service.getProfile(uid);

      expect(redisMock.cacheWrap).toHaveBeenCalledWith(
        REDIS_PREFIX.USER_CACHE + uid,
        REDIS_TTL.USER_CACHE_SEC,
        expect.any(Function),
      );
      expect(prismaMock.usersMeta.findUnique).toHaveBeenCalledWith({
        where: { userId: uid },
      });
      expect(firestoreMock.getUserDoc).toHaveBeenCalledWith(uid);
      expect(profile).toEqual({
        uid,
        email: 'user@test.com',
        displayName: 'Test User',
        photoURL: 'avatar.jpg',
        hskLevel: 'HSK2',
        preferences: {
          narratorLanguage: 'vi',
          showPinyin: true,
          ttsSpeed: 1.0,
        },
        gems: 100,
        currentStreak: 5,
        highestStreak: 10,
        streakFreezeCount: 1,
        tutorialStep: 3,
      });
    });

    it('should throw NOT_FOUND if Postgres metadata does not exist', async () => {
      const uid = 'user123';
      prismaMock.usersMeta.findUnique.mockResolvedValue(null);

      await expect(service.getProfile(uid)).rejects.toThrow(AppException);
      await expect(service.getProfile(uid)).rejects.toMatchObject({
        code: ERR.NOT_FOUND,
      });
    });

    it('should throw NOT_FOUND if Firestore doc does not exist', async () => {
      const uid = 'user123';
      prismaMock.usersMeta.findUnique.mockResolvedValue({
        userId: uid,
        tutorialStep: 1,
      });
      firestoreMock.getUserDoc.mockResolvedValue(null);

      await expect(service.getProfile(uid)).rejects.toThrow(AppException);
      await expect(service.getProfile(uid)).rejects.toMatchObject({
        code: ERR.NOT_FOUND,
      });
    });
  });

  describe('updatePreferences', () => {
    it('should update preferences using dot-notation, invalidate cache, and return fresh profile', async () => {
      const uid = 'user123';
      const updateDto = {
        showPinyin: false,
        ttsSpeed: 1.1,
      };

      // Mock update
      firestoreMock.updateUserDoc.mockResolvedValue(undefined);

      // Mock getProfile flow after update
      prismaMock.usersMeta.findUnique.mockResolvedValue({
        userId: uid,
        tutorialStep: 2,
      });
      firestoreMock.getUserDoc.mockResolvedValue({
        email: 'user@test.com',
        displayName: 'Test User',
        photoURL: 'avatar.jpg',
        hskLevel: 'HSK1' as HskLevel,
        preferences: {
          narratorLanguage: 'vi',
          showPinyin: false,
          ttsSpeed: 1.1,
        },
        gems: 50,
        currentStreak: 2,
        highestStreak: 2,
        streakFreezeCount: 0,
      });

      const updatedProfile = await service.updatePreferences(uid, updateDto);

      expect(firestoreMock.updateUserDoc).toHaveBeenCalledWith(uid, {
        'preferences.showPinyin': false,
        'preferences.ttsSpeed': 1.1,
      });
      expect(redisMock.del).toHaveBeenCalledWith(REDIS_PREFIX.USER_CACHE + uid);
      expect(updatedProfile.preferences.showPinyin).toBe(false);
      expect(updatedProfile.preferences.ttsSpeed).toBe(1.1);
    });

    it('should skip update if no preferences are provided but still return profile', async () => {
      const uid = 'user123';
      
      prismaMock.usersMeta.findUnique.mockResolvedValue({
        userId: uid,
        tutorialStep: 1,
      });
      firestoreMock.getUserDoc.mockResolvedValue({
        email: 'user@test.com',
        displayName: 'Test User',
        photoURL: 'avatar.jpg',
        hskLevel: 'HSK1' as HskLevel,
        preferences: {
          narratorLanguage: 'vi',
          showPinyin: true,
          ttsSpeed: 1.0,
        },
        gems: 0,
        currentStreak: 0,
        highestStreak: 0,
        streakFreezeCount: 0,
      });

      await service.updatePreferences(uid, {});

      expect(firestoreMock.updateUserDoc).not.toHaveBeenCalled();
      expect(redisMock.del).toHaveBeenCalledWith(REDIS_PREFIX.USER_CACHE + uid);
    });
  });

  describe('uploadAvatar', () => {
    const mockFile = {
      buffer: Buffer.from('test image content'),
      mimetype: 'image/png',
      size: 100,
      filename: 'avatar.png',
      fieldname: 'file',
    };

    it('should upload successfully, update Firestore, and invalidate cache', async () => {
      const uid = 'user123';
      storageMock.uploadAvatar.mockResolvedValue({
        publicUrl: 'http://storage/new_avatar.png',
        storagePath: 'avatars/user123/12345.png',
      });
      firestoreMock.updateUserDoc.mockResolvedValue(undefined);

      const result = await service.uploadAvatar(uid, mockFile);

      expect(storageMock.uploadAvatar).toHaveBeenCalledWith(uid, mockFile.buffer, mockFile.mimetype);
      expect(firestoreMock.updateUserDoc).toHaveBeenCalledWith(uid, {
        photoURL: 'http://storage/new_avatar.png',
      });
      expect(redisMock.del).toHaveBeenCalledWith(REDIS_PREFIX.USER_CACHE + uid);
      expect(result).toEqual({ photoURL: 'http://storage/new_avatar.png' });
    });

    it('should throw INVALID_PAYLOAD if file is too large', async () => {
      const uid = 'user123';
      const largeFile = { ...mockFile, size: 3 * 1024 * 1024 }; // 3MB

      await expect(service.uploadAvatar(uid, largeFile)).rejects.toThrow(AppException);
      await expect(service.uploadAvatar(uid, largeFile)).rejects.toMatchObject({
        code: ERR.INVALID_PAYLOAD,
      });
    });

    it('should throw INVALID_PAYLOAD if mimetype is unsupported', async () => {
      const uid = 'user123';
      const invalidFile = { ...mockFile, mimetype: 'application/pdf' };

      await expect(service.uploadAvatar(uid, invalidFile)).rejects.toThrow(AppException);
      await expect(service.uploadAvatar(uid, invalidFile)).rejects.toMatchObject({
        code: ERR.INVALID_PAYLOAD,
      });
    });
  });
});
