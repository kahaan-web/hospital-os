'use client';

import { Button, EmptyState, ModuleTile, PageHeader } from '@hos/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { TenantMe } from '@hos/shared';
import { fetchMe, isTenantMe } from '@/lib/auth';

export default function ModuleDetailPage() {
  const params = useParams();
  const key = String(params.key);
  const [me, setMe] = useState<TenantMe | null>(null);

  useEffect(() => {
    fetchMe().then((s) => {
      if (s && isTenantMe(s)) setMe(s);
    });
  }, []);

  const mod = me?.modules.find((m) => m.key === key);

  if (!mod) {
    return <EmptyState title="Module not found" description="This module is not in your catalogue." />;
  }

  if (mod.access !== 'enabled') {
    return (
      <>
        <PageHeader title={mod.name} description={mod.description} />
        <ModuleTile
          title={mod.name}
          state={mod.access}
          description={`This module is ${mod.access === 'coming_soon' ? 'coming soon' : 'not on your plan'}.`}
          ctaLabel={mod.addonPurchasable ? 'Buy add-on' : 'Change plan'}
          onCta={() => window.location.assign(`/app/settings/billing?module=${mod.key}`)}
        />
        <Button asChild variant="secondary" style={{ marginTop: 'var(--hos-space-4)' }}>
          <Link href="/app/modules">Back to modules</Link>
        </Button>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={mod.name}
        description={`${mod.entitledFeatureCount} of ${mod.featureCount} features entitled · Phase ${mod.phase}`}
      />
      <p style={{ fontSize: 'var(--hos-text-sm)', color: 'var(--hos-fg-muted)' }}>
        Clinical screens for {mod.name} ship in a later phase. Your entitlement is active — navigation and upsell paths
        are wired.
      </p>
      <Button asChild variant="secondary" style={{ marginTop: 'var(--hos-space-4)' }}>
        <Link href="/app">Back to dashboard</Link>
      </Button>
    </>
  );
}
