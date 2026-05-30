import { StoryDto, PaginatedResponse } from '@chatai/shared-types';
import { apiClient } from '../../../api/client';
import { CreateStoryInput, UpdateStoryInput } from './story.schemas';

export const storyApi = {
  list: (cursor?: string, limit = 20): Promise<PaginatedResponse<StoryDto>> =>
    apiClient.get('/stories', { params: { cursor, limit } }),

  getById: (id: string): Promise<StoryDto> =>
    apiClient.get(`/stories/${id}`),

  create: (dto: CreateStoryInput): Promise<StoryDto> =>
    apiClient.post('/stories', dto),

  update: (id: string, dto: UpdateStoryInput): Promise<StoryDto> =>
    apiClient.patch(`/stories/${id}`, dto),

  delete: (id: string): Promise<void> =>
    apiClient.delete(`/stories/${id}`),
};
