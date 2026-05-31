import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { EndChatService } from './end-chat.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { RedisService } from '../../../shared/redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { HistoryStoreService } from './history-store.service';
import { OocService } from './ooc.service';
import { LlmService } from './llm.service';
import { AppException, ERR } from '../../../shared/errors/app-exception';
import { EVENTS } from '../../../shared/events/event-names';
import { HistoryEntry } from '../types/history-entry';

describe('EndChatService', () => {
  let service: EndChatService;
  let prisma: any;
  let redis: any;
  let eventEmitter: any;
  let historyStore: any;
  let oocService: any;
  let llmService: any;

  beforeEach(async () => {
    const mockPrisma = {
      session: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      story: {
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      message: {
        count: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation(async (cb) => {
        return await cb(mockPrisma);
      }),
    };

    const mockRedis = {
      getJson: jest.fn(),
      setJson: jest.fn(),
      withLock: jest.fn().mockImplementation(async (key, ttl, fn) => {
        return await fn();
      }),
    };

    const mockEventEmitter = {
      emit: jest.fn(),
    };

    const mockHistoryStore = {
      readAll: jest.fn(),
      cleanup: jest.fn(),
    };

    const mockOocService = {
      cleanupSession: jest.fn(),
    };

    const mockLlmService = {
      summarize: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EndChatService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: HistoryStoreService, useValue: mockHistoryStore },
        { provide: OocService, useValue: mockOocService },
        { provide: LlmService, useValue: mockLlmService },
      ],
    }).compile();

    service = module.get<EndChatService>(EndChatService);
    prisma = module.get(PrismaService);
    redis = module.get(RedisService);
    eventEmitter = module.get(EventEmitter2);
    historyStore = module.get(HistoryStoreService);
    oocService = module.get(OocService);
    llmService = module.get(LlmService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('execute', () => {
    const sid = 'session-uuid-1';
    const uid = 'user-uuid-1';
    const storyId = 'story-uuid-1';

    it('should finalize session successfully in the happy path', async () => {
      // 1. Setup session in DB: status active
      prisma.session.findUnique.mockResolvedValue({
        id: sid,
        userId: uid,
        storyId,
        status: 'active',
        summary: null,
      });

      // 2. Mock history store entries
      const entries: HistoryEntry[] = [
        { type: 'checkpoint', timestamp: 100, data: { summary: 'Cũ' } } as any,
        { type: 'user', timestamp: 200, data: { text: 'Đi tiếp nào' } } as any,
        { type: 'assistant_batch', timestamp: 300, data: { messages: [{ characterName: 'Mimi', text: 'Ok!' }] } } as any,
      ];
      historyStore.readAll.mockResolvedValue(entries);

      // 3. Mock LLM Summarize calls
      llmService.summarize.mockImplementation(async (text: string, mode: 'plot' | 'session' | 'character') => {
        if (mode === 'plot') return 'Tóm tắt cốt truyện mới';
        if (mode === 'session') return 'Tóm tắt session mới';
        return '';
      });

      // 4. Mock Story lookup inside transaction
      prisma.story.findUniqueOrThrow.mockResolvedValue({
        id: storyId,
        currentProgress: 'Tiến trình ban đầu',
      });
      prisma.message.count.mockResolvedValue(12);

      // 5. Run service
      const result = await service.execute(sid, uid);

      // 6. Assertions
      expect(result).toEqual({
        journalSessionId: sid,
        summary: 'Tóm tắt session mới',
        messageCount: 12,
        alreadyEnded: false,
      });

      // Verification of DB updates
      expect(prisma.session.update).toHaveBeenCalledWith({
        where: { id: sid },
        data: {
          status: 'ended',
          summary: 'Tóm tắt session mới',
          endedAt: expect.any(BigInt),
        },
      });

      expect(prisma.story.update).toHaveBeenCalledWith({
        where: { id: storyId },
        data: {
          currentProgress: 'Tiến trình ban đầu\n\n---\nTóm tắt cốt truyện mới',
        },
      });

      // Verification of cleanup
      expect(historyStore.cleanup).toHaveBeenCalledWith(sid);
      expect(oocService.cleanupSession).toHaveBeenCalledWith(sid);

      // Verification of Event emitting
      expect(eventEmitter.emit).toHaveBeenCalledWith(EVENTS.SESSION_ENDED, {
        sessionId: sid,
        userId: uid,
        storyId,
        endedAt: expect.any(Number),
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(EVENTS.MEMORY_TRIGGER, {
        sessionId: sid,
        userId: uid,
        type: 'plot',
      });

      // Verification of Redis caching
      expect(redis.setJson).toHaveBeenCalledWith(`endchat:result:${sid}`, {
        journalSessionId: sid,
        summary: 'Tóm tắt session mới',
        messageCount: 12,
        alreadyEnded: false,
      }, 3600);
    });

    it('should throw FORBIDDEN if the session belongs to a different user', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: sid,
        userId: 'other-user',
        storyId,
        status: 'active',
      });

      await expect(service.execute(sid, uid)).rejects.toThrow(
        new AppException(ERR.FORBIDDEN, 'Access denied'),
      );
    });

    it('should throw NOT_FOUND if the session does not exist', async () => {
      prisma.session.findUnique.mockResolvedValue(null);

      await expect(service.execute(sid, uid)).rejects.toThrow(
        new AppException(ERR.NOT_FOUND, 'Session not found'),
      );
    });

    it('should return cached result if session is already ended and cache exists', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: sid,
        userId: uid,
        storyId,
        status: 'ended',
        summary: 'Tóm tắt cũ từ DB',
      });

      const cachedResult = {
        journalSessionId: sid,
        summary: 'Tóm tắt cũ từ cache',
        messageCount: 5,
        alreadyEnded: false,
      };
      redis.getJson.mockResolvedValue(cachedResult);

      const result = await service.execute(sid, uid);

      expect(result).toEqual({
        ...cachedResult,
        alreadyEnded: true,
      });
      expect(llmService.summarize).not.toHaveBeenCalled();
      expect(prisma.session.update).not.toHaveBeenCalled();
    });

    it('should reconstruct result from DB if session is ended but cache does not exist', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: sid,
        userId: uid,
        storyId,
        status: 'ended',
        summary: 'Tóm tắt từ DB',
      });
      redis.getJson.mockResolvedValue(null);
      prisma.message.count.mockResolvedValue(8);

      const result = await service.execute(sid, uid);

      expect(result).toEqual({
        journalSessionId: sid,
        summary: 'Tóm tắt từ DB',
        messageCount: 8,
        alreadyEnded: true,
      });
      expect(prisma.session.update).not.toHaveBeenCalled();
    });

    it('should handle empty session: set ended, cleanup, return special summary, skip LLM', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: sid,
        userId: uid,
        storyId,
        status: 'active',
      });
      historyStore.readAll.mockResolvedValue([]); // empty

      const result = await service.execute(sid, uid);

      expect(result).toEqual({
        journalSessionId: sid,
        summary: '(Phiên trống)',
        messageCount: 0,
        alreadyEnded: false,
      });

      expect(prisma.session.update).toHaveBeenCalledWith({
        where: { id: sid },
        data: {
          status: 'ended',
          summary: '(Phiên trống)',
          endedAt: expect.any(BigInt),
        },
      });
      expect(llmService.summarize).not.toHaveBeenCalled();
      expect(oocService.cleanupSession).toHaveBeenCalledWith(sid);
      expect(redis.setJson).toHaveBeenCalled();
    });

    it('should throw SESSION_LOCKED if redis lock is busy', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: sid,
        userId: uid,
        storyId,
        status: 'active',
      });

      redis.withLock.mockRejectedValue(new ConflictException('SESSION_LOCKED'));

      await expect(service.execute(sid, uid)).rejects.toThrow(
        new AppException(ERR.SESSION_LOCKED, 'End already in progress'),
      );
    });

    it('should check session status again inside lock to prevent race conditions', async () => {
      // First call (loadAndValidateSession) returns active
      prisma.session.findUnique.mockResolvedValueOnce({
        id: sid,
        userId: uid,
        storyId,
        status: 'active',
      });

      // Second call (inside withLock) returns ended (concurrent worker finished it)
      prisma.session.findUnique.mockResolvedValueOnce({
        id: sid,
        userId: uid,
        storyId,
        status: 'ended',
        summary: 'Tóm tắt concurrent',
      });

      prisma.message.count.mockResolvedValue(15);

      const result = await service.execute(sid, uid);

      expect(result).toEqual({
        journalSessionId: sid,
        summary: 'Tóm tắt concurrent',
        messageCount: 15,
        alreadyEnded: true,
      });

      // Confirm no summary generation or DB updates were made
      expect(llmService.summarize).not.toHaveBeenCalled();
      expect(prisma.session.update).not.toHaveBeenCalled();
    });

    it('should catch cleanup errors and log warnings without rolling back the DB', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: sid,
        userId: uid,
        storyId,
        status: 'active',
      });
      historyStore.readAll.mockResolvedValue([{ type: 'user', timestamp: 1, data: { text: 'hi' } }]);
      llmService.summarize.mockResolvedValue('Tóm tắt');
      prisma.story.findUniqueOrThrow.mockResolvedValue({ id: storyId, currentProgress: '' });
      prisma.message.count.mockResolvedValue(1);

      // Force cleanup to throw error
      historyStore.cleanup.mockRejectedValue(new Error('unlink fail'));
      oocService.cleanupSession.mockRejectedValue(new Error('redis connection fail'));

      // Execution should still succeed
      const result = await service.execute(sid, uid);

      expect(result).toBeDefined();
      expect(prisma.session.update).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(EVENTS.SESSION_ENDED, expect.any(Object));
    });
  });
});
