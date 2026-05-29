import * as Crypto from 'expo-crypto';

export function uuidv4(): string {
  return Crypto.randomUUID();
}
