import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../shared/redis/redis.service';
import { AppException, ERR } from '../../../shared/errors/app-exception';
import { HistoryStoreService } from './history-store.service';

export interface ShopEventRef {
  sessionId: string;
  /** itemName used as unique key for idempotency tracking */
  msgId: string;
  event: {
    itemName: string;
    price: number;
  };
}

@Injectable()
export class ShopEventResolverService {
  constructor(
    private readonly historyStore: HistoryStoreService,
    private readonly redis: RedisService,
  ) {}

  async findPendingShopEvent(sid: string): Promise<ShopEventRef> {
    const batch = await this.historyStore.getLastAssistantBatch(sid);
    for (const msg of batch) {
      if (msg.shopEvent) {
        const consumed = await this.redis.get(this.consumedKey(sid, msg.shopEvent.itemName));
        if (consumed) {
          throw new AppException(ERR.SHOP_EVENT_ALREADY_RESOLVED);
        }
        return {
          sessionId: sid,
          msgId: msg.shopEvent.itemName,
          event: {
            itemName: msg.shopEvent.itemName,
            price: msg.shopEvent.price,
          },
        };
      }
    }
    throw new AppException(ERR.NO_PENDING_SHOP_EVENT);
  }

  async markConsumed(sid: string, msgId: string): Promise<void> {
    await this.redis.set(this.consumedKey(sid, msgId), '1', 86400);
  }

  /**
   * Non-throwing check used as defense-in-depth by send/auto endpoints so they
   * refuse to write a new turn while a shop event is still unresolved.
   */
  async hasPendingShopEvent(sid: string): Promise<boolean> {
    const batch = await this.historyStore.getLastAssistantBatch(sid);
    for (const msg of batch) {
      if (msg.shopEvent) {
        const consumed = await this.redis.get(
          this.consumedKey(sid, msg.shopEvent.itemName),
        );
        return !consumed;
      }
    }
    return false;
  }

  private consumedKey(sid: string, msgId: string): string {
    return `chat:shop-consumed:${sid}:${msgId}`;
  }
}
