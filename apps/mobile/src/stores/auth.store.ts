import { create } from 'zustand';
import { authService } from '../features/auth/services/auth.service';
import { authApi } from '../features/auth/services/auth.api';
import { secureStorage } from '../utils/secure-storage';
import { setAuthTokenGetter, apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { UserDto } from '@chatai/shared-types';

interface AuthState {
  user: UserDto | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  token: string | null;
  login: () => Promise<void>;
  bypassLoginDev: () => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
  refreshToken: () => Promise<string | null>;
  setUser: (user: UserDto) => void;
}

export const useAuthStore = create<AuthState>((set, get) => {
  // Đăng ký lazy token getter với apiClient để đính kèm header Authorization tự động
  setAuthTokenGetter(() => get().token);

  return {
    user: null,
    isAuthenticated: false,
    isLoading: false,
    token: null,

    login: async () => {
      set({ isLoading: true });
      try {
        const result = await authService.signInWithGoogle();
        const user = await authApi.googleSignin(result.idToken);
        await secureStorage.saveToken(result.idToken);
        set({
          user,
          isAuthenticated: true,
          token: result.idToken,
          isLoading: false,
        });
      } catch (error) {
        set({ isLoading: false });
        throw error;
      }
    },

    bypassLoginDev: async () => {
      if (!__DEV__) {
        console.warn('Bypass login chỉ được phép chạy trong môi trường development');
        return;
      }
      set({ isLoading: true });
      try {
        const { auth } = require('../utils/firebase');
        const { signInAnonymously } = require('firebase/auth');
        
        // Đăng nhập vô danh vào Firebase Auth Emulator/Production
        const userCredential = await signInAnonymously(auth);
        const firebaseIdToken = await userCredential.user.getIdToken();
        
        // Đồng bộ thông tin user vô danh với NestJS API Server
        const user = await authApi.googleSignin(firebaseIdToken);
        await secureStorage.saveToken(firebaseIdToken);
        
        set({
          user,
          isAuthenticated: true,
          token: firebaseIdToken,
          isLoading: false,
        });
      } catch (error) {
        set({ isLoading: false });
        throw error;
      }
    },

    logout: async () => {
      set({ isLoading: true });
      try {
        await authApi.logout();
      } catch (e) {
        console.warn('[AuthStore] API logout failed (ignored):', e);
      }
      try {
        await authService.signOut();
      } catch (e) {
        console.warn('[AuthStore] AuthService signOut failed (ignored):', e);
      }
      await secureStorage.deleteToken();
      set({
        user: null,
        isAuthenticated: false,
        token: null,
        isLoading: false,
      });
    },

    hydrate: async () => {
      set({ isLoading: true });
      const token = await secureStorage.loadToken();
      if (!token) {
        set({ isAuthenticated: false, isLoading: false });
        return;
      }

      try {
        // Phục hồi session bằng cách lấy ID token mới nhất
        const refreshedToken = await authService.getCurrentIdToken();
        const activeToken = refreshedToken || token;

        if (refreshedToken) {
          await secureStorage.saveToken(refreshedToken);
        }

        // Cập nhật token vào state trước để request API profile có token
        set({ token: activeToken });

        // Gọi API tải thông tin profile
        const user = await apiClient.get<UserDto>(ENDPOINTS.USERS.ME);

        set({
          user,
          isAuthenticated: true,
          isLoading: false,
        });
      } catch (error) {
        console.warn('[AuthStore] Hydration failed, clearing token:', error);
        await secureStorage.deleteToken();
        set({
          user: null,
          isAuthenticated: false,
          token: null,
          isLoading: false,
        });
      }
    },

    refreshToken: async () => {
      try {
        const token = await authService.getCurrentIdToken(true);
        if (token) {
          await secureStorage.saveToken(token);
          set({ token });
        }
        return token;
      } catch (error) {
        console.error('[AuthStore] Refresh token failed:', error);
        return null;
      }
    },

    setUser: (user: UserDto) => {
      set({ user });
    },
  };
});
