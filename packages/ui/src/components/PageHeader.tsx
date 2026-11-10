import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, breadcrumbs, className }: PageHeaderProps) {
  return (
    <header className={cn('hos-page-header', className)}>
      {breadcrumbs}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 'var(--hos-space-4)',
        }}
      >
        <div>
          <h1 className="hos-page-header__title">{title}</h1>
          {description ? <p className="hos-page-header__desc">{description}</p> : null}
        </div>
        {actions ? <div style={{ display: 'flex', gap: 'var(--hos-space-2)', flexShrink: 0 }}>{actions}</div> : null}
      </div>
    </header>
  );
}
