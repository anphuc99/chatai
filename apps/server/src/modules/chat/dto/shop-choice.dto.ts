import { IsIn } from 'class-validator';

export class ShopChoiceDto {
  @IsIn(['buy', 'decline'])
  choice!: 'buy' | 'decline';
}
