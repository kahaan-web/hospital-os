'use client';

import type { ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlatformMe } from '@hos/shared';
import { AdminShell } from '@/components/shell/AdminShell';
import { ApiError } from '@/lib/api';
import { fetchMe, isPlatformMe, signOut } from '@/lib/auth';
import { PageError, PageLoading } from '@/features/common/LoadState';

export function AdminAppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const [me, setMe] = useState<PlatformMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchMe()
      .then((session) => {
        if (!session) {
          router.replace(`/login?admin=1&next=${encodeURIComponent(pathnameRef.current)}`);
          return;
        }
        if (!isPlatformMe(session)) {
          router.replace('/app');
          return;
        }
        setMe(session);
      })
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Session error'))
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onNavigate = useCallback((href: string) => router.push(href), [router]);

  const onSignOut = useCallback(async () => {
    await signOut();
    router.replace('/login?admin=1');
  }, [router]);

  if (loading && !me) return <PageLoading label="Opening App Admin…" />;
  if (error && !me) return <PageError error={error} onRetry={refresh} />;
  if (!me) return null;

  return (
    <AdminShell
      adminName={me.admin.name}
      adminEmail={me.admin.email}
      activePath={pathname}
      onNavigate={onNavigate}
      onSignOut={onSignOut}
    >
      {children}
    </AdminShell>
  );
}
