import { Test, TestingModule } from '@nestjs/testing';
import { JournalController } from './journal.controller';
import { JournalService } from './journal.service';
import { RedisThrottlerGuard } from '../../shared/throttler/redis-throttler.guard';
import { AuthUser } from '../../shared/types/auth-user';

describe('JournalController', () => {
  let controller: JournalController;
  let service: any;

  const mockUser: AuthUser = { uid: 'user-123', email: 'test@example.com' };

  const mockJournalService = {
    list: jest.fn(),
    detail: jest.fn(),
  };

  const mockThrottlerGuard = {
    canActivate: jest.fn().mockReturnValue(true),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [JournalController],
      providers: [
        { provide: JournalService, useValue: mockJournalService },
      ],
    })
      .overrideGuard(RedisThrottlerGuard)
      .useValue(mockThrottlerGuard)
      .compile();

    controller = module.get<JournalController>(JournalController);
    service = module.get<JournalService>(JournalService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('list', () => {
    it('should delegate to service.list with user uid and query DTO', async () => {
      const query = { limit: 10, storyId: 'story-1' };
      const expectedResult = { items: [], nextCursor: null };
      service.list.mockResolvedValue(expectedResult);

      const result = await controller.list(mockUser, query);

      expect(service.list).toHaveBeenCalledWith(mockUser.uid, query);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('detail', () => {
    it('should delegate to service.detail with user uid and session id', async () => {
      const sid = 'session-uuid';
      const expectedResult = { id: sid, messages: [] };
      service.detail.mockResolvedValue(expectedResult);

      const result = await controller.detail(mockUser, sid);

      expect(service.detail).toHaveBeenCalledWith(mockUser.uid, sid);
      expect(result).toEqual(expectedResult);
    });
  });
});
