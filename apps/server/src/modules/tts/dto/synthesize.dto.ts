import { IsString, IsNotEmpty, IsOptional, IsIn, IsNumber, Min, Max, MaxLength } from 'class-validator';
import { VOICES, VoiceName } from '../../characters/voice.constants';
import { EMOTIONS, INTENSITIES, Emotion, Intensity } from '../tts.constants';

export class SynthesizeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  text!: string;

  @IsString()
  @IsIn(VOICES)
  voiceName!: VoiceName;

  @IsOptional()
  @IsString()
  @IsIn(EMOTIONS)
  emotion?: Emotion;

  @IsOptional()
  @IsString()
  @IsIn(INTENSITIES)
  intensity?: Intensity;

  @IsOptional()
  @IsNumber()
  @Min(0.8)
  @Max(1.5)
  pitch?: number;
}
