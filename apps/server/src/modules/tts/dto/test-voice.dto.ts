import { IsString, IsOptional, IsIn, IsNumber, Min, Max, MaxLength } from 'class-validator';
import { VOICES, VoiceName } from '../../characters/voice.constants';

export class TestVoiceDto {
  @IsString()
  @IsIn(VOICES)
  voiceName!: VoiceName;

  @IsNumber()
  @Min(0.8)
  @Max(1.5)
  pitch!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sampleText?: string;
}
