import { Test, TestingModule } from '@nestjs/testing';
import { JournalService } from './journal.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AppException, ERR } from '../../shared/errors/app-exception';
import { Prisma } from '@prisma/client';

describe('JournalService', () => {
  let service: JournalService;
  let prisma: any;

  const mockPrisma = {
    session: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    message: {
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JournalService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<JournalService>(JournalService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('list', () => {
    const uid = 'user-123';

    it('should return empty list if no sessions found', async () => {
      prisma.session.findMany.mockResolvedValue([]);

      const result = await service.list(uid, { limit: 20 });

      expect(result).toEqual({ items: [], nextCursor: null });
      expect(prisma.session.findMany).toHaveBeenCalledWith({
        where: { userId: uid, status: 'ended' },
        orderBy: { endedAt: 'desc' },
        take: 21,
        include: { story: { select: { title: true } } },
      });
    });

    it('should return mapped sessions with aggregates and without nextCursor if sessions length is <= limit', async () => {
      const mockSessions = [
        {
          id: 'session-1',
          storyId: 'story-1',
          summary: 'Summary 1',
          startedAt: BigInt(1000),
          endedAt: BigInt(2000),
          story: { title: 'Story Title 1' },
        },
      ];

      prisma.session.findMany.mockResolvedValue(mockSessions);
      prisma.message.groupBy
        .mockResolvedValueOnce([{ sessionId: 'session-1', _count: { _all: 5 } }]) // message count
        .mockResolvedValueOnce([{ sessionId: 'session-1', _count: { _all: 3 } }]); // word count

      const result = await service.list(uid, { limit: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual({
        id: 'session-1',
        storyId: 'story-1',
        storyTitle: 'Story Title 1',
        summary: 'Summary 1',
        startedAt: 1000,
        endedAt: 2000,
        messageCount: 5,
        wordCount: 3,
      });
      expect(result.nextCursor).toBeNull();

      expect(prisma.message.groupBy).toHaveBeenNthCalledWith(1, {
        by: ['sessionId'],
        where: { sessionId: { in: ['session-1'] } },
        _count: { _all: true },
      });
      expect(prisma.message.groupBy).toHaveBeenNthCalledWith(2, {
        by: ['sessionId'],
        where: {
          sessionId: { in: ['session-1'] },
          words: { not: Prisma.DbNull },
        },
        _count: { _all: true },
      });
    });

    it('should return nextCursor if sessions length is > limit', async () => {
      const mockSessions = [
        {
          id: 'session-1',
          storyId: 'story-1',
          summary: 'Summary 1',
          startedAt: BigInt(1000),
          endedAt: BigInt(2000),
          story: { title: 'Story Title 1' },
        },
        {
          id: 'session-2',
          storyId: 'story-1',
          summary: 'Summary 2',
          startedAt: BigInt(500),
          endedAt: BigInt(1500),
          story: { title: 'Story Title 1' },
        },
      ];

      // Request limit: 1, will return 2 records from DB
      prisma.session.findMany.mockResolvedValue(mockSessions);
      prisma.message.groupBy
        .mockResolvedValueOnce([
          { sessionId: 'session-1', _count: { _all: 5 } },
          { sessionId: 'session-2', _count: { _all: 10 } },
        ])
        .mockResolvedValueOnce([
          { sessionId: 'session-1', _count: { _all: 2 } },
          { sessionId: 'session-2', _count: { _all: 8 } },
        ]);

      const result = await service.list(uid, { limit: 1 });

      expect(result.items).toHaveLength(1); // sliced to limit
      expect(result.items[0]?.id).toBe('session-1');
      // nextCursor should be encoded endedAt of last item in page (session-1, 2000 ms)
      const expectedCursor = Buffer.from('2000').toString('base64url');
      expect(result.nextCursor).toBe(expectedCursor);
    });

    it('should filter by storyId and decode cursor', async () => {
      const cursor = Buffer.from('1500').toString('base64url');
      prisma.session.findMany.mockResolvedValue([]);

      await service.list(uid, { storyId: 'story-abc', cursor, limit: 10 });

      expect(prisma.session.findMany).toHaveBeenCalledWith({
        where: {
          userId: uid,
          status: 'ended',
          storyId: 'story-abc',
          endedAt: { lt: BigInt(1500) },
        },
        orderBy: { endedAt: 'desc' },
        take: 11,
        include: { story: { select: { title: true } } },
      });
    });
  });

  describe('detail', () => {
    const uid = 'user-123';
    const sid = 'session-123';

    it('should throw SESSION_NOT_FOUND if session not found', async () => {
      prisma.session.findUnique.mockResolvedValue(null);

      await expect(service.detail(uid, sid)).rejects.toThrow(
        new AppException(ERR.SESSION_NOT_FOUND),
      );
    });

    it('should throw FORBIDDEN if userId does not match session owner', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: sid,
        userId: 'other-user',
      });

      await expect(service.detail(uid, sid)).rejects.toThrow(
        new AppException(ERR.FORBIDDEN),
      );
    });

    it('should throw SESSION_ENDED_REQUIRED if session is active', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: sid,
        userId: uid,
        status: 'active',
      });

      await expect(service.detail(uid, sid)).rejects.toThrow(
        new AppException(ERR.SESSION_ENDED_REQUIRED),
      );
    });

    it('should return session details with messages sorted by turnOrder', async () => {
      const mockSession = {
        id: sid,
        userId: uid,
        storyId: 'story-1',
        status: 'ended',
        summary: 'Final summary',
        startedAt: BigInt(100),
        endedAt: BigInt(500),
        story: { title: 'Story title' },
      };

      const mockMessages = [
        {
          id: 'msg-1',
          role: 'user',
          text: 'Hello',
          turnOrder: 1,
          timestamp: BigInt(120),
          words: null,
        },
        {
          id: 'msg-2',
          role: 'assistant',
          text: 'Hi',
          turnOrder: 2,
          timestamp: BigInt(150),
          words: [{ hz: '你', py: 'nǐ', vn: 'bạn' }],
        },
      ];

      prisma.session.findUnique.mockResolvedValue(mockSession);
      prisma.message.findMany.mockResolvedValue(mockMessages);

      const result = await service.detail(uid, sid);

      expect(result).toEqual({
        id: sid,
        storyId: 'story-1',
        storyTitle: 'Story title',
        summary: 'Final summary',
        startedAt: 100,
        endedAt: 500,
        messageCount: 2,
        wordCount: 1, // only msg-2 has words !== null
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            text: 'Hello',
            turnOrder: 1,
            timestamp: 120,
            words: null,
            characterId: undefined,
            characterName: undefined,
            translation: undefined,
            emotion: undefined,
            intensity: undefined,
            shopEvent: undefined,
          },
          {
            id: 'msg-2',
            role: 'assistant',
            text: 'Hi',
            turnOrder: 2,
            timestamp: 150,
            words: [{ hz: '你', py: 'nǐ', vn: 'bạn' }],
            characterId: undefined,
            characterName: undefined,
            translation: undefined,
            emotion: undefined,
            intensity: undefined,
            shopEvent: undefined,
          },
        ],
      });

      expect(prisma.message.findMany).toHaveBeenCalledWith({
        where: { sessionId: sid },
        orderBy: { turnOrder: 'asc' },
      });
    });
  });
});
