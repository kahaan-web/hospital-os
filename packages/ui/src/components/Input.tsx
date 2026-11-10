import type { InputHTMLAttributes } from 'react';
import { forwardRef } from 'react';
import { cn } from '../lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn('hos-input hos-focus-visible', invalid && 'hos-input--error', className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
});
