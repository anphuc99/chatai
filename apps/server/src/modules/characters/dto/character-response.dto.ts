import { Exclude, Expose } from 'class-transformer';
import { CharacterDto, VoiceName } from '@chatai/shared-types';

@Exclude()
export class CharacterResponseDto implements CharacterDto {
  @Expose() id!: string;
  @Expose() storyId!: string;
  @Expose() name!: string;
  @Expose() age!: number | null;
  @Expose() personality!: string;
  @Expose() avatarUrl!: string | null;
  @Expose() voiceName!: VoiceName;
  @Expose() pitch!: number;
  @Expose() createdAt!: string;
}
