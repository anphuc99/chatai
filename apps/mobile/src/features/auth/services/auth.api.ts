import { apiClient } from '../../../api/client';
import { ENDPOINTS } from '../../../api/endpoints';
import { UserDto } from '@chatai/shared-types';

export const authApi = {
  async googleSignin(idToken: string): Promise<UserDto> {
    return apiClient.post<UserDto>(ENDPOINTS.AUTH.GOOGLE_SIGNIN, { idToken });
  },

  async logout(): Promise<void> {
    return apiClient.post<void>(ENDPOINTS.AUTH.LOGOUT);
  },
};
