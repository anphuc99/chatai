export const VOICES = ['Achernar', 'Aoede', 'Charon', 'Fenrir', 'Kore', 'Leda', 'Zephyr'] as const;
export type VoiceName = typeof VOICES[number];

export function isValidVoice(v: string): v is VoiceName {
  return (VOICES as readonly string[]).includes(v);
}
