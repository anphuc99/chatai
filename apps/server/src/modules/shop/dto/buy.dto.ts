import { IsString, IsNotEmpty } from 'class-validator';

export class BuyDto {
  @IsString()
  @IsNotEmpty()
  itemId!: string;
}
