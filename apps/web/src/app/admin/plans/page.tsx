'use client';

import type { CatalogPlan } from '@hos/shared';
import { Button, DataTable, PageHeader } from '@hos/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { formatINR } from '@/lib/format';
import { apiGet } from '@/lib/api';

export default function AdminPlansPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<CatalogPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

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

  if (loading) return <PageLoading />;
  if (error) return <PageError error={error} onRetry={load} />;

  return (
    <>
      <PageHeader
        title="Plans"
        description="Tiers, display order and sample prices."
        actions={
          <Button type="button" variant="secondary" onClick={() => router.push('/admin/plans/create')}>
            Create plan
          </Button>
        }
      />
      <DataTable
        data={plans}
        getRowId={(p) => p.id}
        columns={[
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
