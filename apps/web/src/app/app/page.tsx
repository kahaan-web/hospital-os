'use client';

import type { ChecklistItemDto, DashboardDto, TenantMe } from '@hos/shared';
import { Badge, Checkbox, ModuleTile, PageHeader, StatCard } from '@hos/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { moduleLucideIcon } from '@/lib/moduleLucideIcon';
import { formatINR } from '@/lib/format';
import { apiGet, apiPatch } from '@/lib/api';
import { fetchMe, isTenantMe } from '@/lib/auth';

export default function DashboardPage() {
  const [me, setMe] = useState<TenantMe | null>(null);
  const [dash, setDash] = useState<DashboardDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchMe()
      .then((session) => {
        if (session && isTenantMe(session)) setMe(session);
      })
      .then(() => apiGet<DashboardDto>('/tenant/dashboard'))
      .then(setDash)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleChecklist = async (item: ChecklistItemDto, done: boolean) => {
    if (item.auto) return;
    const updated = await apiPatch<ChecklistItemDto>(`/tenant/checklist/${item.key}`, { done });
    setDash((d) =>
      d ? { ...d, checklist: d.checklist.map((c) => (c.key === item.key ? updated : c)) } : d,
    );
  };

  if (loading) return <PageLoading />;
  if (error) return <PageError error={error} onRetry={load} />;
  if (!dash || !me) return null;

  const locked = me.modules.filter((m) => m.access === 'locked' || m.access === 'coming_soon');

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${me.tenant.displayName} · Plan ${me.subscription?.planName ?? '—'}`}
      />
      <StatsGrid>
        <StatCard label="Users" value={String(dash.counts.users)} />
        <StatCard label="Locations" value={String(dash.counts.locations)} />
        <StatCard label="Sample doctors" value={String(dash.counts.doctors)} />
        <StatCard label="Departments" value={String(dash.counts.departments)} />
      </StatsGrid>

      {me.subscription ? (
        <p style={{ marginTop: 'var(--hos-space-4)', fontSize: 'var(--hos-text-sm)' }}>
          {me.subscription.cycle === 'annual' ? 'Annual' : 'Monthly'} billing ·{' '}
          {me.subscription.locationCount} location(s)
          {dash.latestInvoice ? (
            <>
              {' '}
              · Latest invoice{' '}
              <Link href="/app/settings/billing">{dash.latestInvoice.number}</Link> (
              {formatINR(dash.latestInvoice.totalPaise)})
            </>
          ) : null}
        </p>
      ) : null}

      <section style={{ marginTop: 'var(--hos-space-6)' }}>
        <h2 style={{ fontSize: 'var(--hos-text-base)', fontWeight: 600 }}>Go-live checklist</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 'var(--hos-space-3) 0 0', display: 'flex', flexDirection: 'column', gap: 'var(--hos-space-2)' }}>
          {dash.checklist.map((item) => (
            <li key={item.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--hos-space-3)' }}>
              <Checkbox
                checked={item.done}
                disabled={item.auto}
                onCheckedChange={(v) => toggleChecklist(item, v === true)}
                aria-label={item.title}
              />
              <div>
                <ItemTitle>
                  {item.title}
                  {item.optional ? <Badge tone="info">Optional</Badge> : null}
                  {item.done ? <Badge tone="success">Done</Badge> : null}
                </ItemTitle>
                <p style={{ margin: 'var(--hos-space-1) 0 0', color: 'var(--hos-fg-muted)', fontSize: 'var(--hos-text-sm)' }}>
                  {item.description}
                  {item.href ? (
                    <>
                      {' '}
                      <Link href={item.href}>Open</Link>
                    </>
                  ) : null}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ marginTop: 'var(--hos-space-6)' }}>
        <h2 style={{ fontSize: 'var(--hos-text-base)', fontWeight: 600 }}>Enabled modules</h2>
        <TileGrid>
          {me.modules
            .filter((m) => m.access === 'enabled')
            .map((mod) => (
              <ModuleTile
                key={mod.id}
                title={mod.name}
                description={mod.description}
                state="enabled"
                icon={moduleLucideIcon(mod.icon)}
                onOpen={() => window.location.assign(`/app/modules/${mod.key}`)}
              />
            ))}
        </TileGrid>
      </section>

      {locked.length > 0 ? (
        <section style={{ marginTop: 'var(--hos-space-6)' }}>
          <h2 style={{ fontSize: 'var(--hos-text-base)', fontWeight: 600 }}>Locked — buy or upgrade</h2>
          <TileGrid>
            {locked.slice(0, 8).map((mod) => (
              <ModuleTile
                key={mod.id}
                title={mod.name}
                description={mod.description}
                state={mod.access}
                ctaLabel={mod.addonPurchasable ? 'Buy add-on' : 'Upgrade plan'}
                onCta={() => window.location.assign(`/app/settings/billing?module=${mod.key}`)}
              />
            ))}
          </TileGrid>
        </section>
      ) : null}
    </>
  );
}

function StatsGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))',
        gap: 'var(--hos-space-3)',
      }}
    >
      {children}
    </div>
  );
}

function TileGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 'var(--hos-space-3)',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(14rem, 1fr))',
        gap: 'var(--hos-space-3)',
      }}
    >
      {children}
    </div>
  );
}

function ItemTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--hos-space-2)', flexWrap: 'wrap', fontWeight: 500 }}>
      {children}
    </div>
  );
}
