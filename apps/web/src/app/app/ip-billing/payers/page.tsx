'use client';

import type { PayerDto } from '@hos/shared';
import { PageHeader, DataTable } from '@hos/ui';
import { useCallback, useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { ipBillingApi } from '@/features/clinical/ipbilling/api';

export default function IpPayersPage() {
  const [rows, setRows] = useState<PayerDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setLoading(true);
    ipBillingApi
      .payers()
      .then((data) => {
        setRows(data);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && rows.length === 0) return <PageLoading />;
  if (error && rows.length === 0) return <PageError error={error} onRetry={load} />;

  return (
    <>
      <PageHeader title="Payers" description="TPA, insurer and corporate payers used for IP credit billing." />
      <DataTable
        data={rows}
        getRowId={(row) => row.id}
        emptyMessage="No payers yet. Add one from the API or seed."
        columns={[
          { id: 'code', header: 'Code', accessor: (row) => row.code },
          { id: 'name', header: 'Name', accessor: (row) => row.name },
          { id: 'kind', header: 'Kind', accessor: (row) => row.kind },
          { id: 'gstin', header: 'GSTIN', accessor: (row) => row.gstin || '—' },
          { id: 'state', header: 'State', accessor: (row) => row.stateCode || '—' },
        ]}
      />
    </>
  );
}
