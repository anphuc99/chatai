import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { SendMessageDto as ISendMessageDto } from '@chatai/shared-types';

export class SendMessageDto implements ISendMessageDto {
  @IsString({ message: 'Tin nhắn phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Tin nhắn không được để trống' })
  @MinLength(1, { message: 'Tin nhắn phải chứa ít nhất 1 ký tự' })
  @MaxLength(2000, { message: 'Tin nhắn không được vượt quá 2000 ký tự' })
  userMessage!: string;

  @IsOptional()
  @IsString({ message: 'Bối cảnh tạm thời phải là chuỗi ký tự' })
  @MaxLength(500, { message: 'Bối cảnh tạm thời không được vượt quá 500 ký tự' })
  ephemeralOOC?: string;
}
