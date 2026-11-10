'use client';

import type { LocationDto } from '@hos/shared';
import { Combobox } from '@hos/ui';

export interface LocationSwitcherProps {
  locations: LocationDto[];
  value?: string | null;
  onChange?: (locationId: string) => void;
  disabled?: boolean;
}

export function LocationSwitcher({ locations, value, onChange, disabled }: LocationSwitcherProps) {
  const options = locations.map((loc) => ({
    value: loc.id,
    label: `${loc.name} (${loc.city})`,
  }));

  return (
    <Combobox
      options={options}
      value={value ?? undefined}
      onValueChange={(id) => onChange?.(id)}
      placeholder="Select location"
      searchPlaceholder="Search locations"
      aria-label="Active location"
      disabled={disabled || locations.length === 0}
    />
  );
}
