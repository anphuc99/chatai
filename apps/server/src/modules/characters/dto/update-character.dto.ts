import { IsString, IsOptional, IsInt, Min, Max, IsIn, IsNumber } from 'class-validator';
import { UpdateCharacterDto as IUpdateCharacterDto } from '@chatai/shared-types';
import { VOICES, VoiceName } from '../voice.constants';

export class UpdateCharacterDto implements IUpdateCharacterDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  age?: number;

  @IsOptional()
  @IsString()
  personality?: string;

  @IsOptional()
  @IsString()
  @IsIn(VOICES)
  voiceName?: VoiceName;

  @IsOptional()
  @IsNumber()
  @Min(0.8)
  @Max(1.5)
  pitch?: number;
}
