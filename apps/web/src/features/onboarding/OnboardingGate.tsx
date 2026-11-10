'use client';

import type { OnboardingState } from '@hos/shared';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet } from '@/lib/api';
import { fetchMe, isTenantMe } from '@/lib/auth';
import { routeForApiStep, wizardHrefIndex } from '@/lib/onboarding-steps';
import { PageError, PageLoading } from '@/features/common/LoadState';

export function OnboardingGate({
  children,
  allowedHrefs,
  currentHref,
}: {
  children: (state: OnboardingState) => ReactNode;
  allowedHrefs: string[];
  currentHref: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  const allowedKey = allowedHrefs.join('|');

  const load = useCallback(async () => {
    const firstPaint = !hasLoadedRef.current;
    if (firstPaint) setLoading(true);
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
      const resume = routeForApiStep(onboarding.step, onboarding.paid);
      const resumeIdx = wizardHrefIndex(resume);
      const currentIdx = wizardHrefIndex(currentHref);
      if (currentIdx > resumeIdx) {
        router.replace(resume);
        return;
      }
      setState(onboarding);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load onboarding');
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, [allowedKey, currentHref, router]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !state) return <PageLoading label="Loading your setup progress…" />;
  if (error) return <PageError error={error} onRetry={load} />;
  if (!state) return null;
  return <>{children(state)}</>;
}
