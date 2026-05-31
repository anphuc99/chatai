import { IsUUID } from 'class-validator';
import { StartSessionDto as IStartSessionDto } from '@chatai/shared-types';

export class StartSessionDto implements IStartSessionDto {
  @IsUUID('4', { message: 'storyId phải là định dạng UUID v4' })
  storyId!: string;
}
