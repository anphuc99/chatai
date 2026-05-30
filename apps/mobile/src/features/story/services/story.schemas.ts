import { z } from 'zod';

export const createStorySchema = z.object({
  title: z
    .string()
    .min(1, 'Tiêu đề không được để trống')
    .max(100, 'Tiêu đề không được quá 100 ký tự'),
  initialSetting: z
    .string()
    .min(1, 'Bối cảnh không được để trống')
    .max(5000, 'Bối cảnh không được quá 5000 ký tự'),
});

export const updateStorySchema = createStorySchema.partial();

export type CreateStoryInput = z.infer<typeof createStorySchema>;
export type UpdateStoryInput = z.infer<typeof updateStorySchema>;
