import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface PrintLayoutProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export function PrintLayout({ title, children, footer, className, ...props }: PrintLayoutProps) {
  return (
    <div className={cn('hos-print', className)} {...props}>
      {title ? (
        <header style={{ marginBottom: '1.25rem', borderBottom: '1px solid #ccc', paddingBottom: '0.75rem' }}>
          <h1 style={{ margin: 0, fontSize: '1.25rem' }}>{title}</h1>
        </header>
      ) : null}
      <div>{children}</div>
      {footer ? (
        <footer style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: '#444' }}>{footer}</footer>
      ) : null}
    </div>
  );
}
