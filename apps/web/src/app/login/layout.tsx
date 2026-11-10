import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { PageLoading } from '@/features/common/LoadState';

export default function LoginLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageLoading label="Loading sign-in…" />}>{children}</Suspense>;
}
