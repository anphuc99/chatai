import { Exclude, Expose } from 'class-transformer';
import { StoryDto } from '@chatai/shared-types';

@Exclude()
export class StoryResponseDto implements StoryDto {
  @Expose() id!: string;
  @Expose() title!: string;
  @Expose() initialSetting!: string;
  @Expose() currentProgress!: string;
  @Expose() characterCount!: number;
  @Expose() sessionCount!: number;
  @Expose() createdAt!: string;
  @Expose() updatedAt!: string;
}
