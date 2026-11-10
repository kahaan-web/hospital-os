import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { darkColors, lightColors, type ColorTokens } from './theme';

export type ThemePreference = 'light' | 'dark';

type ThemeContextValue = {
  preference: ThemePreference;
  colors: ColorTokens;
  dark: boolean;
  setPreference: (p: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>('light');
  const dark = preference === 'dark' || (preference !== 'light' && system === 'dark');
  const colors = dark ? darkColors : lightColors;

  const value = useMemo(
    () => ({ preference, colors, dark, setPreference }),
    [preference, colors, dark],
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
