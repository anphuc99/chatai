import { useAuthStore } from './auth.store';
import { authService } from '../features/auth/services/auth.service';
import { authApi } from '../features/auth/services/auth.api';
import { secureStorage } from '../utils/secure-storage';
import { apiClient } from '../api/client';

// Mock các thư viện Native & Firebase để chạy unit test trên môi trường Node
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn().mockResolvedValue(true),
    signIn: jest.fn().mockResolvedValue({ idToken: 'google-token', user: { email: 'test@example.com' } }),
    signOut: jest.fn().mockResolvedValue(undefined),
    isSignedIn: jest.fn().mockResolvedValue(true),
    revokeAccess: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue(null),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../utils/firebase', () => ({
  auth: {
    currentUser: {
      getIdToken: jest.fn().mockResolvedValue('firebase-token'),
    },
  },
}));

jest.mock('firebase/auth', () => ({
  initializeAuth: jest.fn(),
  inMemoryPersistence: {},
  connectAuthEmulator: jest.fn(),
  GoogleAuthProvider: {
    credential: jest.fn().mockReturnValue({}),
  },
  signInWithCredential: jest.fn().mockResolvedValue({
    user: {
      getIdToken: jest.fn().mockResolvedValue('firebase-token'),
      email: 'test@example.com',
      displayName: 'Test User',
      photoURL: 'http://example.com/photo.jpg',
    },
  }),
  signInAnonymously: jest.fn().mockResolvedValue({
    user: {
      getIdToken: jest.fn().mockResolvedValue('anonymous-firebase-token'),
    },
  }),
  signOut: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('axios', () => ({
  create: jest.fn().mockReturnValue({
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
    get: jest.fn().mockResolvedValue({ data: {} }),
    post: jest.fn().mockResolvedValue({ data: {} }),
  }),
}));

describe('AuthStore', () => {
  beforeEach(() => {
    // Reset Zustand store state trước mỗi test case
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      token: null,
    });
    jest.clearAllMocks();
  });

  it('nên khởi tạo state mặc định chính xác', () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(state.token).toBeNull();
  });

  it('nên login thành công và cập nhật state chính xác', async () => {
    const mockUser = { uid: '123', email: 'test@example.com', displayName: 'Test User' };
    
    jest.spyOn(authService, 'signInWithGoogle').mockResolvedValue({
      idToken: 'firebase-token',
      googleIdToken: 'google-token',
      profile: { email: 'test@example.com', name: 'Test User', photo: 'http://example.com/photo.jpg' },
    });
    
    jest.spyOn(authApi, 'googleSignin').mockResolvedValue(mockUser as any);
    const saveTokenSpy = jest.spyOn(secureStorage, 'saveToken').mockResolvedValue(undefined);

    await useAuthStore.getState().login();

    const state = useAuthStore.getState();
    expect(state.user).toEqual(mockUser);
    expect(state.isAuthenticated).toBe(true);
    expect(state.token).toBe('firebase-token');
    expect(state.isLoading).toBe(false);
    expect(saveTokenSpy).toHaveBeenCalledWith('firebase-token');
  });

  it('nên handle lỗi khi login thất bại', async () => {
    jest.spyOn(authService, 'signInWithGoogle').mockRejectedValue(new Error('Login Cancelled'));

    await expect(useAuthStore.getState().login()).rejects.toThrow('Login Cancelled');

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(state.token).toBeNull();
  });

  it('nên bypassLoginDev thành công ở chế độ dev', async () => {
    const mockUser = { uid: 'anon-123', email: '', displayName: 'Anonymous User' };
    jest.spyOn(authApi, 'googleSignin').mockResolvedValue(mockUser as any);
    const saveTokenSpy = jest.spyOn(secureStorage, 'saveToken').mockResolvedValue(undefined);

    // Giả lập môi trường dev
    (globalThis as any).__DEV__ = true;

    await useAuthStore.getState().bypassLoginDev();

    const state = useAuthStore.getState();
    expect(state.user).toEqual(mockUser);
    expect(state.isAuthenticated).toBe(true);
    expect(state.isLoading).toBe(false);
    expect(saveTokenSpy).toHaveBeenCalled();
  });

  it('nên hydrate thành công nếu có token hợp lệ trong SecureStorage', async () => {
    const mockUser = { uid: '123', email: 'test@example.com', displayName: 'Test User' };
    
    jest.spyOn(secureStorage, 'loadToken').mockResolvedValue('existing-token');
    jest.spyOn(authService, 'getCurrentIdToken').mockResolvedValue('refreshed-token');
    jest.spyOn(secureStorage, 'saveToken').mockResolvedValue(undefined);
    jest.spyOn(apiClient, 'get').mockResolvedValue(mockUser);

    await useAuthStore.getState().hydrate();

    const state = useAuthStore.getState();
    expect(state.user).toEqual(mockUser);
    expect(state.isAuthenticated).toBe(true);
    expect(state.token).toBe('refreshed-token');
    expect(state.isLoading).toBe(false);
  });

  it('nên logout và xóa hết dữ liệu an toàn', async () => {
    useAuthStore.setState({
      user: { uid: '123' } as any,
      isAuthenticated: true,
      token: 'some-token',
    });

    const logoutApiSpy = jest.spyOn(authApi, 'logout').mockResolvedValue(undefined);
    const signOutSpy = jest.spyOn(authService, 'signOut').mockResolvedValue(undefined);
    const deleteTokenSpy = jest.spyOn(secureStorage, 'deleteToken').mockResolvedValue(undefined);

    await useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.token).toBeNull();
    expect(logoutApiSpy).toHaveBeenCalled();
    expect(signOutSpy).toHaveBeenCalled();
    expect(deleteTokenSpy).toHaveBeenCalled();
  });
});
