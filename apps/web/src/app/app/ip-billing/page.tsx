'use client';

import type { IpRunningBalanceDto } from '@hos/shared';
import { formatINR } from '@hos/shared';
import { Button, DataTable, PageHeader } from '@hos/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { ipBillingApi } from '@/features/clinical/ipbilling/api';

export default function IpBillingPage() {
  const [rows, setRows] = useState<IpRunningBalanceDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setLoading(true);
    ipBillingApi
      .running()
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
      <PageHeader
        title="In-patient billing"
        description="Open admissions with unbilled charges, deposits and balance due at this location."
        actions={
          <Link href="/app/ip-billing/payers">
            <Button variant="secondary">Payers</Button>
          </Link>
        }
      />
      <DataTable
        data={rows}
        getRowId={(row) => row.encounterId}
        emptyMessage="No open IP visits at this location."
        columns={[
          { id: 'visit', header: 'Visit', accessor: (row) => row.encounterNumber },
          { id: 'patient', header: 'Patient', accessor: (row) => row.patientName },
          { id: 'ward', header: 'Ward / bed', accessor: (row) => row.wardLabel ?? '—' },
          { id: 'unbilled', header: 'Unbilled', accessor: (row) => formatINR(row.unbilledPaise) },
          { id: 'balance', header: 'Balance', accessor: (row) => formatINR(row.balancePaise) },
          {
            id: 'open',
            header: '',
            accessor: () => '',
            render: (row) => (
              <Link href={`/app/ip-billing/${row.encounterId}`} className="hos-link">
                Open
              </Link>
            ),
          },
        ]}
      />
    </>
  );
}
