import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { getThemePreference, saveThemePreference } from './prefs';
import { darkColors, lightColors, type ColorTokens, type ThemePreference } from './theme';

export type { ThemePreference };

type ThemeContextValue = {
  preference: ThemePreference;
  colors: ColorTokens;
  dark: boolean;
  setPreference: (p: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('light');
  const dark = preference === 'dark' || (preference !== 'light' && system === 'dark');
  const colors = dark ? darkColors : lightColors;

  useEffect(() => {
    void getThemePreference().then((saved) => {
      if (saved) setPreferenceState(saved);
    });
  }, []);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    void saveThemePreference(p);
  }, []);

  const value = useMemo(
    () => ({ preference, colors, dark, setPreference }),
    [preference, colors, dark, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

export function useToggleTheme(): () => void {
  const { preference, setPreference } = useTheme();
  return useCallback(() => setPreference(preference === 'light' ? 'dark' : 'light'), [preference, setPreference]);
}
