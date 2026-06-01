export interface ShopItemDto {
  id: string;
  name: string;
  description: string;
  priceGems: number;
  category: string;
  active: boolean;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface InventoryItemDto {
  itemId: string;
  quantity: number;
  acquiredAt: string;
  item: Pick<ShopItemDto, 'id' | 'name' | 'description' | 'category'>;
}

export interface BuyResultDto {
  success: boolean;
  newBalance: number;
  itemId: string | null;
  quantity?: number;
}

export interface BalanceDto {
  gems: number;
}
