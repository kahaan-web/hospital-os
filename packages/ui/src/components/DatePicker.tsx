'use client';

import * as Popover from '@radix-ui/react-popover';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  invalid?: boolean;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const IST_OFFSET_MS = 330 * 60 * 1000;

function istTodayIso(): string {
  const d = new Date(Date.now() + IST_OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isoParts(iso: string | undefined): { y: number; m: number; d: number } | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function dayIso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function inRange(iso: string, min?: string, max?: string): boolean {
  if (min && iso < min) return false;
  if (max && iso > max) return false;
  return true;
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
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  invalid,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(() => isoToDDMMYYYY(value));
  const initial = isoParts(value) ?? isoParts(istTodayIso())!;
  const [view, setView] = useState({ y: initial.y, m: initial.m });
  const todayIso = istTodayIso();

  useEffect(() => {
    if (!editing) {
      setText(isoToDDMMYYYY(value));
    }
  }, [value, editing]);

  useEffect(() => {
    const p = isoParts(value);
    if (p) setView({ y: p.y, m: p.m });
  }, [value]);

  const days = useMemo(() => {
    const first = new Date(Date.UTC(view.y, view.m - 1, 1));
    const startPad = first.getUTCDay();
    const dim = new Date(Date.UTC(view.y, view.m, 0)).getUTCDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= dim; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [view]);

  const rows = useMemo(() => {
    const out: (number | null)[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      out.push(days.slice(i, i + 7));
    }
    return out;
  }, [days]);

  const displayText = editing ? text : value ? isoToDDMMYYYY(value) : text;

  const pick = useCallback(
    (day: number) => {
      const iso = dayIso(view.y, view.m, day);
      if (!inRange(iso, min, max)) return;
      onChange?.(iso);
      setText(isoToDDMMYYYY(iso));
      setEditing(false);
      setOpen(false);
    },
    [view, min, max, onChange],
  );

  const onBlurText = () => {
    setEditing(false);
    const parsed = parseDDMMYYYY(text);
    if (parsed) {
      if (!inRange(parsed, min, max)) {
        setText(isoToDDMMYYYY(value));
        return;
      }
      onChange?.(parsed);
      setText(isoToDDMMYYYY(parsed));
    } else if (!text.trim()) {
      onChange?.(null);
    } else {
      setText(isoToDDMMYYYY(value));
    }
  };

  const monthLabel = new Date(Date.UTC(view.y, view.m - 1, 1)).toLocaleString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div style={{ display: 'flex', gap: 'var(--hos-space-2)' }}>
        <Input
          id={id}
          value={displayText}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setEditing(true)}
          onBlur={onBlurText}
          placeholder={placeholder}
          disabled={disabled}
          aria-label={ariaLabel ?? 'Date'}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid ?? invalid ?? undefined}
          invalid={invalid}
          inputMode="numeric"
        />
        <Popover.Trigger asChild>
          <button
            type="button"
            className="hos-icon-btn hos-icon-btn--md hos-focus-visible"
            disabled={disabled}
            aria-label="Open calendar"
          >
            <Calendar size={18} strokeWidth={1.5} />
          </button>
        </Popover.Trigger>
      </div>
      <Popover.Portal>
        <Popover.Content className="hos-card" sideOffset={4} style={{ padding: 'var(--hos-space-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--hos-space-2)' }}>
            <button
              type="button"
              className="hos-btn hos-btn--ghost hos-btn--sm"
              aria-label="Previous month"
              onClick={() =>
                setView((v) => (v.m === 1 ? { y: v.y - 1, m: 12 } : { y: v.y, m: v.m - 1 }))
              }
            >
              <ChevronLeft size={16} strokeWidth={1.5} aria-hidden />
            </button>
            <span style={{ fontWeight: 600 }}>{monthLabel}</span>
            <button
              type="button"
              className="hos-btn hos-btn--ghost hos-btn--sm"
              aria-label="Next month"
              onClick={() =>
                setView((v) => (v.m === 12 ? { y: v.y + 1, m: 1 } : { y: v.y, m: v.m + 1 }))
              }
            >
              <ChevronRight size={16} strokeWidth={1.5} aria-hidden />
            </button>
          </div>
          <div className="hos-date-picker__calendar" role="grid" aria-label="Choose date">
            <div role="row" style={{ display: 'contents' }}>
              {WEEKDAYS.map((w) => (
                <div
                  key={w}
                  role="columnheader"
                  style={{ fontSize: 'var(--hos-text-xs)', textAlign: 'center', color: 'var(--hos-fg-muted)' }}
                >
                  {w}
                </div>
              ))}
            </div>
            {rows.map((row, ri) => (
              <div key={`row-${ri}`} role="row" style={{ display: 'contents' }}>
                {row.map((day, ci) =>
                  day === null ? (
                    <span key={`e-${ri}-${ci}`} role="gridcell" aria-disabled="true" />
                  ) : (
                    (() => {
                      const iso = dayIso(view.y, view.m, day);
                      const disabledDay = !inRange(iso, min, max);
                      return (
                        <button
                          key={day}
                          type="button"
                          role="gridcell"
                          disabled={disabledDay}
                          className={cn(
                            'hos-date-picker__day hos-focus-visible',
                            value === iso && 'hos-date-picker__day--selected',
                            todayIso === iso && 'hos-date-picker__day--today',
                            disabledDay && 'hos-date-picker__day--disabled',
                          )}
                          onClick={() => pick(day)}
                          aria-label={isoToDDMMYYYY(iso)}
                          tabIndex={value === iso ? 0 : -1}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              pick(day);
                            }
                          }}
                        >
                          {day}
                        </button>
                      );
                    })()
                  ),
                )}
              </div>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
