import { Test, TestingModule } from '@nestjs/testing';
import { ChatController } from './chat.controller';
import { ChatSessionService } from './services/chat-session.service';
import { ChatOrchestratorService } from './services/chat-orchestrator.service';
import { OocService } from './services/ooc.service';
import { HistoryStoreService } from './services/history-store.service';
import { RedisService } from '../../shared/redis/redis.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RedisThrottlerGuard } from '../../shared/throttler/redis-throttler.guard';
import { ConflictException } from '@nestjs/common';
import { AppException, ERR } from '../../shared/errors/app-exception';
import { AuthUser } from '../../shared/types/auth-user';

describe('ChatController', () => {
  let controller: ChatController;
  let sessionService: any;
  let orchestrator: any;
  let ooc: any;
  let historyStore: any;
  let redis: any;
  let prisma: any;

  const mockUser: AuthUser = { uid: 'user-123', email: 'test@example.com' };

  const mockChatSessionService = {
    findOrStart: jest.fn(),
    getSessionForUser: jest.fn(),
    getHistoryHydrated: jest.fn(),
  };

  const mockChatOrchestratorService = {
    handleUserTurn: jest.fn(),
  };

  const mockOocService = {
    setPersistent: jest.fn(),
    pushEphemeral: jest.fn(),
    addActive: jest.fn(),
    removeActive: jest.fn(),
    addTemporary: jest.fn(),
  };

  const mockHistoryStoreService = {
    append: jest.fn(),
  };

  const mockRedisService = {
    withLock: jest.fn().mockImplementation(async (key: string, ttl: number, fn: () => Promise<any>) => {
      return fn();
    }),
  };

  const mockPrismaService = {
    character: {
      findUnique: jest.fn(),
    },
  };

  const mockThrottlerGuard = {
    canActivate: jest.fn().mockReturnValue(true),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        { provide: ChatSessionService, useValue: mockChatSessionService },
        { provide: ChatOrchestratorService, useValue: mockChatOrchestratorService },
        { provide: OocService, useValue: mockOocService },
        { provide: HistoryStoreService, useValue: mockHistoryStoreService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    })
      .overrideGuard(RedisThrottlerGuard)
      .useValue(mockThrottlerGuard)
      .compile();

    controller = module.get<ChatController>(ChatController);
    sessionService = module.get<ChatSessionService>(ChatSessionService);
    orchestrator = module.get<ChatOrchestratorService>(ChatOrchestratorService);
    ooc = module.get<OocService>(OocService);
    historyStore = module.get<HistoryStoreService>(HistoryStoreService);
    redis = module.get<RedisService>(RedisService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('startSession', () => {
    it('should delegate to sessionService.findOrStart', async () => {
      const dto = { storyId: 'story-123' };
      sessionService.findOrStart.mockResolvedValue({ sessionId: 'session-123', isResumed: false, initialActiveCharacters: [] });

      const res = await controller.startSession(mockUser, dto);
      expect(sessionService.findOrStart).toHaveBeenCalledWith(mockUser.uid, dto.storyId);
      expect(res).toEqual({ sessionId: 'session-123', isResumed: false, initialActiveCharacters: [] });
    });
  });

  describe('getHistory', () => {
    it('should verify ownership and return hydrated history', async () => {
      const sid = 'session-123';
      sessionService.getHistoryHydrated.mockResolvedValue({ messages: [], persistentOOC: null, activeCharacters: [] });

      const res = await controller.getHistory(mockUser, sid);
      expect(sessionService.getSessionForUser).toHaveBeenCalledWith(mockUser.uid, sid);
      expect(sessionService.getHistoryHydrated).toHaveBeenCalledWith(sid);
      expect(res).toEqual({ messages: [], persistentOOC: null, activeCharacters: [] });
    });
  });

  describe('sendMessage', () => {
    const sid = 'session-123';
    const dto = { userMessage: 'Hello World', ephemeralOOC: 'ephemeral hint' };

    it('should throw SESSION_ALREADY_ENDED if session is not active', async () => {
      sessionService.getSessionForUser.mockResolvedValue({ id: sid, status: 'ended', storyId: 'story-1' });

      await expect(controller.sendMessage(mockUser, sid, dto)).rejects.toThrow(
        new AppException(ERR.SESSION_ALREADY_ENDED),
      );
    });

    it('should lock the session and handle user turn if session is active', async () => {
      sessionService.getSessionForUser.mockResolvedValue({ id: sid, status: 'active', storyId: 'story-123' });
      orchestrator.handleUserTurn.mockResolvedValue({ messages: [], triggerMemory: false });

      const res = await controller.sendMessage(mockUser, sid, dto);
      expect(redis.withLock).toHaveBeenCalledWith(`chat:lock:${sid}`, 30000, expect.any(Function));
      expect(orchestrator.handleUserTurn).toHaveBeenCalledWith(
        { sessionId: sid, userId: mockUser.uid, storyId: 'story-123' },
        dto.userMessage,
        dto.ephemeralOOC,
      );
      expect(res).toEqual({ messages: [], triggerMemory: false });
    });

    it('should map ConflictException SESSION_LOCKED to AppException SESSION_LOCKED', async () => {
      sessionService.getSessionForUser.mockResolvedValue({ id: sid, status: 'active', storyId: 'story-123' });
      redis.withLock.mockRejectedValue(new ConflictException('SESSION_LOCKED'));

      await expect(controller.sendMessage(mockUser, sid, dto)).rejects.toThrow(
        new AppException(ERR.SESSION_LOCKED),
      );
    });
  });

  describe('setOoc', () => {
    const sid = 'session-123';

    it('should set persistent OOC and append history', async () => {
      const dto = { type: 'persistent' as const, text: 'Persistent context' };
      sessionService.getSessionForUser.mockResolvedValue({ id: sid });

      await controller.setOoc(mockUser, sid, dto);
      expect(ooc.setPersistent).toHaveBeenCalledWith(sid, dto.text);
      expect(historyStore.append).toHaveBeenCalledWith(sid, {
        type: 'persistent_ooc',
        timestamp: expect.any(Number),
        data: { text: dto.text },
      });
    });

    it('should push ephemeral OOC and append history', async () => {
      const dto = { type: 'ephemeral' as const, text: 'Ephemeral context' };
      sessionService.getSessionForUser.mockResolvedValue({ id: sid });

      await controller.setOoc(mockUser, sid, dto);
      expect(ooc.pushEphemeral).toHaveBeenCalledWith(sid, dto.text);
      expect(historyStore.append).toHaveBeenCalledWith(sid, {
        type: 'ephemeral_ooc',
        timestamp: expect.any(Number),
        data: { text: dto.text },
      });
    });
  });

  describe('toggleCharacter', () => {
    const sid = 'session-123';
    const charId = 'char-123';

    it('should throw NOT_FOUND if character does not exist', async () => {
      const dto = { characterId: charId, on: true };
      sessionService.getSessionForUser.mockResolvedValue({ id: sid, storyId: 'story-1' });
      prisma.character.findUnique.mockResolvedValue(null);

      await expect(controller.toggleCharacter(mockUser, sid, dto)).rejects.toThrow(
        new AppException(ERR.NOT_FOUND),
      );
    });

    it('should throw FORBIDDEN if character belongs to another story', async () => {
      const dto = { characterId: charId, on: true };
      sessionService.getSessionForUser.mockResolvedValue({ id: sid, storyId: 'story-1' });
      prisma.character.findUnique.mockResolvedValue({ id: charId, storyId: 'story-2' });

      await expect(controller.toggleCharacter(mockUser, sid, dto)).rejects.toThrow(
        new AppException(ERR.FORBIDDEN),
      );
    });

    it('should add character to active and push enter message when on is true', async () => {
      const dto = { characterId: charId, on: true };
      sessionService.getSessionForUser.mockResolvedValue({ id: sid, storyId: 'story-1' });
      prisma.character.findUnique.mockResolvedValue({ id: charId, name: 'Alice', storyId: 'story-1' });

      await controller.toggleCharacter(mockUser, sid, dto);
      expect(ooc.addActive).toHaveBeenCalledWith(sid, charId);
      expect(ooc.pushEphemeral).toHaveBeenCalledWith(sid, 'Alice vừa xuất hiện trong cảnh.');
      expect(historyStore.append).toHaveBeenCalledWith(sid, {
        type: 'persistent_ooc',
        timestamp: expect.any(Number),
        data: { text: '[Toggle] Alice on' },
      });
    });

    it('should remove character from active and push exit message when on is false', async () => {
      const dto = { characterId: charId, on: false };
      sessionService.getSessionForUser.mockResolvedValue({ id: sid, storyId: 'story-1' });
      prisma.character.findUnique.mockResolvedValue({ id: charId, name: 'Alice', storyId: 'story-1' });

      await controller.toggleCharacter(mockUser, sid, dto);
      expect(ooc.removeActive).toHaveBeenCalledWith(sid, charId);
      expect(ooc.pushEphemeral).toHaveBeenCalledWith(sid, 'Alice vừa rời khỏi cảnh.');
      expect(historyStore.append).toHaveBeenCalledWith(sid, {
        type: 'persistent_ooc',
        timestamp: expect.any(Number),
        data: { text: '[Toggle] Alice off' },
      });
    });
  });

  describe('addTempCharacter', () => {
    it('should add temporary character, notify in OOC and return tempId', async () => {
      const sid = 'session-123';
      const dto = { name: 'Dragon', description: 'Fire breather' };
      sessionService.getSessionForUser.mockResolvedValue({ id: sid });
      ooc.addTemporary.mockResolvedValue('tmp_dragon-uuid');

      const res = await controller.addTempCharacter(mockUser, sid, dto);
      expect(ooc.addTemporary).toHaveBeenCalledWith(sid, { name: dto.name, description: dto.description });
      expect(ooc.pushEphemeral).toHaveBeenCalledWith(sid, 'Một nhân vật tạm thời tên Dragon xuất hiện: Fire breather');
      expect(res).toEqual({ tempId: 'tmp_dragon-uuid' });
    });
  });
});
