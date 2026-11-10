import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  trend?: ReactNode;
  className?: string;
}

export function StatCard({ label, value, hint, trend, className }: StatCardProps) {
  return (
    <article className={cn('hos-stat-card', className)}>
      <p className="hos-stat-card__label">{label}</p>
      <p className="hos-stat-card__value">{value}</p>
      {hint ? (
        <p style={{ margin: 'var(--hos-space-1) 0 0', fontSize: 'var(--hos-text-sm)', color: 'var(--hos-fg-muted)' }}>
          {hint}
        </p>
      ) : null}
      {trend}
    </article>
  );
}
