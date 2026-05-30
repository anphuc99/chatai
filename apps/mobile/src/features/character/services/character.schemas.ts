import { z } from 'zod';
import { VOICES, VoiceName } from '../constants/voices';

const voiceNames = VOICES.map((v) => v.name) as [VoiceName, ...VoiceName[]];

export const createCharacterSchema = z.object({
  name: z
    .string()
    .min(1, 'Tên nhân vật không được để trống')
    .max(50, 'Tên nhân vật không được quá 50 ký tự'),
  age: z
    .union([
      z.number().int().min(1, 'Tuổi phải lớn hơn 0').max(999, 'Tuổi phải nhỏ hơn 1000'),
      z.nan(),
    ])
    .optional(),
  personality: z
    .string()
    .min(1, 'Tính cách không được để trống')
    .max(3000, 'Tính cách không được quá 3000 ký tự'),
  voiceName: z.enum(voiceNames, {
    message: 'Vui lòng chọn giọng nói',
  }),
  pitch: z
    .number()
    .min(0.8, 'Cao độ phải từ 0.8 trở lên')
    .max(1.5, 'Cao độ phải từ 1.5 trở xuống'),
});

export const updateCharacterSchema = createCharacterSchema.partial();

export type CreateCharacterInput = z.infer<typeof createCharacterSchema>;
export type UpdateCharacterInput = z.infer<typeof updateCharacterSchema>;
