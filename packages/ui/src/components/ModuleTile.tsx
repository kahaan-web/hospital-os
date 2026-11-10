import type { ModuleAccess } from '@hos/shared';
import { createTranslator } from '@hos/shared';
import type { ReactNode } from 'react';
import { Clock, Lock } from 'lucide-react';
import { cn } from '../lib/cn';
import { Badge } from './Badge';
import { Button } from './Button';

const t = createTranslator('en');

/** @deprecated Use `ModuleAccess` from `@hos/shared` */
export type ModuleTileState = ModuleAccess;

export interface ModuleTileProps {
  title: ReactNode;
  description?: ReactNode;
  state: ModuleAccess;
  icon?: ReactNode;
  ctaLabel?: string;
  onCta?: () => void;
  onOpen?: () => void;
  featureCount?: number;
  /** Replaces the default locked/enabled badge (e.g. add-on order picker). */
  statusBadge?: ReactNode;
  /** With `statusBadge`, renders a toggle CTA with `aria-pressed` instead of open/upgrade buttons. */
  selected?: boolean;
}

export function ModuleTile({
  title,
  description,
  state,
  icon,
  ctaLabel,
  onCta,
  onOpen,
  featureCount,
  statusBadge,
  selected,
}: ModuleTileProps) {
  const selectionPicker = statusBadge !== undefined || selected !== undefined;
  const showCta = selectionPicker ? !!onCta : state === 'locked' || state === 'enabled' || state === 'coming_soon';

  return (
    <article
      className={cn(
        'hos-module-tile',
        state === 'locked' && 'hos-module-tile--locked',
        state === 'coming_soon' && 'hos-module-tile--soon',
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
        {statusBadge !== undefined ? (
          statusBadge
        ) : state === 'locked' ? (
          <Badge tone="warning">
            <Lock size={12} aria-hidden strokeWidth={1.5} /> {t('access.locked')}
          </Badge>
        ) : state === 'coming_soon' ? (
          <Badge tone="neutral">
            <Clock size={12} aria-hidden strokeWidth={1.5} /> {t('access.coming_soon')}
          </Badge>
        ) : state === 'enabled' ? (
          <Badge tone="success">{t('access.enabled')}</Badge>
        ) : null}
      </div>
      {featureCount !== undefined ? (
        <p style={{ margin: 0, fontSize: 'var(--hos-text-xs)', color: 'var(--hos-fg-muted)' }}>
          {featureCount} features in catalogue
        </p>
      ) : null}
      {showCta ? (
        <div style={{ display: 'flex', gap: 'var(--hos-space-2)', flexWrap: 'wrap' }}>
          {selectionPicker ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={onCta}
              aria-pressed={selected === true}
            >
              {ctaLabel ?? t('common.add')}
            </Button>
          ) : state === 'enabled' ? (
            <Button variant="primary" size="sm" onClick={onOpen ?? onCta}>
              {ctaLabel ?? 'Open module'}
            </Button>
          ) : state === 'locked' ? (
            <Button variant="secondary" size="sm" onClick={onCta}>
              {ctaLabel ?? t('common.upgrade')}
            </Button>
          ) : (
            <Button variant="secondary" size="sm" disabled>
              {ctaLabel ?? t('access.coming_soon')}
            </Button>
          )}
        </div>
      ) : null}
    </article>
  );
}
