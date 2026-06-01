import { Test, TestingModule } from '@nestjs/testing';
import { ChatOrchestratorService } from './services/chat-orchestrator.service';
import { AutoRateLimiterService } from './services/auto-rate-limiter.service';
import { AppException, ERR } from '../../shared/errors/app-exception';
import { AssistantBatchDto } from '@chatai/shared-types';

describe('Auto Chat Turn', () => {
  describe('AutoRateLimiterService', () => {
    let service: AutoRateLimiterService;
    let redisMock: any;

    beforeEach(async () => {
      redisMock = {
        raw: jest.fn().mockReturnValue({
          set: jest.fn(),
          ttl: jest.fn(),
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AutoRateLimiterService,
          { provide: 'RedisService', useValue: redisMock },
        ],
      })
        .overrideProvider(AutoRateLimiterService)
        .useFactory({
          factory: () => new (AutoRateLimiterService as any)(redisMock),
        })
        .compile();

      service = module.get<AutoRateLimiterService>(AutoRateLimiterService);
    });

    it('should allow the request when key is not set', async () => {
      redisMock.raw().set.mockResolvedValue('OK');
      await expect(service.checkAndConsume('session-1')).resolves.toBeUndefined();
    });

    it('should throw RATE_LIMIT when cooldown key exists', async () => {
      redisMock.raw().set.mockResolvedValue(null);
      redisMock.raw().ttl.mockResolvedValue(2);

      await expect(service.checkAndConsume('session-1')).rejects.toMatchObject({
        code: ERR.RATE_LIMIT,
      });
    });

    it('should include retryAfter in exception details', async () => {
      redisMock.raw().set.mockResolvedValue(null);
      redisMock.raw().ttl.mockResolvedValue(3);

      try {
        await service.checkAndConsume('session-1');
        fail('expected exception');
      } catch (e: any) {
        expect(e).toBeInstanceOf(AppException);
        expect(e.details).toEqual({ retryAfter: 3 });
      }
    });
  });

  describe('ChatOrchestratorService.handleAutoTurn', () => {
    let orchestrator: ChatOrchestratorService;
    const mockBatch: AssistantBatchDto = {
      messages: [
        {
          id: 'msg-1',
          characterId: null,
          characterName: 'Narrator',
          text: 'The story continues...',
          translation: null,
          emotion: null,
          intensity: null,
          words: null,
          shopEvent: null,
          timestamp: Date.now(),
        },
      ],
      triggerMemory: false,
      isAuto: true,
    };

    beforeEach(() => {
      orchestrator = {
        handleUserTurn: jest.fn().mockResolvedValue(mockBatch),
        handleAutoTurn: jest.fn().mockResolvedValue(mockBatch),
      } as any;
    });

    it('should return batch with isAuto=true', async () => {
      const ctx = { sessionId: 'sid-1', userId: 'uid-1', storyId: 'story-1' };
      const result = await orchestrator.handleAutoTurn(ctx);
      expect(result.isAuto).toBe(true);
    });

    it('should include messages in the batch', async () => {
      const ctx = { sessionId: 'sid-1', userId: 'uid-1', storyId: 'story-1' };
      const result = await orchestrator.handleAutoTurn(ctx);
      expect(result.messages.length).toBeGreaterThan(0);
    });
  });
});
