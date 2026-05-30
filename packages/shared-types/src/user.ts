export type HskLevel = 'HSK1' | 'HSK2' | 'HSK3' | 'HSK4' | 'HSK5' | 'HSK6';
export type NarratorLanguage = 'vi' | 'en' | 'zh';

export type Preferences = {
  narratorLanguage: NarratorLanguage;
  showPinyin: boolean;
  ttsSpeed: number; // 0.75..1.25
};

export type UserDto = {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  hskLevel: HskLevel;
  preferences: Preferences;
  gems: number;
  currentStreak: number;
  highestStreak: number;
  streakFreezeCount: number;
  tutorialStep: number;
};

export type UpdatePreferencesDto = Partial<{
  narratorLanguage: NarratorLanguage;
  showPinyin: boolean;
  ttsSpeed: number;
  hskLevel: HskLevel;
}>;
