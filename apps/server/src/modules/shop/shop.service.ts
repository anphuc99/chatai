import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AppException, ERR } from '../../shared/errors/app-exception';
import { EVENTS } from '../../shared/events/event-names';
import { ShopItemDto, InventoryItemDto, BuyResultDto } from '@chatai/shared-types';
import { ShopItem } from '@prisma/client';

@Injectable()
export class ShopService {
  private readonly logger = new Logger(ShopService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async listSystemItems(): Promise<ShopItemDto[]> {
    const items = await this.prisma.shopItem.findMany({
      where: { category: 'system', active: true },
      orderBy: { createdAt: 'asc' },
    });
    return items.map(this.toItemDto);
  }

  async getBalance(uid: string): Promise<number> {
    const user = await this.prisma.usersMeta.findUnique({
      where: { userId: uid },
      select: { gems: true },
    });
    if (!user) throw new AppException(ERR.NOT_FOUND);
    return user.gems;
  }

  async buy(uid: string, itemId: string): Promise<BuyResultDto> {
    const item = await this.prisma.shopItem.findUnique({ where: { id: itemId } });
    if (!item) throw new AppException(ERR.ITEM_NOT_FOUND);
    if (!item.active) throw new AppException(ERR.ITEM_INACTIVE);
    if (item.category !== 'system') throw new AppException(ERR.FORBIDDEN);

    return this.doPurchase(uid, item, item.priceGems, 'system_shop');
  }

  async applyContextualEvent(
    uid: string,
    itemKey: string,
    price: number,
    choice: 'buy' | 'decline',
    sessionId: string,
  ): Promise<BuyResultDto> {
    if (choice === 'decline') {
      return { success: true, newBalance: await this.getBalance(uid), itemId: null };
    }

    let item = await this.prisma.shopItem.findUnique({ where: { id: itemKey } });
    if (!item) {
      item = await this.prisma.shopItem.create({
        data: {
          id: itemKey,
          name: itemKey,
          description: 'Contextual item',
          priceGems: price,
          category: 'contextual',
          active: true,
        },
      });
    }

    return this.doPurchase(uid, item, price, 'contextual_event', sessionId);
  }

  async listInventory(uid: string): Promise<InventoryItemDto[]> {
    const rows = await this.prisma.inventory.findMany({
      where: { userId: uid },
      include: {
        item: { select: { id: true, name: true, description: true, category: true } },
      },
      orderBy: { acquiredAt: 'desc' },
    });
    return rows.map((r) => ({
      itemId: r.itemId,
      quantity: r.quantity,
      acquiredAt: r.acquiredAt.toISOString(),
      item: r.item,
    }));
  }

  private async doPurchase(
    uid: string,
    item: ShopItem,
    price: number,
    source: string,
    sessionId?: string,
  ): Promise<BuyResultDto> {
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.usersMeta.findUnique({
        where: { userId: uid },
        select: { gems: true },
      });
      if (!user) throw new AppException(ERR.NOT_FOUND);
      if (user.gems < price) {
        throw new AppException(ERR.NOT_ENOUGH_GEMS, undefined, undefined, {
          required: price,
          have: user.gems,
        });
      }

      const updated = await tx.usersMeta.update({
        where: { userId: uid },
        data: { gems: { decrement: price } },
        select: { gems: true },
      });

      await tx.shopTransaction.create({
        data: {
          userId: uid,
          itemId: item.id,
          pricePaid: price,
          source,
          sessionId: sessionId ?? null,
        },
      });

      const inv = await tx.inventory.upsert({
        where: { userId_itemId: { userId: uid, itemId: item.id } },
        update: { quantity: { increment: 1 } },
        create: { userId: uid, itemId: item.id, quantity: 1 },
      });

      return { newBalance: updated.gems, itemId: item.id, quantity: inv.quantity };
    });

    this.eventEmitter.emit(EVENTS.GEM_SPENT, { userId: uid, amount: price, source });
    this.eventEmitter.emit(EVENTS.ITEM_ACQUIRED, { userId: uid, itemId: item.id, source });

    this.logger.log(`Purchase: uid=${uid} item=${item.id} price=${price} source=${source}`);

    return { success: true, ...result };
  }

  private toItemDto(item: ShopItem): ShopItemDto {
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      priceGems: item.priceGems,
      category: item.category,
      active: item.active,
      metadata: item.metadata as Record<string, unknown> | null,
      createdAt: item.createdAt.toISOString(),
    };
  }
}
