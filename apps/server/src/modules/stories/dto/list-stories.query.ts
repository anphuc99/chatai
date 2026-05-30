import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class ListStoriesQuery {
  @IsOptional()
  @IsString({ message: 'Cursor phải là chuỗi ký tự' })
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Giới hạn phải là số nguyên' })
  @Min(1, { message: 'Giới hạn tối thiểu là 1' })
  @Max(50, { message: 'Giới hạn tối đa là 50' })
  limit?: number = 20;
}
