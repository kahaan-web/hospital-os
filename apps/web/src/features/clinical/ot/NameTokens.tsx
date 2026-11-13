'use client';

import { Button, Input } from '@hos/ui';
import { useState } from 'react';

export function NameTokens({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const name = draft.trim();
    if (!name || values.some((item) => item.toLowerCase() === name.toLowerCase())) return;
    onChange([...values, name]);
    setDraft('');
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 'var(--hos-space-2)', alignItems: 'center' }}>
        <Input
          value={draft}
          aria-label={label}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="secondary" onClick={add}>
          Add
        </Button>
      </div>
      {values.length > 0 ? (
        <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {values.map((name) => (
            <li key={name}>
              <Button type="button" size="sm" variant="ghost" onClick={() => onChange(values.filter((item) => item !== name))} aria-label={`Remove ${name}`}>
                {name} ×
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ margin: '8px 0 0', color: 'var(--hos-fg-muted)', fontSize: 'var(--hos-text-sm)' }}>None added.</p>
      )}
    </div>
  );
}
