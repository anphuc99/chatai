import { IsString, IsOptional, IsInt, Min, Max, IsIn, IsNumber } from 'class-validator';
import { VOICES, VoiceName } from '../voice.constants';

export class UpdateCharacterDto {
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
