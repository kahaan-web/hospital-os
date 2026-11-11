'use client';

import type { LabWorklistItemDto } from '@hos/shared';
import { formatDateTime } from '@hos/shared';
import { Badge, Button, DataTable, PageHeader } from '@hos/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { LabNav } from '@/features/clinical/lab/LabNav';
import { labApi } from '@/features/clinical/lab/api';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { ApiError } from '@/lib/api';

const FILTERS = [
  { id: '', label: 'To do' },
  { id: 'pending', label: 'Not collected' },
  { id: 'collected', label: 'Collected' },
  { id: 'received', label: 'Received' },
  { id: 'resulted', label: 'Resulted' },
  { id: 'verified', label: 'Verified' },
] as const;

function statusTone(status: string): 'neutral' | 'info' | 'warning' | 'success' | 'error' {
  if (status === 'verified' || status === 'reported') return 'success';
  if (status === 'rejected') return 'error';
  if (status === 'resulted' || status === 'received') return 'info';
  if (status === 'pending') return 'warning';
  return 'neutral';
}

export default function LabWorklistPage() {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<LabWorklistItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    labApi
      .worklist(status || undefined)
      .then(setRows)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const collect = async (row: LabWorklistItemDto) => {
    setBusyId(row.orderItemId);
    setActionError('');
    try {
      const accession = await labApi.collect({ orderItemId: row.orderItemId });
      router.push(`/app/lab/accessions/${accession.id}`);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not collect this sample');
      setBusyId(null);
    }
  };

  if (loading && rows.length === 0 && !error) return <PageLoading label="Loading the worklist…" />;
  if (error) return <PageError error={error} onRetry={load} />;

  return (
    <>
      <PageHeader title="Lab worklist" description="Collect samples and open accessions that still need a result." />
      <LabNav />
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {FILTERS.map((filter) => (
          <Button key={filter.id || 'todo'} type="button" variant={status === filter.id ? 'primary' : 'secondary'} onClick={() => setStatus(filter.id)}>
            {filter.label}
          </Button>
        ))}
      </div>
      {actionError ? (
        <p role="alert" className="mb-3 text-sm" style={{ color: 'var(--hos-fg-danger)' }}>
          {actionError}
        </p>
      ) : null}
      <DataTable
        data={rows}
        getRowId={(row) => row.orderItemId}
        emptyMessage="Nothing in this list. New lab orders appear here after the doctor places them."
        columns={[
          { id: 'placed', header: 'Ordered', accessor: (row) => formatDateTime(row.placedAt) },
          { id: 'patient', header: 'Patient', accessor: (row) => `${row.patientName} · ${row.uhid}` },
          { id: 'test', header: 'Test', accessor: (row) => row.testName },
          { id: 'priority', header: 'Priority', accessor: (row) => row.priority },
          { id: 'tat', header: 'TAT', accessor: (row) => (row.tatHours == null ? '—' : `${row.tatHours} h`) },
          {
            id: 'status',
            header: 'Status',
            accessor: (row) => row.status,
            render: (row) => <Badge tone={statusTone(row.status)}>{row.status === 'pending' ? 'Not collected' : row.status}</Badge>,
          },
          {
            id: 'action',
            header: '',
            accessor: () => '',
            render: (row) =>
              row.accessionId ? (
                <Link href={`/app/lab/accessions/${row.accessionId}`} className="hos-link">
                  Open
                </Link>
              ) : (
                <Button type="button" disabled={busyId === row.orderItemId} onClick={() => void collect(row)}>
                  Collect
                </Button>
              ),
          },
        ]}
      />
    </>
  );
}
