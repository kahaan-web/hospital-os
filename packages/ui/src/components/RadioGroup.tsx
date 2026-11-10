'use client';

import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface RadioOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  options: RadioOption[];
  name?: string;
  className?: string;
  'aria-label'?: string;
}

export function RadioGroup({
  value,
  defaultValue,
  onValueChange,
  options,
  name,
  className,
  'aria-label': ariaLabel,
}: RadioGroupProps) {
  return (
    <RadioGroupPrimitive.Root
      className={cn('hos-radio-group', className)}
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      name={name}
      aria-label={ariaLabel}
    >
      {options.map((opt) => (
        <label key={opt.value} className="hos-radio">
          <RadioGroupPrimitive.Item
            value={opt.value}
            disabled={opt.disabled}
            className="hos-radio__item hos-focus-visible"
          >
            <RadioGroupPrimitive.Indicator className="hos-radio__indicator" />
          </RadioGroupPrimitive.Item>
          <span>{opt.label}</span>
        </label>
      ))}
    </RadioGroupPrimitive.Root>
  );
}
