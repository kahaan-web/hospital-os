'use client';

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type DensityMode = 'comfortable' | 'compact';

type DensityContextValue = {
  density: DensityMode;
  setDensity: (mode: DensityMode) => void;
};

const DensityContext = createContext<DensityContextValue | null>(null);
const STORAGE_KEY = 'hos-density';

export function DensityProvider({
  children,
  defaultDensity = 'comfortable',
}: {
  children: ReactNode;
  defaultDensity?: DensityMode;
}) {
  const [density, setDensityState] = useState<DensityMode>(defaultDensity);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as DensityMode | null;
    if (stored === 'comfortable' || stored === 'compact') {
      setDensityState(stored);
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);

  const setDensity = useCallback((mode: DensityMode) => {
    setDensityState(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }, []);

  const value = useMemo(() => ({ density, setDensity }), [density, setDensity]);

  return <DensityContext.Provider value={value}>{children}</DensityContext.Provider>;
}

export function useDensity(): DensityContextValue {
  const ctx = useContext(DensityContext);
  if (!ctx) throw new Error('useDensity must be used within DensityProvider');
  return ctx;
}
