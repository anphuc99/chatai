import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateStoryDto {
  @IsOptional()
  @IsString({ message: 'Tiêu đề phải là chuỗi ký tự' })
  @MaxLength(100, { message: 'Tiêu đề không được vượt quá 100 ký tự' })
  title?: string;

  @IsOptional()
  @IsString({ message: 'Bối cảnh ban đầu phải là chuỗi ký tự' })
  @MaxLength(5000, { message: 'Bối cảnh ban đầu không được vượt quá 5000 ký tự' })
  initialSetting?: string;
}
