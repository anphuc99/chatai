import { z } from 'zod';
import { EMOTIONS, INTENSITIES } from '@/modules/tts/tts.constants';

export const AssistantMessageSchema = z.object({
  characterName: z.string().min(1),
  text: z.string().min(1),
  emotion: z.enum(EMOTIONS).optional(),
  intensity: z.enum(INTENSITIES).optional(),
  translation: z.string().nullable().optional(),
  words: z
    .array(
      z.object({
        hz: z.string(),
        py: z.string(),
        vn: z.string(),
      }),
    )
    .nullable()
    .optional(),
  shopEvent: z
    .object({
      itemName: z.string(),
      price: z.number().int().positive(),
    })
    .nullable()
    .optional(),
});

export const AssistantBatchSchema = z.object({
  content: z.array(AssistantMessageSchema).min(1).max(8),
  triggerMemory: z.boolean().optional(),
});

export type AssistantMessage = z.infer<typeof AssistantMessageSchema>;
export type AssistantBatch = z.infer<typeof AssistantBatchSchema>;
