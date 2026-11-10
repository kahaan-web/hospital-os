import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Card({ className, children, ...props }: CardProps) {
  return (
    <div className={cn('hos-card', className)} {...props}>
      {children}
    </div>
  );
}

export interface CardHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}

export function CardHeader({ title, description, children, className, ...props }: CardHeaderProps) {
  return (
    <div className={cn('hos-card__header', className)} {...props}>
      {title !== undefined ? (
        <>
          <h3 className="hos-card__title">{title}</h3>
          {description ? <p className="hos-card__desc">{description}</p> : null}
        </>
      ) : (
        children
      )}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('hos-card__body', className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('hos-card__footer', className)} {...props} />;
}
