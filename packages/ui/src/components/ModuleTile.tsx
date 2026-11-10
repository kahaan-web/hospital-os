import type { ReactNode } from 'react';
import { Lock, Sparkles } from 'lucide-react';
import { cn } from '../lib/cn';
import { Badge } from './Badge';
import { Button } from './Button';

export type ModuleTileState = 'enabled' | 'locked' | 'coming-soon';

export interface ModuleTileProps {
  title: ReactNode;
  description?: ReactNode;
  state: ModuleTileState;
  icon?: ReactNode;
  ctaLabel?: string;
  onCta?: () => void;
  featureCount?: number;
}

export function ModuleTile({
  title,
  description,
  state,
  icon,
  ctaLabel,
  onCta,
  featureCount,
}: ModuleTileProps) {
  return (
    <article
      className={cn(
        'hos-module-tile',
        state === 'locked' && 'hos-module-tile--locked',
        state === 'coming-soon' && 'hos-module-tile--soon',
      )}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--hos-space-2)' }}>
        <div style={{ display: 'flex', gap: 'var(--hos-space-3)', alignItems: 'flex-start' }}>
          {icon}
          <div>
            <h4 style={{ margin: 0, fontSize: 'var(--hos-text-base)' }}>{title}</h4>
            {description ? (
              <p style={{ margin: 'var(--hos-space-1) 0 0', fontSize: 'var(--hos-text-sm)', color: 'var(--hos-fg-secondary)' }}>
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {state === 'locked' ? (
          <Badge tone="warning">
            <Lock size={12} aria-hidden /> Locked
          </Badge>
        ) : state === 'coming-soon' ? (
          <Badge tone="neutral">
            <Sparkles size={12} aria-hidden /> Coming soon
          </Badge>
        ) : (
          <Badge tone="success">Included</Badge>
        )}
      </div>
      {featureCount !== undefined ? (
        <p style={{ margin: 0, fontSize: 'var(--hos-text-xs)', color: 'var(--hos-fg-muted)' }}>
          {featureCount} features in catalogue
        </p>
      ) : null}
      {state === 'locked' && onCta ? (
        <Button variant="secondary" size="sm" onClick={onCta}>
          {ctaLabel ?? 'Upgrade to unlock'}
        </Button>
      ) : null}
      {state === 'coming-soon' ? (
        <p style={{ margin: 0, fontSize: 'var(--hos-text-sm)', color: 'var(--hos-fg-muted)' }}>
          Configurable when released by App Admin.
        </p>
      ) : null}
    </article>
  );
}
