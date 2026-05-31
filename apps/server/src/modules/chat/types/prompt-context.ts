import { CharacterDto, HskLevel, NarratorLanguage } from '@chatai/shared-types';
import { TempCharacter } from './temp-character';

export type PromptContext = {
  story: {
    title: string;
    initialSetting: string;
    currentProgress: string;
  };
  activeCharacters: CharacterDto[];
  temporaryCharacters: TempCharacter[];
  hskLevel: HskLevel;
  narratorLanguage: NarratorLanguage;
};
