'use client';

import { Button, useDensity } from '@hos/ui';

export function DensityToggle() {
  const { density, setDensity } = useDensity();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setDensity(density === 'comfortable' ? 'compact' : 'comfortable')}
      aria-pressed={density === 'compact'}
    >
      {density === 'comfortable' ? 'Comfortable' : 'Compact'}
    </Button>
  );
}
