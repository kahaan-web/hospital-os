'use client';

import { formatINR, rupeesToPaise } from '@hos/shared';
import type { InputHTMLAttributes } from 'react';
import { forwardRef, useEffect, useState } from 'react';
import { cn } from '../lib/cn';
import { Input } from './Input';

export interface MoneyInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  valuePaise: number | null;
  onChangePaise: (paise: number | null) => void;
  invalid?: boolean;
}

function parseRupeeInput(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.]/g, '');
  if (!cleaned) return null;
  const num = Number(cleaned);
  if (Number.isNaN(num)) return null;
  return rupeesToPaise(num);
}

export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { valuePaise, onChangePaise, invalid, className, disabled, ...props },
  ref,
) {
  const [text, setText] = useState(() =>
    valuePaise === null ? '' : String(valuePaise / 100),
  );

  useEffect(() => {
    setText(valuePaise === null ? '' : String(valuePaise / 100));
  }, [valuePaise]);

  return (
    <div className={cn('hos-money-input', className)}>
      <span className="hos-money-input__prefix" aria-hidden>
        ₹
      </span>
      <Input
        ref={ref}
        inputMode="decimal"
        disabled={disabled}
        invalid={invalid}
        value={text}
        onChange={(e) => {
          const next = e.target.value.replace(/[^\d.]/g, '');
          setText(next);
          onChangePaise(parseRupeeInput(next));
        }}
        aria-label={props['aria-label'] ?? 'Amount in rupees'}
        {...props}
      />
      {valuePaise !== null ? (
        <span className="hos-sr-only">{formatINR(valuePaise)}</span>
      ) : null}
    </div>
  );
});
