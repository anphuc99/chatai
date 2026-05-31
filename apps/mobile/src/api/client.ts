import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosError } from 'axios';
import { ENDPOINTS } from './endpoints';
import { uuidv4 } from '../utils/uuid';

let _tokenGetter: (() => string | null) | null = null;

export function setAuthTokenGetter(fn: () => string | null) {
  _tokenGetter = fn;
}

const instance: AxiosInstance = axios.create({
  baseURL: ENDPOINTS.BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = _tokenGetter?.();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.headers['X-Request-Id'] = uuidv4();

  const method = config.method?.toUpperCase();
  if (method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    config.headers['Idempotency-Key'] = config.headers['Idempotency-Key'] || uuidv4();
  }

  return config;
});

// Response error interceptor
instance.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ error?: { code: string; message: string; details?: unknown } }>) => {
    if (error.response?.status === 401) {
      // Will emit global event for auth store to handle logout
      console.warn('[API] 401 - Token expired or invalid');
    }

    const serverError = error.response?.data?.error;
    if (serverError) {
      const enrichedError = new Error(serverError.message);
      (enrichedError as any).code = serverError.code;
      (enrichedError as any).details = serverError.details;
      return Promise.reject(enrichedError);
    }

    return Promise.reject(error);
  },
);

export const apiClient = {
  get: <T>(url: string, config?: any) => instance.get<T>(url, config).then((r) => r.data),
  post: <T>(url: string, body?: any, config?: any) =>
    instance.post<T>(url, body, config).then((r) => r.data),
  patch: <T>(url: string, body?: any, config?: any) =>
    instance.patch<T>(url, body, config).then((r) => r.data),
  delete: <T>(url: string, config?: any) => instance.delete<T>(url, config).then((r) => r.data),
};

export default apiClient;
