import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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
  login: (accessToken: string, refreshToken: string, user?: User) => void;
  logout: () => void;
  setUser: (user: User) => void;
}

// Decode JWT to extract user info
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

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,

      login: (accessToken: string, refreshToken: string, user?: User) => {
        // Decode user info from JWT if not provided
        const decoded = decodeToken(accessToken);
        const userInfo: User = user && user.userId
          ? user
          : {
              userId: decoded.userId || '',
              email: decoded.email || '',
              fullName: decoded.fullName || '',
              role: decoded.role || '',
            };

        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);

        set({
          accessToken,
          refreshToken,
          user: userInfo,
          isAuthenticated: true,
        });
      },

      logout: () => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');

        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
        });
      },

      setUser: (user: User) => {
        set({ user });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
