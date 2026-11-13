'use client';

import { Button, Field, Input } from '@hos/ui';
import { Check } from 'lucide-react';
import { nowTimeValue } from './helpers';

export function TimeTickRow({
  label,
  value,
  onChange,
  id,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  id: string;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label={label} className="min-w-[12rem] flex-1">
        <Input
          id={id}
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
        />
      </Field>
      <Button
        type="button"
        variant="secondary"
        title={`Set ${label} to current time`}
        aria-label={`Tick — set ${label} to now`}
        onClick={() => onChange(nowTimeValue())}
      >
        <Check size={16} aria-hidden />
        <span className="sr-only">Tick now</span>
      </Button>
    </div>
  );
}
