import { useEffect } from 'react';
import { useSettingsStore } from '@/store/settingsStore';

/**
 * Hook to initialize and manage the theme.
 * Syncs the theme from store to the DOM on mount.
 * Supports 'system' theme that follows OS preference.
 */
export function useTheme() {
  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const toggleTheme = useSettingsStore((state) => state.toggleTheme);

  useEffect(() => {
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const applySystemTheme = () => {
        document.documentElement.dataset.theme = mediaQuery.matches ? 'dark' : 'light';
      };
      applySystemTheme();
      mediaQuery.addEventListener('change', applySystemTheme);
      return () => mediaQuery.removeEventListener('change', applySystemTheme);
    }
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return { theme, setTheme, toggleTheme };
}
