import type { ReactNode } from 'react';
import { AdminAppLayout } from '@/components/AdminAppLayout';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminAppLayout>{children}</AdminAppLayout>;
}
