import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export interface SpinnerProps extends HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

export function Spinner({ size = 'md', label = 'Loading', className, style, ...props }: SpinnerProps) {
  return (
    <>
      <div
        role="status"
        aria-label={label}
        className={cn('hos-spinner', size === 'sm' && 'hos-spinner--sm', className)}
        style={size === 'lg' ? { width: '2rem', height: '2rem', ...style } : style}
        {...props}
      />
      <span className="hos-sr-only">{label}</span>
    </>
  );
}
