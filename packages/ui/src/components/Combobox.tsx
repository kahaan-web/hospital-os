'use client';

import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
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
  id?: string;
  invalid?: boolean;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyLabel = 'No results',
  disabled,
  id,
  invalid,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const selectableIndices = useMemo(
    () => filtered.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0),
    [filtered],
  );

  useEffect(() => {
    if (!open) return;
    const selectedIndex = filtered.findIndex((o) => o.value === value && !o.disabled);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : selectableIndices[0] ?? 0);
  }, [open, filtered, value, selectableIndices]);

  useEffect(() => {
    if (!open) return;
    const active = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    if (active instanceof HTMLElement) {
      active.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, open]);

  const pick = (opt: ComboboxOption) => {
    if (opt.disabled) return;
    onValueChange?.(opt.value);
    setOpen(false);
    setQuery('');
  };

  const moveActive = (delta: number) => {
    if (selectableIndices.length === 0) return;
    const currentPos = selectableIndices.indexOf(activeIndex);
    const base = currentPos >= 0 ? currentPos : 0;
    const nextPos = (base + delta + selectableIndices.length) % selectableIndices.length;
    setActiveIndex(selectableIndices[nextPos]!);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-label={ariaLabel ?? placeholder}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid ?? invalid ?? undefined}
          className={cn('hos-input hos-focus-visible', invalid && 'hos-input--error')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            textAlign: 'left',
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setOpen(true);
            }
          }}
        >
          <span style={{ color: selected ? undefined : 'var(--hos-fg-muted)' }}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronsUpDown size={16} aria-hidden strokeWidth={1.5} style={{ opacity: 0.5 }} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="hos-combobox__panel"
          sideOffset={4}
          align="start"
          style={{ width: 'var(--radix-popover-trigger-width)' }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              moveActive(1);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              moveActive(-1);
            } else if (e.key === 'Home') {
              e.preventDefault();
              setActiveIndex(selectableIndices[0] ?? 0);
            } else if (e.key === 'End') {
              e.preventDefault();
              setActiveIndex(selectableIndices[selectableIndices.length - 1] ?? 0);
            } else if (e.key === 'Enter' && filtered[activeIndex]) {
              e.preventDefault();
              pick(filtered[activeIndex]!);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
        >
          <div style={{ padding: 'var(--hos-space-2)' }}>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              autoFocus
            />
          </div>
          {filtered.length === 0 ? (
            <p style={{ padding: 'var(--hos-space-3)', fontSize: 'var(--hos-text-sm)', color: 'var(--hos-fg-muted)' }}>
              {emptyLabel}
            </p>
          ) : (
            <div ref={listRef} id={listId} role="listbox" aria-label={ariaLabel ?? placeholder}>
              {filtered.map((opt, index) => {
                const active = index === activeIndex;
                const activeId = `${listId}-opt-${index}`;
                return (
                  <div
                    key={opt.value}
                    id={activeId}
                    data-index={index}
                    role="option"
                    aria-selected={opt.value === value}
                    aria-disabled={opt.disabled || undefined}
                    className={cn('hos-combobox__option', active && 'hos-combobox__option--active')}
                    tabIndex={-1}
                    onMouseEnter={() => !opt.disabled && setActiveIndex(index)}
                    onClick={() => pick(opt)}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--hos-space-2)' }}>
                      {opt.value === value ? <Check size={14} strokeWidth={1.5} /> : <span style={{ width: 14 }} />}
                      {opt.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
