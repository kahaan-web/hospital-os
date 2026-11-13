'use client';

import { Checkbox } from '@hos/ui';

export function MultiCheckList({
  label,
  options,
  value,
  onChange,
  empty,
}: {
  label: string;
  options: { id: string; label: string }[];
  value: string[];
  onChange: (next: string[]) => void;
  empty: string;
}) {
  return (
    <fieldset
      style={{
        border: '1px solid var(--hos-border-default)',
        borderRadius: 'var(--hos-radius-md)',
        padding: 'var(--hos-space-2) var(--hos-space-3)',
        margin: 0,
        minWidth: 0,
      }}
    >
      <legend style={{ fontSize: 'var(--hos-text-sm)', fontWeight: 500, padding: '0 4px' }}>{label}</legend>
      {options.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--hos-fg-muted)', fontSize: 'var(--hos-text-sm)' }}>{empty}</p>
      ) : (
        <div style={{ maxHeight: 180, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {options.map((opt) => (
            <Checkbox
              key={opt.id}
              checked={value.includes(opt.id)}
              label={opt.label}
              onCheckedChange={(checked) => {
                if (checked === true) onChange(value.includes(opt.id) ? value : [...value, opt.id]);
                else onChange(value.filter((id) => id !== opt.id));
              }}
            />
          ))}
        </div>
      )}
    </fieldset>
  );
}
