'use client';

import { Checkbox, Field, Input } from '@hos/ui';
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
  const ticked = Boolean(value.trim());

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Checkbox
        id={`${id}-tick`}
        checked={ticked}
        label="Tick"
        onCheckedChange={(checked) => {
          if (checked === true) onChange(value.trim() ? value : nowTimeValue());
          else onChange('');
        }}
      />
      <Field label={label} className="min-w-[12rem] flex-1">
        <Input
          id={id}
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
        />
      </Field>
    </div>
  );
}
