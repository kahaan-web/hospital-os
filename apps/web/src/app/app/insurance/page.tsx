'use client';

import { formatDate, formatINR } from '@hos/shared';
import { Badge, Button, DataTable, PageHeader } from '@hos/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { InsuranceNav } from '@/features/clinical/insurance/InsuranceNav';
import { insuranceApi, statusTone, type InsuranceRequestRow, type RequestStatus } from '@/features/clinical/insurance/api';
import { PageError, PageLoading } from '@/features/common/LoadState';

const FILTERS: { id: '' | RequestStatus; label: string }[] = [
  { id: '', label: 'All' },
  { id: 'submitted', label: 'Awaiting decision' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
];

export default function InsuranceRequestsPage() {
  const [status, setStatus] = useState<'' | RequestStatus>('');
  const [rows, setRows] = useState<InsuranceRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    insuranceApi
      .requests(status || undefined)
      .then(setRows)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && rows.length === 0 && !error) return <PageLoading label="Loading requests…" />;
  if (error) return <PageError error={error} onRetry={load} />;

  return (
    <>
      <PageHeader
        title="Pre-auth and claims"
        description="Record insurer and TPA pre-authorisations and claims. Status is tracked here; nothing is sent to the payer."
        actions={
          <Link href="/app/insurance/new" className="hos-link">
            New request
          </Link>
        }
      />
      <InsuranceNav />
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {FILTERS.map((filter) => (
          <Button key={filter.id || 'all'} type="button" variant={status === filter.id ? 'primary' : 'secondary'} onClick={() => setStatus(filter.id)}>
            {filter.label}
          </Button>
        ))}
      </div>
      <DataTable
        data={rows}
        getRowId={(row) => row.id}
        emptyMessage="No requests yet. Create a pre-authorisation request to get started."
        columns={[
          { id: 'created', header: 'Raised', accessor: (row) => formatDate(row.createdAt) },
          { id: 'patient', header: 'Patient', accessor: (row) => `${row.patientName}${row.uhid ? ` · ${row.uhid}` : ''}` },
          { id: 'payer', header: 'Payer', accessor: (row) => row.payerName },
          { id: 'kind', header: 'Type', accessor: (row) => (row.kind === 'preauth' ? 'Pre-auth' : 'Claim') },
          { id: 'estimate', header: 'Estimate', accessor: (row) => formatINR(row.estimatedPaise) },
          { id: 'approved', header: 'Approved', accessor: (row) => (row.approvedPaise == null ? '—' : formatINR(row.approvedPaise)) },
          {
            id: 'status',
            header: 'Status',
            accessor: (row) => row.status,
            render: (row) => <Badge tone={statusTone(row.status)}>{row.status}</Badge>,
          },
          {
            id: 'open',
            header: '',
            accessor: () => '',
            render: (row) => (
              <Link href={`/app/insurance/${row.id}`} className="hos-link">
                Open
              </Link>
            ),
          },
        ]}
      />
    </>
  );
}
