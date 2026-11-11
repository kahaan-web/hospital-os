import type { ReactNode } from 'react';
import { BillingNav } from '@/features/clinical/billing/BillingNav';

export default function BillingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <BillingNav />
      {children}
    </>
  );
}
