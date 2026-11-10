'use client';

import { Stepper, type StepperStep } from '@hos/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { WIZARD_ROUTES } from '@/lib/onboarding-steps';

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

  return (
    <div style={{ minHeight: '100vh', background: 'var(--hos-bg-canvas)' }}>
      <header
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
            Hospital OS
          </Link>
          <p style={{ margin: 0, fontSize: 'var(--hos-text-sm)', color: 'var(--hos-fg-muted)' }}>Setup wizard</p>
        </div>
      </header>
      <main style={{ maxWidth: '72rem', margin: '0 auto', padding: 'var(--hos-page-pad)' }}>
        <div style={{ marginBottom: 'var(--hos-space-6)', overflowX: 'auto' }}>
          <Stepper steps={steps} currentStepId={current} orientation="horizontal" />
        </div>
        {children}
      </main>
    </div>
  );
}
