'use client';

import { Button, Stepper, type StepperStep } from '@hos/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { wt } from '@/i18n';
import { WIZARD_ROUTES, wizardBackHref } from '@/lib/onboarding-steps';

export function OnboardingWizardShell({
  currentHref,
  children,
}: {
  currentHref: string;
  children: ReactNode;
}) {
  const steps: StepperStep[] = WIZARD_ROUTES.map((s) => ({
    id: s.href,
    label: s.label,
  }));
  const current = WIZARD_ROUTES.find((s) => s.href === currentHref)?.href ?? currentHref;
  const backHref = wizardBackHref(currentHref);
  const router = useRouter();

  return (
    <div className="hos-wizard-shell" style={{ minHeight: '100vh', background: 'var(--hos-bg-canvas)' }}>
      <header
        className="hos-wizard-header"
        style={{
          borderBottom: '1px solid var(--hos-border)',
          background: 'var(--hos-bg-surface)',
          padding: 'var(--hos-space-3) var(--hos-page-pad)',
        }}
      >
        <div
          style={{
            maxWidth: '72rem',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--hos-space-4)',
            flexWrap: 'wrap',
          }}
        >
          <Link
            href="/"
            style={{
              fontWeight: 600,
              fontSize: 'var(--hos-text-base)',
              color: 'var(--hos-fg)',
              textDecoration: 'none',
            }}
          >
            {wt('app.name')}
          </Link>
          <p style={{ margin: 0, fontSize: 'var(--hos-text-sm)', color: 'var(--hos-fg-muted)' }}>{wt('wizard.shellTitle')}</p>
        </div>
      </header>
      <main style={{ maxWidth: '72rem', margin: '0 auto', padding: 'var(--hos-page-pad)' }}>
        <div className="hos-wizard-stepper" style={{ marginBottom: 'var(--hos-space-6)', overflowX: 'auto' }}>
          <Stepper steps={steps} currentStepId={current} orientation="horizontal" />
        </div>
        {backHref ? (
          <div className="hos-wizard-back" style={{ marginBottom: 'var(--hos-space-4)' }}>
            <Button type="button" variant="secondary" size="sm" onClick={() => router.push(backHref)}>
              {wt('wizard.back')}
            </Button>
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}
