import { formatINR } from '@hos/shared';
import { cn } from '../lib/cn';

export interface PriceDisplayProps {
  paise: number;
  decimals?: 'auto' | 'always' | 'never';
  className?: string;
  suffix?: string;
}

export function PriceDisplay({ paise, decimals = 'auto', className, suffix }: PriceDisplayProps) {
  return (
    <span className={cn('hos-price', className)}>
      {formatINR(paise, { decimals })}
      {suffix ? <span style={{ fontWeight: 400, color: 'var(--hos-fg-muted)' }}> {suffix}</span> : null}
    </span>
  );
}
