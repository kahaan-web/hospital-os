import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('hos-empty', className)}>
      {icon ? <div className="hos-empty__icon">{icon}</div> : null}
      <h3 className="hos-empty__title">{title}</h3>
      {description ? <p className="hos-empty__desc">{description}</p> : null}
      {action}
    </div>
  );
}
