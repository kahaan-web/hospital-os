'use client';

import type { AdminTenantListItem } from '@hos/shared';
import { DataTable, PageHeader } from '@hos/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { listItems, type Paged } from '@/lib/lists';
import { apiGet } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

export default function AdminTenantsPage() {
  const [tenants, setTenants] = useState<AdminTenantListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<AdminTenantListItem[] | Paged<AdminTenantListItem>>('/admin/tenants')
      .then((t) => setTenants(listItems(t)))
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
      <PageHeader title="Tenants" description="Onboarding, active and suspended hospitals." />
      <DataTable
        data={tenants}
        getRowId={(t) => t.id}
        columns={[
          {
            id: 'name',
            header: 'Display name',
            accessor: (t) => t.displayName,
            render: (t) => <Link href={`/admin/tenants/${t.id}`}>{t.displayName}</Link>,
          },
          { id: 'status', header: 'Status', accessor: (t) => t.status },
          { id: 'plan', header: 'Plan', accessor: (t) => t.planName ?? '—' },
          { id: 'locations', header: 'Locations', accessor: (t) => t.locationCount },
          { id: 'users', header: 'Users', accessor: (t) => t.userCount },
          { id: 'created', header: 'Created', accessor: (t) => formatDateTime(t.createdAt) },
        ]}
      />
    </>
  );
}
