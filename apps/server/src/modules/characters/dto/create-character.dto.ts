import { IsString, IsNotEmpty, IsOptional, IsInt, Min, Max, IsIn, IsNumber } from 'class-validator';
import { VOICES, VoiceName } from '../voice.constants';

export class CreateCharacterDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  age?: number;

  @IsString()
  @IsNotEmpty()
  personality!: string;

  @IsString()
  @IsIn(VOICES)
  voiceName!: VoiceName;

  @IsNumber()
  @Min(0.8)
  @Max(1.5)
  pitch!: number;
}
