import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ShopService } from './shop.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AppException } from '../../shared/errors/app-exception';

const mockShopItem = {
  id: 'streak_freeze',
  name: 'Streak Freeze',
  description: 'Test',
  priceGems: 50,
  category: 'system',
  active: true,
  metadata: null,
  createdAt: new Date(),
};

const mockUser = { gems: 100 };

describe('ShopService', () => {
  let service: ShopService;
  let prisma: jest.Mocked<PrismaService>;
  let emitter: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShopService,
        {
          provide: PrismaService,
          useValue: {
            shopItem: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn() },
            usersMeta: { findUnique: jest.fn() },
            inventory: { findMany: jest.fn() },
            $transaction: jest.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(ShopService);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
    emitter = module.get(EventEmitter2) as jest.Mocked<EventEmitter2>;
  });

  describe('buy', () => {
    it('throws ITEM_NOT_FOUND when item does not exist', async () => {
      (prisma.shopItem.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.buy('user1', 'unknown')).rejects.toBeInstanceOf(AppException);
    });

    it('throws ITEM_INACTIVE when item is inactive', async () => {
      (prisma.shopItem.findUnique as jest.Mock).mockResolvedValue({
        ...mockShopItem,
        active: false,
      });
      await expect(service.buy('user1', 'streak_freeze')).rejects.toBeInstanceOf(AppException);
    });

    it('throws FORBIDDEN when item is not system category', async () => {
      (prisma.shopItem.findUnique as jest.Mock).mockResolvedValue({
        ...mockShopItem,
        category: 'contextual',
      });
      await expect(service.buy('user1', 'streak_freeze')).rejects.toBeInstanceOf(AppException);
    });

    it('executes transaction and emits events on success', async () => {
      (prisma.shopItem.findUnique as jest.Mock).mockResolvedValue(mockShopItem);
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const tx = {
          usersMeta: {
            findUnique: jest.fn().mockResolvedValue(mockUser),
            update: jest.fn().mockResolvedValue({ gems: 50 }),
          },
          shopTransaction: { create: jest.fn().mockResolvedValue({}) },
          inventory: {
            upsert: jest.fn().mockResolvedValue({ quantity: 1 }),
          },
        };
        return fn(tx);
      });

      const result = await service.buy('user1', 'streak_freeze');

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(50);
      expect(result.itemId).toBe('streak_freeze');
      expect(emitter.emit).toHaveBeenCalledTimes(2);
    });

    it('throws NOT_ENOUGH_GEMS when balance is insufficient', async () => {
      (prisma.shopItem.findUnique as jest.Mock).mockResolvedValue(mockShopItem);
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const tx = {
          usersMeta: {
            findUnique: jest.fn().mockResolvedValue({ gems: 10 }),
          },
        };
        return fn(tx);
      });

      await expect(service.buy('user1', 'streak_freeze')).rejects.toBeInstanceOf(AppException);
    });
  });

  describe('applyContextualEvent', () => {
    it('returns current balance without state change on decline', async () => {
      (prisma.usersMeta.findUnique as jest.Mock).mockResolvedValue({ gems: 80 });
      const result = await service.applyContextualEvent('user1', 'love_ring', 15, 'decline', 'sess1');
      expect(result.success).toBe(true);
      expect(result.itemId).toBeNull();
      expect(result.newBalance).toBe(80);
    });

    it('auto-creates ShopItem when itemKey is unknown', async () => {
      (prisma.shopItem.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.shopItem.create as jest.Mock).mockResolvedValue({ ...mockShopItem, id: 'new_item', category: 'contextual' });
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const tx = {
          usersMeta: {
            findUnique: jest.fn().mockResolvedValue({ gems: 100 }),
            update: jest.fn().mockResolvedValue({ gems: 85 }),
          },
          shopTransaction: { create: jest.fn().mockResolvedValue({}) },
          inventory: {
            upsert: jest.fn().mockResolvedValue({ quantity: 1 }),
          },
        };
        return fn(tx);
      });

      const result = await service.applyContextualEvent('user1', 'new_item', 15, 'buy', 'sess1');
      expect(prisma.shopItem.create).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });
});
