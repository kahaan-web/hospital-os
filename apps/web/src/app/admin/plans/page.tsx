'use client';

import type { CatalogPlan } from '@hos/shared';
import { Button, DataTable, PageHeader } from '@hos/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { formatINR } from '@/lib/format';
import { apiGet, apiPost } from '@/lib/api';

export default function AdminPlansPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<CatalogPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reordering, setReordering] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<CatalogPlan[]>('/admin/plans')
      .then(setPlans)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const reorder = async (next: CatalogPlan[]) => {
    setReordering(true);
    try {
      await apiPost('/admin/plans/reorder', { planIds: next.map((p) => p.id) });
      setPlans(next);
    } catch {
      load();
    } finally {
      setReordering(false);
    }
  };

  const move = (id: string, dir: -1 | 1) => {
    const sorted = [...plans].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((p) => p.id === id);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= sorted.length) return;
    const copy = [...sorted];
    const removed = copy.splice(idx, 1);
    const row = removed[0];
    if (!row) return;
    copy.splice(swap, 0, row);
    void reorder(copy);
  };

  if (loading) return <PageLoading />;
  if (error) return <PageError error={error} onRetry={load} />;

  const sorted = [...plans].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <>
      <PageHeader
        title="Plans"
        description="Tiers, display order and sample prices. Use arrows to reorder how plans appear in the wizard."
        actions={
          <Button type="button" variant="secondary" onClick={() => router.push('/admin/plans/create')}>
            Create plan
          </Button>
        }
      />
      <DataTable
        data={sorted}
        getRowId={(p) => p.id}
        columns={[
          {
            id: 'order',
            header: 'Order',
            accessor: () => '',
            render: (p) => (
              <span style={{ display: 'inline-flex', gap: 'var(--hos-space-1)' }}>
                <Button type="button" variant="ghost" size="sm" disabled={reordering} onClick={() => move(p.id, -1)} aria-label="Move up">
                  ↑
                </Button>
                <Button type="button" variant="ghost" size="sm" disabled={reordering} onClick={() => move(p.id, 1)} aria-label="Move down">
                  ↓
                </Button>
              </span>
            ),
          },
          {
            id: 'name',
            header: 'Name',
            accessor: (p) => p.name,
            render: (p) => <Link href={`/admin/plans/${p.id}`}>{p.name}</Link>,
          },
          { id: 'status', header: 'Status', accessor: (p) => p.status },
          { id: 'monthly', header: 'Monthly / loc', accessor: (p) => formatINR(p.monthlyPaise) },
          { id: 'annual', header: 'Annual / loc', accessor: (p) => formatINR(p.annualPaise) },
          { id: 'features', header: 'Features', accessor: (p) => p.featureCount },
        ]}
      />
    </>
  );
}
