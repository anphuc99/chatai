export type StoryDto = {
  id: string;
  userId: string;
  title: string;
  initialSetting: string;
  currentProgress: string;
  characterCount: number;
  sessionCount: number;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string;
};

export type CreateStoryDto = {
  title: string;
  initialSetting: string;
};

export type UpdateStoryDto = Partial<CreateStoryDto>;
