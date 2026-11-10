'use client';

import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface CheckboxProps {
  checked?: boolean | 'indeterminate';
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean | 'indeterminate') => void;
  disabled?: boolean;
  id?: string;
  label?: ReactNode;
  className?: string;
  name?: string;
  required?: boolean;
}

export function Checkbox({
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  id,
  label,
  className,
  name,
  required,
}: CheckboxProps) {
  return (
    <label className={cn('hos-check', className)} htmlFor={id}>
      <CheckboxPrimitive.Root
        id={id}
        name={name}
        required={required}
        disabled={disabled}
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={onCheckedChange}
        className="hos-check__box hos-focus-visible"
      >
        <CheckboxPrimitive.Indicator>
          <Check size={12} strokeWidth={3} />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      {label ? <span>{label}</span> : null}
    </label>
  );
}
