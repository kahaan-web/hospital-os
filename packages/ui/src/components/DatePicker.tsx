'use client';

import * as Popover from '@radix-ui/react-popover';
import { Calendar } from 'lucide-react';
import { useMemo, useState } from 'react';
import { isoToDDMMYYYY, parseDDMMYYYY } from '@hos/shared';
import { cn } from '../lib/cn';
import { Input } from './Input';

export interface DatePickerProps {
  value?: string;
  onChange?: (isoDate: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
  id?: string;
  'aria-label'?: string;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function isoParts(iso: string | undefined): { y: number; m: number; d: number } | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'DD/MM/YYYY',
  disabled,
  min,
  max,
  id,
  'aria-label': ariaLabel,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => isoToDDMMYYYY(value));
  const initial = isoParts(value) ?? isoParts(new Date().toISOString().slice(0, 10))!;
  const [view, setView] = useState({ y: initial.y, m: initial.m });

  const days = useMemo(() => {
    const first = new Date(Date.UTC(view.y, view.m - 1, 1));
    const startPad = first.getUTCDay();
    const dim = new Date(Date.UTC(view.y, view.m, 0)).getUTCDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= dim; d++) cells.push(d);
    return cells;
  }, [view]);

  const displayText = value ? isoToDDMMYYYY(value) : text;

  const pick = (day: number) => {
    const iso = `${view.y}-${String(view.m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (min && iso < min) return;
    if (max && iso > max) return;
    onChange?.(iso);
    setText(isoToDDMMYYYY(iso));
    setOpen(false);
  };

  const onBlurText = () => {
    const parsed = parseDDMMYYYY(text);
    if (parsed) {
      onChange?.(parsed);
      setText(isoToDDMMYYYY(parsed));
    } else if (!text.trim()) {
      onChange?.(null);
    } else {
      setText(isoToDDMMYYYY(value));
    }
  };

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div style={{ display: 'flex', gap: 'var(--hos-space-2)' }}>
        <Input
          id={id}
          value={displayText}
          onChange={(e) => setText(e.target.value)}
          onBlur={onBlurText}
          placeholder={placeholder}
          disabled={disabled}
          aria-label={ariaLabel ?? 'Date'}
          inputMode="numeric"
        />
        <Popover.Trigger asChild>
          <button
            type="button"
            className="hos-icon-btn hos-icon-btn--md hos-focus-visible"
            disabled={disabled}
            aria-label="Open calendar"
          >
            <Calendar size={18} />
          </button>
        </Popover.Trigger>
      </div>
      <Popover.Portal>
        <Popover.Content className="hos-card" sideOffset={4} style={{ padding: 'var(--hos-space-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--hos-space-2)' }}>
            <button
              type="button"
              className="hos-btn hos-btn--ghost hos-btn--sm"
              onClick={() =>
                setView((v) => (v.m === 1 ? { y: v.y - 1, m: 12 } : { y: v.y, m: v.m - 1 }))
              }
            >
              ‹
            </button>
            <span style={{ fontWeight: 600 }}>
              {new Date(Date.UTC(view.y, view.m - 1, 1)).toLocaleString('en-IN', {
                month: 'long',
                year: 'numeric',
                timeZone: 'UTC',
              })}
            </span>
            <button
              type="button"
              className="hos-btn hos-btn--ghost hos-btn--sm"
              onClick={() =>
                setView((v) => (v.m === 12 ? { y: v.y + 1, m: 1 } : { y: v.y, m: v.m + 1 }))
              }
            >
              ›
            </button>
          </div>
          <div className="hos-date-picker__calendar" role="grid" aria-label="Choose date">
            {WEEKDAYS.map((w) => (
              <div key={w} role="columnheader" style={{ fontSize: 'var(--hos-text-xs)', textAlign: 'center', color: 'var(--hos-fg-muted)' }}>
                {w}
              </div>
            ))}
            {days.map((day, i) =>
              day === null ? (
                <span key={`e-${i}`} />
              ) : (
                <button
                  key={day}
                  type="button"
                  role="gridcell"
                  className={cn(
                    'hos-date-picker__day hos-focus-visible',
                    value ===
                      `${view.y}-${String(view.m).padStart(2, '0')}-${String(day).padStart(2, '0')}` &&
                      'hos-date-picker__day--selected',
                    todayIso ===
                      `${view.y}-${String(view.m).padStart(2, '0')}-${String(day).padStart(2, '0')}` &&
                      'hos-date-picker__day--today',
                  )}
                  onClick={() => pick(day)}
                >
                  {day}
                </button>
              ),
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
