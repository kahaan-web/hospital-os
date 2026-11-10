import type { ReactNode } from 'react';
import { TenantAppLayout } from '@/components/TenantAppLayout';

export default function AppLayout({ children }: { children: ReactNode }) {
  return <TenantAppLayout>{children}</TenantAppLayout>;
}
