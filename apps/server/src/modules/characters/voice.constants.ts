import { VOICES, VoiceName } from '@chatai/shared-types';

export { VOICES, VoiceName };

export function isValidVoice(v: string): v is VoiceName {
  return (VOICES as readonly string[]).includes(v);
}
