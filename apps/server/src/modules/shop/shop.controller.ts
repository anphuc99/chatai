import { Controller, Get, Post, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ShopService } from './shop.service';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { AuthUser } from '../../shared/types/auth-user';
import { ShopItemDto, InventoryItemDto, BuyResultDto, BalanceDto } from '@chatai/shared-types';

@Controller('shop')
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  @Get('items')
  async listItems(): Promise<ShopItemDto[]> {
    return this.shopService.listSystemItems();
  }

  @Get('balance')
  async getBalance(@CurrentUser() user: AuthUser): Promise<BalanceDto> {
    const gems = await this.shopService.getBalance(user.uid);
    return { gems };
  }

  @Post('buy/:itemId')
  @HttpCode(HttpStatus.OK)
  async buyItem(
    @CurrentUser() user: AuthUser,
    @Param('itemId') itemId: string,
  ): Promise<BuyResultDto> {
    return this.shopService.buy(user.uid, itemId);
  }

  @Get('inventory')
  async getInventory(@CurrentUser() user: AuthUser): Promise<InventoryItemDto[]> {
    return this.shopService.listInventory(user.uid);
  }
}
