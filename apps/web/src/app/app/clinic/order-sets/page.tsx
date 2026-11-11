'use client';

import type { OrderSetDto } from '@hos/shared';
import { DataTable, PageHeader } from '@hos/ui';
import { useCallback, useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { doctorApi } from '@/features/clinical/doctor/api';

export default function OrderSetsPage() {
  const [rows, setRows] = useState<OrderSetDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setLoading(true);
    doctorApi
      .orderSets()
      .then(setRows)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && rows.length === 0) return <PageLoading />;
  if (error) return <PageError error={error} onRetry={load} />;

  return (
    <>
      <PageHeader title="Order sets" description="Reusable CPOE bundles." />
      <DataTable
        data={rows}
        getRowId={(row) => row.id}
        emptyMessage="No order sets yet."
        columns={[
          { id: 'name', header: 'Name', accessor: (row) => row.name },
          { id: 'kind', header: 'Kind', accessor: (row) => row.kind },
          { id: 'items', header: 'Items', accessor: (row) => String(row.items.length) },
        ]}
      />
    </>
  );
}
