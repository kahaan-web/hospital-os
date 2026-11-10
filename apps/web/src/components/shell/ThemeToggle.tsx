'use client';

import { IconButton, useTheme } from '@hos/ui';
import { Moon, Sun } from 'lucide-react';

export function ThemeToggle() {
  const { resolved, setTheme } = useTheme();

  return (
    <IconButton
      label={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      size="sm"
      onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}
    >
      {resolved === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </IconButton>
  );
}
