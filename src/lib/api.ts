import axios from 'axios';
import type { AxiosInstance } from 'axios';

// VITE_API_BASE_URL is set in the deployed environment (Vercel) and falls back to localhost for dev
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1').replace(/\/+$/, '');

const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Tokens may live in either localStorage (Remember me ON) or sessionStorage (OFF).
// Always check sessionStorage first, then fall back to localStorage.
function readToken(key: string): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(key) ?? localStorage.getItem(key);
}
function writeAccessToken(token: string) {
  // write back to whichever store currently holds the refresh token
  const target = sessionStorage.getItem('refreshToken') ? sessionStorage : localStorage;
  target.setItem('accessToken', token);
}
function clearTokens() {
  ['localStorage', 'sessionStorage'].forEach((s) => {
    const store = s === 'localStorage' ? localStorage : sessionStorage;
    store.removeItem('accessToken');
    store.removeItem('refreshToken');
    store.removeItem('authUser');
    store.removeItem('authPersistent');
  });
}

// Request interceptor: attach JWT
api.interceptors.request.use(
  (config) => {
    const token = readToken('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401 errors with refresh-token flow
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = readToken('refreshToken');
        if (!refreshToken) {
          throw new Error('No refresh token available');
        }

        const response = await axios.post(
          `${API_BASE_URL}/auth/refresh`,
          { refreshToken },
          { headers: { 'Content-Type': 'application/json' } }
        );

        const { accessToken } = response.data;
        writeAccessToken(accessToken);

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (_refreshError) {
        clearTokens();
        window.location.href = '/login';
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
