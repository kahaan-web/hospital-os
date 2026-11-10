'use client';

import type { Catalog, CatalogPlan } from '@hos/shared';
import { Button, PageHeader, PlanCard, Spinner } from '@hos/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import { formatINR } from '@/lib/format';

export default function HomePage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Catalog>('/catalog')
      .then(setCatalog)
      .catch(() => setError('Plans could not be loaded. You can still start setup.'));
  }, []);

  const plans = catalog?.plans.filter((p) => p.status === 'active').sort((a, b) => a.sortOrder - b.sortOrder) ?? [];

  return (
    <NetworkFrame>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--hos-space-4)' }}>
        <strong style={{ fontSize: 'var(--hos-text-lg)' }}>Hospital OS</strong>
        <Link href="/login" style={{ fontSize: 'var(--hos-text-sm)', color: 'var(--hos-fg-muted)' }}>
          Sign in
        </Link>
      </header>

      <PageHeader
        title="HMIS for small hospitals and nursing homes"
        description="Self-onboard in one sitting: pick a tier, pay a sample invoice, and open OPD-ready modules. Prices below are sample values set by your platform admin."
      />

      <div style={{ marginTop: 'var(--hos-space-6)' }}>
        {error ? <p style={{ color: 'var(--hos-fg-muted)', fontSize: 'var(--hos-text-sm)' }}>{error}</p> : null}
        {!catalog && !error ? (
          <div style={{ display: 'flex', gap: 'var(--hos-space-3)', alignItems: 'center' }}>
            <Spinner aria-label="Loading plans" />
            <span>Loading live plan comparison…</span>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))',
              gap: 'var(--hos-space-4)',
            }}
          >
            {plans.map((plan) => (
              <PlanCompareCard key={plan.id} plan={plan} featureCount={plan.featureCount} matrix={catalog?.matrix[plan.id]?.length} />
            ))}
          </div>
        )}
      </div>

      <ActionRow>
        <Button asChild>
          <Link href="/onboarding/signup">Start setup</Link>
        </Button>
        <Button variant="secondary" asChild>
          <Link href="/login?admin=1">App Admin sign in</Link>
        </Button>
      </ActionRow>

      <p style={{ marginTop: 'var(--hos-space-8)', fontSize: 'var(--hos-text-sm)', color: 'var(--hos-fg-muted)' }}>
        Mock billing only · No real patient data · India GST-ready invoices
      </p>
    </NetworkFrame>
  );
}

function PlanCompareCard({
  plan,
  featureCount,
  matrix,
}: {
  plan: CatalogPlan;
  featureCount: number;
  matrix?: number;
}) {
  const count = matrix ?? featureCount;
  return (
    <PlanCard
      name={plan.name}
      description={plan.tagline || plan.description}
      monthlyPaise={plan.monthlyPaise}
      annualPaise={plan.annualPaise}
      highlight={plan.highlight}
      badge={plan.badge || (plan.pricePlaceholder ? 'Sample price' : undefined)}
      featureSummary={`${count} entitlements included`}
      footer={
        <span style={{ fontSize: 'var(--hos-text-xs)', color: 'var(--hos-fg-muted)' }}>
          {formatINR(plan.monthlyPaise)}/location/month
        </span>
      }
    />
  );
}

function NetworkFrame({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--hos-bg-canvas)',
        padding: 'var(--hos-page-pad)',
      }}
    >
      <div style={{ maxWidth: '56rem', margin: '0 auto' }}>{children}</div>
    </main>
  );
}

function ActionRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 'var(--hos-space-6)', display: 'flex', gap: 'var(--hos-space-3)', flexWrap: 'wrap' }}>
      {children}
    </div>
  );
}
