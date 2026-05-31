import { IsOptional, IsUUID, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class ListSessionsDto {
  @IsOptional()
  @IsUUID('4', { message: 'storyId phải là UUID v4' })
  storyId?: string;

  @IsOptional()
  @IsString({ message: 'cursor phải là chuỗi ký tự' })
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit phải là số nguyên' })
  @Min(1, { message: 'limit tối thiểu là 1' })
  @Max(50, { message: 'limit tối đa là 50' })
  limit: number = 20;
}
