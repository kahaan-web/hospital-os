import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Badge } from './Badge';
import { PriceDisplay } from './PriceDisplay';

export interface PlanCardProps {
  name: ReactNode;
  description?: ReactNode;
  monthlyPaise?: number;
  annualPaise?: number;
  highlight?: boolean;
  badge?: ReactNode;
  selected?: boolean;
  onSelect?: () => void;
  featureSummary?: ReactNode;
  footer?: ReactNode;
}

export function PlanCard({
  name,
  description,
  monthlyPaise,
  annualPaise,
  highlight,
  badge,
  selected,
  onSelect,
  featureSummary,
  footer,
}: PlanCardProps) {
  return (
    <article
      className={cn(
        'hos-plan-card',
        highlight && 'hos-plan-card--highlight',
        selected && 'hos-plan-card--highlight',
      )}
    >
      {badge ? <div className="hos-plan-card__badge">{typeof badge === 'string' ? <Badge tone="brand">{badge}</Badge> : badge}</div> : null}
      <h3 style={{ margin: 0, fontSize: 'var(--hos-text-xl)' }}>{name}</h3>
      {description ? (
        <p style={{ margin: 'var(--hos-space-2) 0', color: 'var(--hos-fg-secondary)', fontSize: 'var(--hos-text-sm)' }}>
          {description}
        </p>
      ) : null}
      {monthlyPaise !== undefined ? (
        <p style={{ margin: 'var(--hos-space-4) 0 0' }}>
          <PriceDisplay paise={monthlyPaise} />
          <span style={{ color: 'var(--hos-fg-muted)', fontSize: 'var(--hos-text-sm)' }}> / location / month</span>
        </p>
      ) : null}
      {annualPaise !== undefined ? (
        <p style={{ margin: 'var(--hos-space-1) 0 0', fontSize: 'var(--hos-text-sm)', color: 'var(--hos-fg-muted)' }}>
          or <PriceDisplay paise={annualPaise} /> annually
        </p>
      ) : null}
      {featureSummary ? <div style={{ marginTop: 'var(--hos-space-4)' }}>{featureSummary}</div> : null}
      {onSelect ? (
        <button
          type="button"
          className="hos-btn hos-btn--primary hos-btn--md hos-focus-visible"
          style={{ marginTop: 'var(--hos-space-5)', width: '100%' }}
          onClick={onSelect}
          aria-pressed={selected}
        >
          {selected ? 'Selected' : 'Choose plan'}
        </button>
      ) : null}
      {footer}
    </article>
  );
}
