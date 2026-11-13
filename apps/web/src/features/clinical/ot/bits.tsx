import type { ReactNode } from 'react';

export function InlineNote({ tone = 'error', children }: { tone?: 'error' | 'muted' | 'info'; children: ReactNode }) {
  if (children == null || children === '') return null;
  const color = tone === 'error' ? 'var(--hos-status-error-fg)' : tone === 'info' ? 'var(--hos-status-info-fg)' : 'var(--hos-fg-secondary)';
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} style={{ color, fontSize: 'var(--hos-text-sm)', margin: 'var(--hos-space-2) 0' }}>
      {children}
    </p>
  );
}

export function Panel({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section
      style={{
        border: '1px solid var(--hos-border-default)',
        borderRadius: 'var(--hos-radius-lg)',
        background: 'var(--hos-bg-elevated)',
        padding: 'var(--hos-space-4)',
        minWidth: 0,
      }}
    >
      {title ? (
        <h2 style={{ fontSize: 'var(--hos-text-xl)', fontWeight: 600, lineHeight: 'var(--hos-leading-normal)', margin: '0 0 var(--hos-space-3)' }}>{title}</h2>
      ) : null}
      {children}
    </section>
  );
}

export function FieldGrid({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--hos-space-3)', alignItems: 'start' }}>{children}</div>
  );
}
