'use client';

import type { AdminOverviewDto } from '@hos/shared';
import { PageHeader, StatCard } from '@hos/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { formatINR, formatNumberIN } from '@/lib/format';
import { apiGet } from '@/lib/api';

export default function AdminOverviewPage() {
  const [data, setData] = useState<AdminOverviewDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<AdminOverviewDto>('/admin/overview')
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <PageLoading />;
  if (error) return <PageError error={error} onRetry={load} />;
  if (!data) return null;

  return (
    <>
      <PageHeader title="Overview" description="Platform health, tenant mix and catalogue stats." />
      <Grid>
        <StatCard label="Active tenants" value={formatNumberIN(data.tenants.active)} hint={`${data.tenants.onboarding} onboarding`} />
        <StatCard label="MRR (sample)" value={formatINR(data.mrrPaise)} />
        <StatCard label="Invoiced" value={formatINR(data.invoicedPaise)} />
        <StatCard
          label="Catalogue"
          value={formatNumberIN(data.catalogue.modules)}
          hint={`${data.catalogue.features} features`}
        />
      </Grid>
      <section style={{ marginTop: 'var(--hos-space-6)' }}>
        <h2 style={{ fontSize: 'var(--hos-text-base)', fontWeight: 600 }}>Recent tenants</h2>
        <table style={{ width: '100%', marginTop: 'var(--hos-space-3)', fontSize: 'var(--hos-text-sm)', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Name</th>
              <th style={th}>Status</th>
              <th style={th}>Plan</th>
            </tr>
          </thead>
          <tbody>
            {data.recentTenants.map((t) => (
              <tr key={t.id}>
                <td style={td}>
                  <Link href={`/admin/tenants/${t.id}`}>{t.displayName}</Link>
                </td>
                <td style={td}>{t.status}</td>
                <td style={td}>{t.planName ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

const th: React.CSSProperties = { textAlign: 'left', padding: 'var(--hos-space-2)', borderBottom: '1px solid var(--hos-border)' };
const td: React.CSSProperties = { padding: 'var(--hos-space-2)', borderBottom: '1px solid var(--hos-border)' };

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))', gap: 'var(--hos-space-3)' }}>
      {children}
    </div>
  );
}
