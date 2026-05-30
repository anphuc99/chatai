import { Test, TestingModule } from '@nestjs/testing';
import { StoriesService } from './stories.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import { AppException } from '../../shared/errors/app-exception';

describe('StoriesService', () => {
  let service: StoriesService;
  let prisma: any;
  let redis: any;

  const mockPrisma = {
    story: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockRedis = {
    cacheWrap: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoriesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<StoriesService>(StoriesService);
    prisma = module.get<PrismaService>(PrismaService);
    redis = module.get<RedisService>(RedisService);

    jest.clearAllMocks();
  });

  describe('list', () => {
    it('should use cacheWrap for first page (no cursor and limit=20)', async () => {
      const mockResult = { items: [], nextCursor: undefined };
      redis.cacheWrap.mockResolvedValue(mockResult);

      const result = await service.list('user-1', undefined, 20);

      expect(redis.cacheWrap).toHaveBeenCalledWith(
        'cache:story:list:user-1',
        300,
        expect.any(Function),
      );
      expect(result).toEqual(mockResult);
    });

    it('should fetch from DB directly if cursor is provided', async () => {
      const mockRows = [
        {
          id: 'story-1',
          userId: 'user-1',
          title: 'Title',
          initialSetting: 'Setting',
          currentProgress: '',
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { characters: 0 },
        },
      ];
      prisma.story.findMany.mockResolvedValue(mockRows);

      const result = await service.list('user-1', 'story-0', 20);

      expect(redis.cacheWrap).not.toHaveBeenCalled();
      expect(prisma.story.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        take: 21,
        cursor: { id: 'story-0' },
        skip: 1,
        orderBy: { updatedAt: 'desc' },
        include: { _count: { select: { characters: true } } },
      });
      expect(result.items.length).toBe(1);
    });

    it('should fetch from DB directly if limit is not 20', async () => {
      const mockRows: any[] = [];
      prisma.story.findMany.mockResolvedValue(mockRows);

      const _result = await service.list('user-1', undefined, 10);

      expect(redis.cacheWrap).not.toHaveBeenCalled();
      expect(prisma.story.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        take: 11,
        cursor: undefined,
        skip: 0,
        orderBy: { updatedAt: 'desc' },
        include: { _count: { select: { characters: true } } },
      });
    });

    it('should return nextCursor if there are more items', async () => {
      const mockRows = Array.from({ length: 5 }, (_, i) => ({
        id: `story-${i}`,
        userId: 'user-1',
        title: `Story ${i}`,
        initialSetting: 'Setting',
        currentProgress: '',
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { characters: 0 },
      }));
      prisma.story.findMany.mockResolvedValue(mockRows);

      // Gọi với limit là 4, DB trả về 5 items
      const result = await service.list('user-1', undefined, 4);

      expect(result.items.length).toBe(4);
      expect(result.nextCursor).toBe('story-3');
    });
  });

  describe('getById', () => {
    it('should return story if user is the owner', async () => {
      const mockStoryDto = {
        id: 'story-1',
        userId: 'user-1',
        title: 'Story 1',
        initialSetting: 'Setting',
        currentProgress: '',
        characterCount: 0,
        sessionCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      redis.cacheWrap.mockResolvedValue(mockStoryDto);

      const result = await service.getById('user-1', 'story-1');

      expect(redis.cacheWrap).toHaveBeenCalledWith(
        'cache:story:story-1',
        300,
        expect.any(Function),
      );
      expect(result).toEqual(mockStoryDto);
    });

    it('should throw FORBIDDEN if user is not the owner', async () => {
      const mockStoryDto = {
        id: 'story-1',
        userId: 'user-2', // different owner
        title: 'Story 1',
        initialSetting: 'Setting',
        currentProgress: '',
        characterCount: 0,
        sessionCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      redis.cacheWrap.mockResolvedValue(mockStoryDto);

      await expect(service.getById('user-1', 'story-1')).rejects.toThrow(
        new AppException('FORBIDDEN', 'Không có quyền truy cập câu chuyện này'),
      );
    });
  });

  describe('create', () => {
    it('should insert story and invalidate cache', async () => {
      const mockStory = {
        id: 'story-new',
        userId: 'user-1',
        title: 'New Story',
        initialSetting: 'New Setting',
        currentProgress: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.story.create.mockResolvedValue(mockStory);

      const result = await service.create('user-1', {
        title: 'New Story',
        initialSetting: 'New Setting',
      });

      expect(prisma.story.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          title: 'New Story',
          initialSetting: 'New Setting',
        },
      });
      expect(redis.del).toHaveBeenCalledWith('cache:story:list:user-1');
      expect(result.id).toBe('story-new');
    });
  });

  describe('update', () => {
    it('should update story and invalidate cache', async () => {
      const existingStory = {
        id: 'story-1',
        userId: 'user-1',
        title: 'Old Title',
        initialSetting: 'Old Setting',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.story.findUnique.mockResolvedValue(existingStory);

      const updatedStory = {
        ...existingStory,
        title: 'Updated Title',
        _count: { characters: 2 },
      };
      prisma.story.update.mockResolvedValue(updatedStory);

      const result = await service.update('user-1', 'story-1', {
        title: 'Updated Title',
      });

      expect(prisma.story.update).toHaveBeenCalledWith({
        where: { id: 'story-1' },
        data: { title: 'Updated Title' },
        include: { _count: { select: { characters: true } } },
      });
      expect(redis.del).toHaveBeenCalledWith('cache:story:list:user-1');
      expect(redis.del).toHaveBeenCalledWith('cache:story:story-1');
      expect(result.title).toBe('Updated Title');
    });

    it('should throw NOT_FOUND if story does not exist', async () => {
      prisma.story.findUnique.mockResolvedValue(null);

      await expect(
        service.update('user-1', 'story-1', { title: 'New' }),
      ).rejects.toThrow(new AppException('NOT_FOUND', 'Không tìm thấy câu chuyện'));
    });
  });

  describe('delete', () => {
    it('should delete story and invalidate cache if no active session', async () => {
      const existingStory = {
        id: 'story-1',
        userId: 'user-1',
        title: 'Title',
        initialSetting: 'Setting',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.story.findUnique.mockResolvedValue(existingStory);

      // hasActiveSession returns false by default mock setup since prisma.session is not defined in mockPrisma
      await service.delete('user-1', 'story-1');

      expect(prisma.story.delete).toHaveBeenCalledWith({
        where: { id: 'story-1' },
      });
      expect(redis.del).toHaveBeenCalledWith('cache:story:list:user-1');
      expect(redis.del).toHaveBeenCalledWith('cache:story:story-1');
    });

    it('should throw STORY_HAS_ACTIVE_SESSION if active session exists', async () => {
      const existingStory = {
        id: 'story-1',
        userId: 'user-1',
        title: 'Title',
        initialSetting: 'Setting',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.story.findUnique.mockResolvedValue(existingStory);

      // mock session count > 0
      const mockPrismaWithSession = {
        ...mockPrisma,
        session: {
          count: jest.fn().mockResolvedValue(1),
        },
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          StoriesService,
          { provide: PrismaService, useValue: mockPrismaWithSession },
          { provide: RedisService, useValue: mockRedis },
        ],
      }).compile();

      const testService = module.get<StoriesService>(StoriesService);
      mockPrismaWithSession.story.findUnique.mockResolvedValue(existingStory);

      await expect(testService.delete('user-1', 'story-1')).rejects.toThrow(
        new AppException(
          'STORY_HAS_ACTIVE_SESSION',
          'Không thể xóa câu chuyện đang có phiên hội thoại hoạt động',
        ),
      );
    });
  });
});
