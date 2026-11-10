'use client';

import type { ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { TenantMe } from '@hos/shared';
import { TenantShell } from '@/components/shell/TenantShell';
import { ApiError } from '@/lib/api';
import { fetchMe, isTenantMe, signOut, switchLocation } from '@/lib/auth';
import { routeForApiStep } from '@/lib/onboarding-steps';
import { PageError, PageLoading } from '@/features/common/LoadState';

export function TenantAppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<TenantMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchMe()
      .then((session) => {
        if (!session) {
          router.replace(`/login?next=${encodeURIComponent(pathname)}`);
          return;
        }
        if (!isTenantMe(session)) {
          router.replace('/admin');
          return;
        }
        if (session.tenant.status === 'onboarding') {
          router.replace(routeForApiStep(session.tenant.onboardingStep, false));
          return;
        }
        setMe(session);
      })
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Session error'))
      .finally(() => setLoading(false));
  }, [router, pathname]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onNavigate = useCallback(
    (href: string) => {
      router.push(href);
    },
    [router],
  );

  const onSignOut = useCallback(async () => {
    await signOut();
    router.replace('/login');
  }, [router]);

  const onLocationChange = useCallback(
    async (locationId: string) => {
      try {
        const next = await switchLocation(locationId);
        setMe(next);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Could not switch location');
      }
    },
    [],
  );

  if (loading) return <PageLoading label="Opening your hospital workspace…" />;
  if (error) return <PageError error={error} onRetry={refresh} />;
  if (!me) return null;

  return (
    <TenantShell
      modules={me.modules}
      locations={me.locations}
      currentLocationId={me.currentLocationId}
      onLocationChange={onLocationChange}
      userName={me.user.name}
      userEmail={me.user.email}
      tenantDisplayName={me.tenant.displayName || me.tenant.legalName || 'Hospital OS'}
      activePath={pathname}
      onNavigate={onNavigate}
      onSignOut={onSignOut}
      onModuleUpgrade={(mod) => router.push(`/app/settings/billing?module=${mod.key}`)}
    >
      {children}
    </TenantShell>
  );
}
