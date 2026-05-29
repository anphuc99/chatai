const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api/v1';

export const ENDPOINTS = {
  BASE_URL,

  AUTH: {
    GOOGLE_SIGNIN: '/auth/google-signin',
    LOGOUT: '/auth/logout',
  },

  USERS: {
    ME: '/users/me',
    PREFERENCES: '/users/preferences',
    AVATAR: '/users/avatar',
  },

  STORIES: {
    LIST: '/stories',
    DETAIL: (id: string) => `/stories/${id}`,
  },

  CHAT: {
    SESSIONS: '/chat/sessions',
    MESSAGES: (sessionId: string) => `/chat/sessions/${sessionId}/messages`,
  },
} as const;
