'use client';

import * as SwitchPrimitive from '@radix-ui/react-switch';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  label?: ReactNode;
  className?: string;
  name?: string;
}

export function Switch({
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  id,
  label,
  className,
  name,
}: SwitchProps) {
  return (
    <label className={cn('hos-check', className)} htmlFor={id}>
      <SwitchPrimitive.Root
        id={id}
        name={name}
        disabled={disabled}
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={onCheckedChange}
        className="hos-switch hos-focus-visible"
      >
        <SwitchPrimitive.Thumb className="hos-switch__thumb" />
      </SwitchPrimitive.Root>
      {label ? <span>{label}</span> : null}
    </label>
  );
}
