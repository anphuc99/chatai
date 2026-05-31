import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { TempCharacterDto as ITempCharacterDto } from '@chatai/shared-types';

export class TempCharacterDto implements ITempCharacterDto {
  @IsString({ message: 'Tên nhân vật phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Tên nhân vật không được để trống' })
  @MaxLength(50, { message: 'Tên nhân vật không được vượt quá 50 ký tự' })
  name!: string;

  @IsString({ message: 'Mô tả nhân vật phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Mô tả nhân vật không được để trống' })
  @MaxLength(500, { message: 'Mô tả nhân vật không được vượt quá 500 ký tự' })
  description!: string;
}
