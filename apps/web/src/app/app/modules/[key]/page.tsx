'use client';

import { Button, EmptyState, ModuleTile, PageHeader, Spinner } from '@hos/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { TenantMe } from '@hos/shared';
import { ApiError } from '@/lib/api';
import { fetchMe, isTenantMe } from '@/lib/auth';
import { PageError } from '@/features/common/LoadState';

export default function ModuleDetailPage() {
  const params = useParams();
  const key = String(params.key);
  const [me, setMe] = useState<TenantMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMe()
      .then((s) => {
        if (s && isTenantMe(s)) setMe(s);
      })
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Could not load session'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--hos-space-3)', padding: 'var(--hos-space-6)' }}>
        <Spinner aria-label="Loading module" />
        <span>Loading module…</span>
      </div>
    );
  }

  if (error) return <PageError error={error} onRetry={() => window.location.reload()} />;

  const mod = me?.modules.find((m) => m.key === key);

  if (!mod) {
    return <EmptyState title="Module not found" description="This module is not in your catalogue." />;
  }

  if (mod.access !== 'enabled') {
    const locked = mod.access === 'coming_soon';
    return (
      <>
        <PageHeader
          title={mod.name}
          description={mod.description}
        />
        <ModuleTile
          title={mod.name}
          state={mod.access}
          description={
            locked
              ? 'This module is on our roadmap. You will be able to enable it when it ships.'
              : 'Add this module to your subscription from billing settings.'
          }
          ctaLabel={locked ? undefined : mod.addonPurchasable ? 'Buy add-on in billing' : 'Change plan in billing'}
          onCta={
            locked
              ? undefined
              : () => {
                  window.location.assign(`/app/settings/billing?module=${encodeURIComponent(mod.key)}`);
                }
          }
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
        Clinical workflows for {mod.name} arrive in a later release. Your plan already includes this module — use the dashboard
        and settings until those screens ship.
      </p>
      <Button asChild variant="secondary" style={{ marginTop: 'var(--hos-space-4)' }}>
        <Link href="/app">Back to dashboard</Link>
      </Button>
    </>
  );
}
