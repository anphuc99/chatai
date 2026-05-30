import { Test, TestingModule } from '@nestjs/testing';
import { CharactersService } from './characters.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { StorageService } from '../../shared/firebase/storage.service';
import { OwnershipService } from '../../shared/ownership/ownership.service';
import { RedisService } from '../../shared/redis/redis.service';
import { AppException } from '../../shared/errors/app-exception';

describe('CharactersService', () => {
  let service: CharactersService;
  let prisma: any;
  let storage: any;
  let ownership: any;
  let redis: any;

  const mockPrisma: any = {
    character: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  mockPrisma.$transaction = jest.fn((cb) => cb(mockPrisma));

  const mockStorage = {
    uploadToPath: jest.fn(),
  };

  const mockOwnership = {
    assertStoryOwner: jest.fn(),
    assertCharacterOwner: jest.fn(),
  };

  const mockRedis = {
    cacheWrap: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CharactersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
        { provide: OwnershipService, useValue: mockOwnership },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<CharactersService>(CharactersService);
    prisma = module.get<PrismaService>(PrismaService);
    storage = module.get<StorageService>(StorageService);
    ownership = module.get<OwnershipService>(OwnershipService);
    redis = module.get<RedisService>(RedisService);

    jest.clearAllMocks();
  });

  describe('listByStory', () => {
    it('should assert story ownership and return cached characters list', async () => {
      const mockCharacters = [
        {
          id: 'char-1',
          storyId: 'story-1',
          name: 'Kore',
          age: 18,
          personality: 'Friendly',
          avatarUrl: null,
          voiceName: 'Kore',
          pitch: 1.0,
          createdAt: new Date(),
        },
      ];
      redis.cacheWrap.mockImplementation((key: string, ttl: number, cb: Function) => cb());
      prisma.character.findMany.mockResolvedValue(mockCharacters);

      const result = await service.listByStory('user-1', 'story-1');

      expect(ownership.assertStoryOwner).toHaveBeenCalledWith('user-1', 'story-1');
      expect(redis.cacheWrap).toHaveBeenCalledWith(
        'cache:char:list:story-1',
        300,
        expect.any(Function),
      );
      expect(result[0]?.id).toBe('char-1');
    });
  });

  describe('create', () => {
    it('should assert ownership, create character, and invalidate cache', async () => {
      const mockChar = {
        id: 'char-1',
        storyId: 'story-1',
        name: 'Kore',
        age: 18,
        personality: 'Friendly',
        avatarUrl: null,
        voiceName: 'Kore',
        pitch: 1.0,
        createdAt: new Date(),
      };
      prisma.character.create.mockResolvedValue(mockChar);

      const result = await service.create('user-1', 'story-1', {
        name: 'Kore',
        age: 18,
        personality: 'Friendly',
        voiceName: 'Kore',
        pitch: 1.0,
      });

      expect(ownership.assertStoryOwner).toHaveBeenCalledWith('user-1', 'story-1');
      expect(prisma.character.create).toHaveBeenCalledWith({
        data: {
          storyId: 'story-1',
          name: 'Kore',
          age: 18,
          personality: 'Friendly',
          voiceName: 'Kore',
          pitch: 1.0,
          avatarUrl: null,
        },
      });
      expect(redis.del).toHaveBeenCalledWith('cache:char:list:story-1');
      expect(redis.del).toHaveBeenCalledWith('cache:char:char-1');
      expect(result.id).toBe('char-1');
    });

    it('should throw INVALID_PAYLOAD if voice is invalid', async () => {
      await expect(
        service.create('user-1', 'story-1', {
          name: 'Kore',
          age: 18,
          personality: 'Friendly',
          voiceName: 'InvalidVoice' as any,
          pitch: 1.0,
        }),
      ).rejects.toThrow(AppException);
    });
  });

  describe('update', () => {
    it('should assert character ownership, update character and invalidate cache', async () => {
      const existingChar = { id: 'char-1', storyId: 'story-1' };
      ownership.assertCharacterOwner.mockResolvedValue(existingChar);

      const mockChar = {
        id: 'char-1',
        storyId: 'story-1',
        name: 'Kore New',
        age: 20,
        personality: 'Angry',
        avatarUrl: null,
        voiceName: 'Kore',
        pitch: 1.2,
        createdAt: new Date(),
      };
      prisma.character.update.mockResolvedValue(mockChar);

      const result = await service.update('user-1', 'char-1', {
        name: 'Kore New',
        age: 20,
        personality: 'Angry',
        pitch: 1.2,
      });

      expect(ownership.assertCharacterOwner).toHaveBeenCalledWith('user-1', 'char-1');
      expect(prisma.character.update).toHaveBeenCalledWith({
        where: { id: 'char-1' },
        data: {
          name: 'Kore New',
          age: 20,
          personality: 'Angry',
          pitch: 1.2,
        },
      });
      expect(redis.del).toHaveBeenCalledWith('cache:char:list:story-1');
      expect(redis.del).toHaveBeenCalledWith('cache:char:char-1');
      expect(result.personality).toBe('Angry');
    });
  });

  describe('delete', () => {
    it('should assert character ownership, delete character and invalidate cache', async () => {
      const existingChar = { id: 'char-1', storyId: 'story-1' };
      ownership.assertCharacterOwner.mockResolvedValue(existingChar);

      await service.delete('user-1', 'char-1');

      expect(ownership.assertCharacterOwner).toHaveBeenCalledWith('user-1', 'char-1');
      expect(prisma.character.delete).toHaveBeenCalledWith({
        where: { id: 'char-1' },
      });
      expect(redis.del).toHaveBeenCalledWith('cache:char:list:story-1');
      expect(redis.del).toHaveBeenCalledWith('cache:char:char-1');
    });
  });

  describe('uploadAvatar', () => {
    it('should upload avatar, update DB, and invalidate cache', async () => {
      const existingChar = { id: 'char-1', storyId: 'story-1' };
      ownership.assertCharacterOwner.mockResolvedValue(existingChar);

      const mockFile: any = {
        buffer: Buffer.from('mockImage'),
        size: 100,
        mimetype: 'image/jpeg',
      };
      storage.uploadToPath.mockResolvedValue({
        publicUrl: 'http://storage.com/char-1.jpg',
        storagePath: 'characters/char-1/123.jpg',
      });

      const result = await service.uploadAvatar('user-1', 'char-1', mockFile);

      expect(ownership.assertCharacterOwner).toHaveBeenCalledWith('user-1', 'char-1');
      expect(storage.uploadToPath).toHaveBeenCalledWith(
        expect.stringContaining('characters/char-1/'),
        expect.any(Buffer),
        'image/jpeg',
      );
      expect(prisma.character.update).toHaveBeenCalledWith({
        where: { id: 'char-1' },
        data: { avatarUrl: 'http://storage.com/char-1.jpg' },
      });
      expect(redis.del).toHaveBeenCalledWith('cache:char:list:story-1');
      expect(redis.del).toHaveBeenCalledWith('cache:char:char-1');
      expect(result.avatarUrl).toBe('http://storage.com/char-1.jpg');
    });

    it('should throw INVALID_PAYLOAD if file size exceeds 2MB', async () => {
      const existingChar = { id: 'char-1', storyId: 'story-1' };
      ownership.assertCharacterOwner.mockResolvedValue(existingChar);

      const largeFile: any = {
        buffer: Buffer.from('large'),
        size: 3 * 1024 * 1024,
        mimetype: 'image/jpeg',
      };

      await expect(service.uploadAvatar('user-1', 'char-1', largeFile)).rejects.toThrow(
        AppException,
      );
    });

    it('should throw INVALID_PAYLOAD if mimetype is invalid', async () => {
      const existingChar = { id: 'char-1', storyId: 'story-1' };
      ownership.assertCharacterOwner.mockResolvedValue(existingChar);

      const badFile: any = {
        buffer: Buffer.from('bad'),
        size: 100,
        mimetype: 'application/pdf',
      };

      await expect(service.uploadAvatar('user-1', 'char-1', badFile)).rejects.toThrow(
        AppException,
      );
    });
  });
});
