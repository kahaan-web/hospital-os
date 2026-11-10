'use client';

import type { ProvisioningResult } from '@hos/shared';
import { Button, PageHeader, Spinner, useToast } from '@hos/ui';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { OnboardingGate } from '@/features/onboarding/OnboardingGate';
import { OnboardingWizardShell } from '@/features/onboarding/OnboardingWizardShell';
import { ApiError, apiPost } from '@/lib/api';

export default function ProvisioningPage() {
  const router = useRouter();
  const { toast: showToast } = useToast();
  const [result, setResult] = useState<ProvisioningResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const provisionKeyRef = useRef(crypto.randomUUID());
  const startedRef = useRef(false);

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost<ProvisioningResult>('/onboarding/provision', undefined, provisionKeyRef.current);
      setResult(res);
      showToast({ tone: 'success', title: 'Tenant provisioned' });
      window.setTimeout(() => router.replace('/app'), 2000);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Provisioning failed');
    } finally {
      setBusy(false);
    }
  }, [router, showToast]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void run();
  }, [run]);

  return (
    <OnboardingWizardShell currentHref="/onboarding/provisioning">
      <OnboardingGate
        allowedHrefs={['/onboarding/provisioning', '/onboarding/invoice']}
        currentHref="/onboarding/provisioning"
      >
        {() => (
          <>
            <PageHeader title="Provisioning" description="Creating tenant, locations, roles and sample masters." />
            {busy && !result ? (
              <ProvisioningLoad>
                <Spinner aria-label="Provisioning" />
                <span>Setting up your hospital workspace…</span>
              </ProvisioningLoad>
            ) : null}
            {error ? (
              <div>
                <p style={{ color: 'var(--hos-fg-danger)' }}>{error}</p>
                <Button type="button" onClick={run}>
                  Retry
                </Button>
              </div>
            ) : null}
            {result ? (
              <ul style={{ paddingLeft: '1.25rem', fontSize: 'var(--hos-text-sm)' }}>
                {result.steps.map((s) => (
                  <li key={s.key}>
                    <strong>{s.label}</strong> — {s.detail}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </OnboardingGate>
    </OnboardingWizardShell>
  );
}

function ProvisioningLoad({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--hos-space-3)' }}>{children}</div>
  );
}
