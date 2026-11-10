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

export function Field({ label, hint, error, required, htmlFor, className, children }: FieldProps) {
  const autoId = useId();
  const controlId = htmlFor ?? autoId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;

  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  const child =
    isValidElement(children) && !htmlFor
      ? cloneElement(children as ReactElement<Record<string, unknown>>, {
          id: (children.props as { id?: string }).id ?? controlId,
          'aria-describedby': describedBy,
          'aria-invalid': error ? true : undefined,
          invalid: error ? true : undefined,
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
