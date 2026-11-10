'use client';

import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '../lib/cn';
import { Input } from './Input';

export interface ComboboxOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyLabel = 'No results',
  disabled,
  'aria-label': ariaLabel,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel ?? placeholder}
          aria-expanded={open}
          className="hos-input hos-focus-visible"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            textAlign: 'left',
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          <span style={{ color: selected ? undefined : 'var(--hos-fg-muted)' }}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronsUpDown size={16} aria-hidden style={{ opacity: 0.5 }} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="hos-combobox__panel" sideOffset={4} align="start" style={{ width: 'var(--radix-popover-trigger-width)' }}>
          <div style={{ padding: 'var(--hos-space-2)' }}>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
            />
          </div>
          {filtered.length === 0 ? (
            <p style={{ padding: 'var(--hos-space-3)', fontSize: 'var(--hos-text-sm)', color: 'var(--hos-fg-muted)' }}>
              {emptyLabel}
            </p>
          ) : (
            filtered.map((opt) => (
              <div
                key={opt.value}
                role="option"
                aria-selected={opt.value === value}
                className="hos-combobox__option"
                tabIndex={0}
                onClick={() => {
                  if (opt.disabled) return;
                  onValueChange?.(opt.value);
                  setOpen(false);
                  setQuery('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (!opt.disabled) {
                      onValueChange?.(opt.value);
                      setOpen(false);
                      setQuery('');
                    }
                  }
                }}
                style={opt.disabled ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--hos-space-2)' }}>
                  {opt.value === value ? <Check size={14} /> : <span style={{ width: 14 }} />}
                  {opt.label}
                </span>
              </div>
            ))
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
