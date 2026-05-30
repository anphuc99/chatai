import { apiClient } from '../../../api/client';
import { ENDPOINTS } from '../../../api/endpoints';
import { UserDto, UpdatePreferencesDto } from '@chatai/shared-types';

export const profileApi = {
  async patchPreferences(dto: UpdatePreferencesDto): Promise<UserDto> {
    return apiClient.patch<UserDto>(ENDPOINTS.USERS.PREFERENCES, dto);
  },

  async uploadAvatar(formData: FormData): Promise<{ photoURL: string }> {
    return apiClient.post<{ photoURL: string }>(ENDPOINTS.USERS.AVATAR, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
};
