'use client';

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

type ThemeContextValue = {
  theme: ThemeMode;
  resolved: 'light' | 'dark';
  setTheme: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = 'hos-theme';

function systemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'system' ? systemTheme() : mode;
}

function applyTheme(resolved: 'light' | 'dark') {
  document.documentElement.dataset.theme = resolved;
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
}: {
  children: ReactNode;
  defaultTheme?: ThemeMode;
}) {
  const [theme, setThemeState] = useState<ThemeMode>(defaultTheme);
  const [resolved, setResolved] = useState<'light' | 'dark'>(() =>
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  );

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      setThemeState(stored);
    }
  }, []);

  useEffect(() => {
    const next = resolveTheme(theme);
    setResolved(next);
    applyTheme(next);
  }, [theme]);

  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const next = mq.matches ? 'dark' : 'light';
      setResolved(next);
      applyTheme(next);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }, []);

  const value = useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
