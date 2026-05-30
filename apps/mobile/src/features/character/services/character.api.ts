import { CharacterDto } from '@chatai/shared-types';
import { apiClient } from '../../../api/client';
import { CreateCharacterInput, UpdateCharacterInput } from './character.schemas';

export const characterApi = {
  listByStory: (sid: string): Promise<CharacterDto[]> =>
    apiClient.get(`/stories/${sid}/characters`),

  create: (sid: string, dto: CreateCharacterInput): Promise<CharacterDto> =>
    apiClient.post(`/stories/${sid}/characters`, dto),

  update: (id: string, dto: UpdateCharacterInput): Promise<CharacterDto> =>
    apiClient.patch(`/characters/${id}`, dto),

  delete: (id: string): Promise<void> =>
    apiClient.delete(`/characters/${id}`),

  uploadAvatar: (id: string, formData: FormData): Promise<{ avatarUrl: string }> =>
    apiClient.post(`/characters/${id}/avatar`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }),
};
