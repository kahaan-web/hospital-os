import type { ReactElement, ReactNode } from 'react';
import { cloneElement, isValidElement, useId } from 'react';
import { cn } from '../lib/cn';

export interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}

function mergeDescribedBy(existing: string | undefined, next: string | undefined): string | undefined {
  if (!next) return existing;
  if (!existing) return next;
  const parts = new Set([...existing.split(/\s+/).filter(Boolean), ...next.split(/\s+/).filter(Boolean)]);
  return [...parts].join(' ');
}

export function Field({ label, hint, error, required, htmlFor, className, children }: FieldProps) {
  const autoId = useId();
  const controlId = htmlFor ?? autoId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;

  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  const child =
    isValidElement(children)
      ? cloneElement(children as ReactElement<Record<string, unknown>>, {
          id: (children.props as { id?: string }).id ?? controlId,
          'aria-describedby': mergeDescribedBy(
            (children.props as { 'aria-describedby'?: string })['aria-describedby'],
            describedBy,
          ),
          'aria-invalid': error ? true : (children.props as { 'aria-invalid'?: boolean })['aria-invalid'],
          invalid: error ? true : (children.props as { invalid?: boolean }).invalid,
        } as Record<string, unknown>)
      : children;

  return (
    <div className={cn('hos-field', className)}>
      {label ? (
        <label className="hos-field__label" htmlFor={controlId}>
          {label}
          {required ? (
            <>
              <span className="hos-sr-only"> (required)</span>
              <span aria-hidden="true" style={{ color: 'var(--hos-status-error-fg)' }}>
                {' '}
                *
              </span>
            </>
          ) : null}
        </label>
      ) : null}
      {child}
      {hint && !error ? (
        <p className="hos-field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="hos-field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
