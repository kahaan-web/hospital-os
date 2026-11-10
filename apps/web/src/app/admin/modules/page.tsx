'use client';

import type { CatalogModule } from '@hos/shared';
import { DataTable, PageHeader } from '@hos/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { formatINR } from '@/lib/format';
import { apiGet } from '@/lib/api';

export default function AdminModulesPage() {
  const [modules, setModules] = useState<CatalogModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<CatalogModule[]>('/admin/modules')
      .then(setModules)
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
      <PageHeader title="Modules" description="Catalogue status, add-on pricing and GST." />
      <DataTable
        data={modules}
        getRowId={(m) => m.id}
        columns={[
          {
            id: 'name',
            header: 'Module',
            accessor: (m) => m.name,
            render: (m) => <Link href={`/admin/modules/${m.id}`}>{m.name}</Link>,
          },
          { id: 'status', header: 'Status', accessor: (m) => m.status },
          { id: 'addon', header: 'Add-on', accessor: (m) => (m.addonPurchasable ? 'Yes' : 'No') },
          {
            id: 'price',
            header: 'Monthly / loc',
            accessor: (m) => (m.addonMonthlyPaise != null ? formatINR(m.addonMonthlyPaise) : '—'),
          },
          { id: 'gst', header: 'GST bp', accessor: (m) => m.gstRateBp },
        ]}
      />
    </>
  );
}
