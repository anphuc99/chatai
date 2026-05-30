import { VoiceName } from '@chatai/shared-types';
export type { VoiceName };

export type Gender = 'male' | 'female' | 'neutral';

export interface VoiceMeta {
  name: VoiceName;
  gender: Gender;
  sampleHint: string;
}

export const VOICES: VoiceMeta[] = [
  { name: 'Achernar', gender: 'female', sampleHint: 'Nữ trẻ trung' },
  { name: 'Aoede',    gender: 'female', sampleHint: 'Nữ ấm áp' },
  { name: 'Charon',   gender: 'male',   sampleHint: 'Nam trầm' },
  { name: 'Fenrir',   gender: 'male',   sampleHint: 'Nam mạnh mẽ' },
  { name: 'Kore',     gender: 'female', sampleHint: 'Nữ dịu dàng' },
  { name: 'Leda',     gender: 'female', sampleHint: 'Nữ tinh nghịch' },
  { name: 'Zephyr',   gender: 'neutral',sampleHint: 'Trung tính' },
];
