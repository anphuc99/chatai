import { IsOptional, IsBoolean, IsNumber, Min, Max, IsIn } from 'class-validator';
import { HskLevel, NarratorLanguage } from '@chatai/shared-types';

export class UpdatePreferencesDto {
  @IsOptional()
  @IsIn(['vi', 'en', 'zh'])
  narratorLanguage?: NarratorLanguage;

  @IsOptional()
  @IsBoolean()
  showPinyin?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0.75)
  @Max(1.25)
  ttsSpeed?: number;

  @IsOptional()
  @IsIn(['HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5', 'HSK6'])
  hskLevel?: HskLevel;
}
