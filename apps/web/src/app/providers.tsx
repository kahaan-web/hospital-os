'use client';

import { DensityProvider, ThemeProvider, ToastProvider, TooltipProvider } from '@hos/ui';
import type { ReactNode } from 'react';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <DensityProvider>
        <ToastProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </ToastProvider>
      </DensityProvider>
    </ThemeProvider>
  );
}
