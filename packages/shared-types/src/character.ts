export const VOICES = ['Achernar', 'Aoede', 'Charon', 'Fenrir', 'Kore', 'Leda', 'Zephyr'] as const;
export type VoiceName = typeof VOICES[number];

export type CharacterDto = {
  id: string;
  storyId: string;
  name: string;
  age: number | null;
  personality: string;
  avatarUrl: string | null;
  voiceName: VoiceName;
  pitch: number;
  createdAt: string; // ISO string
};

export type CreateCharacterDto = {
  name: string;
  age?: number;
  personality: string;
  voiceName: VoiceName;
  pitch: number;
};

export type UpdateCharacterDto = Partial<CreateCharacterDto>;
