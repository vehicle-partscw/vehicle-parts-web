import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark';

interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  initializeTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'light',

      toggleTheme: () => {
        set((state) => {
          const newTheme = state.theme === 'light' ? 'dark' : 'light';
          applyTheme(newTheme);
          return { theme: newTheme };
        });
      },

      setTheme: (theme: Theme) => {
        applyTheme(theme);
        set({ theme });
      },

      initializeTheme: () => {
        // Check localStorage or system preference
        const stored = localStorage.getItem('theme-storage');
        let theme: Theme = 'light';

        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            theme = parsed.state?.theme || 'light';
          } catch {
            theme = 'light';
          }
        } else if (
          window.matchMedia &&
          window.matchMedia('(prefers-color-scheme: dark)').matches
        ) {
          theme = 'dark';
        }

        applyTheme(theme);
        set({ theme });
      },
    }),
    {
      name: 'theme-storage',
    }
  )
);

function applyTheme(theme: Theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}
