export type CharacterDto = {
  id: string;
  storyId: string;
  name: string;
  age?: number | null;
  personality: string;
  avatarUrl: string | null;
  voiceName: string;
  pitch: number;
  createdAt: string; // ISO string
};
