import { create } from 'zustand';
import { jwtDecode } from 'jwt-decode';

interface User {
  userId: string;
  email: string;
  fullName: string;
  role: string;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  isAuthenticated: boolean;
  login: (accessToken: string, refreshToken: string, rememberMe?: boolean, user?: User) => void;
  logout: () => void;
  setUser: (user: User) => void;
}

// .NET ClaimTypes.Role serialises to this URI in JWTs
const DOTNET_ROLE_CLAIM = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';

function decodeToken(token: string): Partial<User> {
  try {
    const decoded = jwtDecode<any>(token);
    return {
      userId: decoded.sub || decoded.userId,
      email: decoded.email,
      fullName: decoded.name || decoded.fullName,
      role: decoded.role || decoded[DOTNET_ROLE_CLAIM],
    };
  } catch (error) {
    console.error('Failed to decode token:', error);
    return {};
  }
}

// Storage helpers - Remember Me ON → localStorage (persists across restarts)
//                  Remember Me OFF → sessionStorage (cleared when browser closes)
const ACCESS_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';
const USER_KEY = 'authUser';
const PERSIST_KEY = 'authPersistent';

function pickStorage(): Storage {
  // sessionStorage wins if it has fresh tokens; otherwise fall back to localStorage
  if (typeof window === 'undefined') return localStorage;
  if (sessionStorage.getItem(ACCESS_KEY)) return sessionStorage;
  return localStorage;
}

function clearAll() {
  [localStorage, sessionStorage].forEach((s) => {
    s.removeItem(ACCESS_KEY);
    s.removeItem(REFRESH_KEY);
    s.removeItem(USER_KEY);
    s.removeItem(PERSIST_KEY);
  });
}

function readInitial(): Pick<AuthState, 'accessToken' | 'refreshToken' | 'user' | 'isAuthenticated'> {
  if (typeof window === 'undefined') {
    return { accessToken: null, refreshToken: null, user: null, isAuthenticated: false };
  }
  const s = pickStorage();
  const accessToken = s.getItem(ACCESS_KEY);
  const refreshToken = s.getItem(REFRESH_KEY);
  const userRaw = s.getItem(USER_KEY);
  const user = userRaw ? safeParse<User>(userRaw) : null;
  return {
    accessToken,
    refreshToken,
    user,
    isAuthenticated: !!accessToken,
  };
}

function safeParse<T>(raw: string): T | null {
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export const useAuthStore = create<AuthState>()((set) => ({
  ...readInitial(),

  login: (accessToken: string, refreshToken: string, rememberMe = true, user?: User) => {
    const decoded = decodeToken(accessToken);
    const userInfo: User = user && user.userId
      ? user
      : {
          userId: decoded.userId || '',
          email: decoded.email || '',
          fullName: decoded.fullName || '',
          role: decoded.role || '',
        };

    // start clean so we never have tokens in both stores
    clearAll();

    const target = rememberMe ? localStorage : sessionStorage;
    target.setItem(ACCESS_KEY, accessToken);
    target.setItem(REFRESH_KEY, refreshToken);
    target.setItem(USER_KEY, JSON.stringify(userInfo));
    target.setItem(PERSIST_KEY, rememberMe ? '1' : '0');

    set({
      accessToken,
      refreshToken,
      user: userInfo,
      isAuthenticated: true,
    });
  },

  logout: () => {
    clearAll();
    set({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
    });
  },

  setUser: (user: User) => {
    const s = pickStorage();
    s.setItem(USER_KEY, JSON.stringify(user));
    set({ user });
  },
}));
