import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { OocDto as IOocDto } from '@chatai/shared-types';

export class OocDto implements IOocDto {
  @IsIn(['persistent', 'ephemeral'], { message: 'Loại OOC phải là persistent hoặc ephemeral' })
  type!: 'persistent' | 'ephemeral';

  @IsString({ message: 'Nội dung bối cảnh phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Nội dung bối cảnh không được để trống' })
  @MaxLength(5000, { message: 'Nội dung bối cảnh không được vượt quá 5000 ký tự' })
  text!: string;
}
