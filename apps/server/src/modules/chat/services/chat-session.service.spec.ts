import { Test, TestingModule } from '@nestjs/testing';
import { ChatSessionService } from './chat-session.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { OocService } from './ooc.service';
import { HistoryStoreService } from './history-store.service';
import { OwnershipService } from '../../../shared/ownership/ownership.service';
import { AppException, ERR } from '../../../shared/errors/app-exception';

describe('ChatSessionService', () => {
  let service: ChatSessionService;
  let prisma: any;
  let ooc: any;
  let historyStore: any;
  let ownership: any;

  const mockPrisma = {
    session: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    character: {
      findMany: jest.fn(),
    },
  };

  const mockOocService = {
    getActiveCharacters: jest.fn(),
    setActiveCharacters: jest.fn(),
    getPersistent: jest.fn(),
  };

  const mockHistoryStoreService = {
    append: jest.fn(),
    readAll: jest.fn(),
  };

  const mockOwnershipService = {
    assertStoryOwner: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatSessionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OocService, useValue: mockOocService },
        { provide: HistoryStoreService, useValue: mockHistoryStoreService },
        { provide: OwnershipService, useValue: mockOwnershipService },
      ],
    }).compile();

    service = module.get<ChatSessionService>(ChatSessionService);
    prisma = module.get<PrismaService>(PrismaService);
    ooc = module.get<OocService>(OocService);
    historyStore = module.get<HistoryStoreService>(HistoryStoreService);
    ownership = module.get<OwnershipService>(OwnershipService);
    mockOwnershipService.assertStoryOwner.mockResolvedValue(undefined);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOrStart', () => {
    const userId = 'user-123';
    const storyId = 'story-123';

    it('should assert story ownership', async () => {
      ownership.assertStoryOwner.mockRejectedValue(new AppException(ERR.FORBIDDEN));
      await expect(service.findOrStart(userId, storyId)).rejects.toThrow(
        new AppException(ERR.FORBIDDEN),
      );
      expect(ownership.assertStoryOwner).toHaveBeenCalledWith(userId, storyId);
    });

    it('should resume existing active session and return cached characters if available', async () => {
      const activeSession = { id: 'session-123', userId, storyId, status: 'active' };
      prisma.session.findFirst.mockResolvedValue(activeSession);
      ooc.getActiveCharacters.mockResolvedValue(['char-1', 'char-2']);

      const res = await service.findOrStart(userId, storyId);
      expect(res).toEqual({
        sessionId: 'session-123',
        isResumed: true,
        initialActiveCharacters: ['char-1', 'char-2'],
      });
      expect(prisma.session.findFirst).toHaveBeenCalledWith({
        where: { userId, storyId, status: 'active' },
      });
      expect(ooc.getActiveCharacters).toHaveBeenCalledWith('session-123');
      expect(prisma.character.findMany).not.toHaveBeenCalled();
    });

    it('should rehydrate characters from DB if active session found but Redis character list is empty', async () => {
      const activeSession = { id: 'session-123', userId, storyId, status: 'active' };
      prisma.session.findFirst.mockResolvedValue(activeSession);
      ooc.getActiveCharacters.mockResolvedValue([]);
      prisma.character.findMany.mockResolvedValue([{ id: 'char-1' }, { id: 'char-2' }]);

      const res = await service.findOrStart(userId, storyId);
      expect(res).toEqual({
        sessionId: 'session-123',
        isResumed: true,
        initialActiveCharacters: ['char-1', 'char-2'],
      });
      expect(prisma.character.findMany).toHaveBeenCalledWith({
        where: { storyId },
        select: { id: true },
      });
      expect(ooc.setActiveCharacters).toHaveBeenCalledWith('session-123', ['char-1', 'char-2']);
    });

    it('should create a new session if no active session is found', async () => {
      prisma.session.findFirst.mockResolvedValue(null);
      const newSession = { id: 'new-session-999', userId, storyId, status: 'active' };
      prisma.session.create.mockResolvedValue(newSession);
      prisma.character.findMany.mockResolvedValue([{ id: 'char-a' }, { id: 'char-b' }]);

      const res = await service.findOrStart(userId, storyId);
      expect(res).toEqual({
        sessionId: 'new-session-999',
        isResumed: false,
        initialActiveCharacters: ['char-a', 'char-b'],
      });
      expect(prisma.session.create).toHaveBeenCalledWith({
        data: {
          userId,
          storyId,
          status: 'active',
          startedAt: expect.any(BigInt),
        },
      });
      expect(ooc.setActiveCharacters).toHaveBeenCalledWith('new-session-999', ['char-a', 'char-b']);
      expect(historyStore.append).toHaveBeenCalledWith('new-session-999', {
        type: 'system',
        timestamp: expect.any(Number),
        data: {
          storyId,
          activeCharacters: ['char-a', 'char-b'],
          note: 'session start',
        },
      });
    });
  });

  describe('getSessionForUser', () => {
    const userId = 'user-123';
    const sid = 'session-123';

    it('should throw SESSION_NOT_FOUND when session is not found in database', async () => {
      prisma.session.findUnique.mockResolvedValue(null);
      await expect(service.getSessionForUser(userId, sid)).rejects.toThrow(
        new AppException(ERR.SESSION_NOT_FOUND),
      );
    });

    it('should throw FORBIDDEN if userId does not match session owner', async () => {
      prisma.session.findUnique.mockResolvedValue({ id: sid, userId: 'other-user' });
      await expect(service.getSessionForUser(userId, sid)).rejects.toThrow(
        new AppException(ERR.FORBIDDEN),
      );
    });

    it('should return session if found and user is the owner', async () => {
      const session = { id: sid, userId, storyId: 'story-123' };
      prisma.session.findUnique.mockResolvedValue(session);
      const res = await service.getSessionForUser(userId, sid);
      expect(res).toEqual(session);
    });
  });

  describe('getHistoryHydrated', () => {
    const sid = 'session-123';

    it('should hydrate history and return messages, persistent OOC and active characters', async () => {
      const mockHistory = [
        { type: 'user', timestamp: 1000, data: { text: 'Hello' } },
        {
          type: 'assistant_batch',
          timestamp: 2000,
          data: {
            messages: [
              { characterName: 'Char1', text: 'Hi', translation: 'Xin chao', emotion: 'happy', intensity: 'high' },
            ],
          },
        },
        { type: 'persistent_ooc', timestamp: 3000, data: { text: 'Always rain' } },
        { type: 'ephemeral_ooc', timestamp: 4000, data: { text: 'Temp rain' } },
        { type: 'checkpoint', timestamp: 5000, data: { summary: 'Rainy day' } },
        { type: 'system', timestamp: 6000, data: { storyId: 'story-1', activeCharacters: [] } },
      ];

      historyStore.readAll.mockResolvedValue(mockHistory);
      ooc.getPersistent.mockResolvedValue('Always rain');
      ooc.getActiveCharacters.mockResolvedValue(['char-1']);

      const res = await service.getHistoryHydrated(sid);
      expect(res).toEqual({
        messages: [
          { role: 'user', text: 'Hello', timestamp: 1000 },
          {
            role: 'assistant',
            characterName: 'Char1',
            text: 'Hi',
            translation: 'Xin chao',
            emotion: 'happy',
            intensity: 'high',
            timestamp: 2000,
          },
          { role: 'persistent_ooc', text: 'Always rain', timestamp: 3000 },
          { role: 'ephemeral_ooc', text: 'Temp rain', timestamp: 4000 },
          { role: 'system', text: '[Tóm tắt: Rainy day]', timestamp: 5000 },
        ],
        persistentOOC: 'Always rain',
        activeCharacters: ['char-1'],
      });
    });
  });
});
