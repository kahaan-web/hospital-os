'use client';

import { ModuleTile, PageHeader } from '@hos/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { moduleLucideIcon } from '@/lib/moduleLucideIcon';
import type { TenantMe } from '@hos/shared';
import { fetchMe, isTenantMe } from '@/lib/auth';

export default function ModulesIndexPage() {
  const [me, setMe] = useState<TenantMe | null>(null);
  useEffect(() => {
    fetchMe().then((s) => {
      if (s && isTenantMe(s)) setMe(s);
    });
  }, []);

  const modules = me?.modules.filter((m) => m.access !== 'hidden') ?? [];

  return (
    <>
      <PageHeader title="Modules" description="Open entitled modules or upgrade locked ones." />
      <TileGrid>
        {modules.map((mod) => (
          <ModuleTile
            key={mod.id}
            title={mod.name}
            description={mod.description}
            state={mod.access}
            icon={moduleLucideIcon(mod.icon)}
            featureCount={mod.entitledFeatureCount}
            ctaLabel={mod.access === 'locked' ? 'Upgrade' : undefined}
            onCta={() => window.location.assign(`/app/settings/billing?module=${mod.key}`)}
            onOpen={() => window.location.assign(`/app/modules/${mod.key}`)}
          />
        ))}
      </TileGrid>
      <p style={{ marginTop: 'var(--hos-space-4)', fontSize: 'var(--hos-text-sm)' }}>
        <Link href="/app/settings/billing">Billing and add-ons</Link>
      </p>
    </>
  );
}

function TileGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(14rem, 1fr))', gap: 'var(--hos-space-3)' }}>
      {children}
    </div>
  );
}
