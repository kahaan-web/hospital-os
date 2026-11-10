'use client';

import type { OnboardingState } from '@hos/shared';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import { fetchMe, isTenantMe } from '@/lib/auth';
import { routeForApiStep } from '@/lib/onboarding-steps';
import { PageError, PageLoading } from '@/features/common/LoadState';

export function OnboardingGate({
  children,
  allowedHrefs,
}: {
  children: (state: OnboardingState) => ReactNode;
  allowedHrefs: string[];
}) {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const me = await fetchMe();
      if (!me) {
        router.replace('/onboarding/signup');
        return;
      }
      if (!isTenantMe(me)) {
        router.replace('/admin');
        return;
      }
      if (me.tenant.status === 'active') {
        router.replace('/app');
        return;
      }
      const onboarding = await apiGet<OnboardingState>('/onboarding');
      setState(onboarding);
      const resume = routeForApiStep(onboarding.step, onboarding.paid);
      if (!allowedHrefs.includes(resume) && !allowedHrefs.some((h) => resume === h)) {
        const onAllowedStep = allowedHrefs.some((href) => {
          const stepRoute = routeForApiStep(onboarding.step, onboarding.paid);
          return href === stepRoute;
        });
        if (!onAllowedStep) {
          router.replace(routeForApiStep(onboarding.step, onboarding.paid));
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load onboarding');
    } finally {
      setLoading(false);
    }
  }, [allowedHrefs, router]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <PageLoading label="Loading your setup progress…" />;
  if (error) return <PageError error={error} onRetry={load} />;
  if (!state) return null;
  return <>{children(state)}</>;
}
