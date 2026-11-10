'use client';

import { Button, EmptyState, Skeleton, Spinner } from '@hos/ui';
import type { ReactNode } from 'react';
import { ApiError } from '@/lib/api';

export function PageLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--hos-space-3)', padding: 'var(--hos-space-6) 0' }}>
      <Spinner aria-label={label} />
      <span style={{ color: 'var(--hos-fg-muted)', fontSize: 'var(--hos-text-sm)' }}>{label}</span>
    </div>
  );
}

export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hos-space-3)', maxWidth: '48rem' }}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} style={{ height: '2.5rem', width: i === 0 ? '60%' : '100%' }} />
      ))}
    </div>
  );
}

export function PageError({
  error,
  onRetry,
  title = 'Could not load this page',
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  const message =
    error instanceof ApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : 'Something went wrong';
  const fields = error instanceof ApiError ? error.fields : undefined;
  return (
    <div>
      <EmptyState
        title={title}
        description={
          <>
            {message}
            {fields && Object.keys(fields).length > 0 ? (
              <ul style={{ margin: 'var(--hos-space-3) 0 0', paddingLeft: '1.25rem', textAlign: 'left' }}>
                {Object.entries(fields).map(([k, v]) => (
                  <li key={k} style={{ fontSize: 'var(--hos-text-sm)' }}>
                    {k}: {v}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        }
        action={
          onRetry ? (
            <Button type="button" onClick={onRetry}>
              Try again
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}

export function PageFrame({ children, maxWidth = '56rem' }: { children: ReactNode; maxWidth?: string }) {
  return <div style={{ maxWidth, width: '100%' }}>{children}</div>;
}
