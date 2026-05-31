import { IsBoolean, IsUUID } from 'class-validator';
import { ToggleCharacterDto as IToggleCharacterDto } from '@chatai/shared-types';

export class ToggleCharacterDto implements IToggleCharacterDto {
  @IsUUID('4', { message: 'characterId phải là định dạng UUID v4' })
  characterId!: string;

  @IsBoolean({ message: 'on phải là kiểu boolean (true/false)' })
  on!: boolean;
}
