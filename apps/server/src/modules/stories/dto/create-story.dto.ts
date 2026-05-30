import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateStoryDto {
  @IsString({ message: 'Tiêu đề phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Tiêu đề không được để trống' })
  @MaxLength(100, { message: 'Tiêu đề không được vượt quá 100 ký tự' })
  title!: string;

  @IsString({ message: 'Bối cảnh ban đầu phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Bối cảnh ban đầu không được để trống' })
  @MaxLength(5000, { message: 'Bối cảnh ban đầu không được vượt quá 5000 ký tự' })
  initialSetting!: string;
}
