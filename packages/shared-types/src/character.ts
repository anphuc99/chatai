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

export type Gender = 'male' | 'female' | 'neutral';

export interface VoiceMeta {
  name: VoiceName;
  gender: Gender;
  sampleHint: string;
}

export const VOICE_METADATA: VoiceMeta[] = [
  { name: 'Achernar', gender: 'female', sampleHint: 'Nữ trẻ trung' },
  { name: 'Aoede',    gender: 'female', sampleHint: 'Nữ ấm áp' },
  { name: 'Charon',   gender: 'male',   sampleHint: 'Nam trầm' },
  { name: 'Fenrir',   gender: 'male',   sampleHint: 'Nam mạnh mẽ' },
  { name: 'Kore',     gender: 'female', sampleHint: 'Nữ dịu dàng' },
  { name: 'Leda',     gender: 'female', sampleHint: 'Nữ tinh nghịch' },
  { name: 'Zephyr',   gender: 'neutral',sampleHint: 'Trung tính' },
];
