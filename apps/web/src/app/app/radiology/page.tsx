'use client';

import { createTranslator, formatDateTime } from '@hos/shared';
import { Badge, Button, DataTable, PageHeader } from '@hos/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { MODALITIES, radApi, type RadOrderDto, type RadStatus } from '@/features/clinical/radiology/api';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { ApiError } from '@/lib/api';

const t = createTranslator('en');

const FILTERS: ReadonlyArray<{ id: '' | RadStatus; label: string }> = [
  { id: '', label: 'All' },
  { id: 'ordered', label: 'Ordered' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'done', label: 'Awaiting report' },
  { id: 'reported', label: 'Reported' },
];

function tone(status: RadStatus): 'neutral' | 'info' | 'warning' | 'success' | 'error' {
  if (status === 'reported') return 'success';
  if (status === 'cancelled') return 'error';
  if (status === 'in_progress') return 'info';
  if (status === 'done') return 'warning';
  return 'neutral';
}

export default function RadiologyWorklistPage() {
  const [status, setStatus] = useState<'' | RadStatus>('');
  const [rows, setRows] = useState<RadOrderDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    radApi
      .list({ status: status || undefined })
      .then(setRows)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (row: RadOrderDto, fn: () => Promise<unknown>) => {
    setBusyId(row.id);
    setActionError('');
    try {
      await fn();
      load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not update this study');
    } finally {
      setBusyId(null);
    }
  };

  if (loading && rows.length === 0 && !error) return <PageLoading label="Loading the worklist…" />;
  if (error) return <PageError error={error} onRetry={load} />;

  return (
    <>
      <PageHeader
        title={t('clinical.radiology.title')}
        description="Imaging orders for this location. Start the study, mark it done, then write and sign the report."
        actions={
          <Link href="/app/radiology/new" className="hos-btn hos-btn--md hos-btn--primary">
            {t('clinical.radiology.new')}
          </Link>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {FILTERS.map((filter) => (
          <Button key={filter.id || 'all'} type="button" variant={status === filter.id ? 'primary' : 'secondary'} onClick={() => setStatus(filter.id)}>
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
        getRowId={(row) => row.id}
        emptyMessage="No radiology orders yet."
        columns={[
          { id: 'ordered', header: 'Ordered', accessor: (row) => formatDateTime(row.createdAt) },
          { id: 'number', header: 'Order', accessor: (row) => row.number },
          { id: 'patient', header: 'Patient', accessor: (row) => `${row.patientName} · ${row.uhid}` },
          { id: 'study', header: 'Study', accessor: (row) => `${MODALITIES.find((m) => m.id === row.modality)?.label ?? row.modality} · ${row.studyName}` },
          { id: 'priority', header: 'Priority', accessor: (row) => row.priority },
          {
            id: 'status',
            header: 'Status',
            accessor: (row) => row.status,
            render: (row) => <Badge tone={tone(row.status)}>{row.status === 'done' ? 'awaiting report' : row.status.replace('_', ' ')}</Badge>,
          },
          {
            id: 'action',
            header: '',
            accessor: () => '',
            render: (row) => (
              <span className="flex items-center gap-2">
                {row.status === 'ordered' ? (
                  <Button type="button" variant="secondary" disabled={busyId === row.id} onClick={() => void act(row, () => radApi.start(row.id))}>
                    Start study
                  </Button>
                ) : null}
                {row.status === 'in_progress' ? (
                  <Button type="button" variant="secondary" disabled={busyId === row.id} onClick={() => void act(row, () => radApi.done(row.id))}>
                    Mark done
                  </Button>
                ) : null}
                <Link href={`/app/radiology/orders/${row.id}`} className="hos-link">
                  {row.status === 'done' ? 'Write report' : 'Open'}
                </Link>
              </span>
            ),
          },
        ]}
      />
    </>
  );
}
