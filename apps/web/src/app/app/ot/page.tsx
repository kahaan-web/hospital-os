'use client';

import { createTranslator, formatDateTime } from '@hos/shared';
import { Badge, Button, DataTable, PageHeader } from '@hos/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { otApi, type OtCaseDto, type OtStatus } from '@/features/clinical/ot/api';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { ApiError } from '@/lib/api';

const t = createTranslator('en');

const FILTERS: ReadonlyArray<{ id: '' | OtStatus; label: string }> = [
  { id: '', label: 'All' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
];

function tone(status: OtStatus): 'neutral' | 'info' | 'warning' | 'success' | 'error' {
  if (status === 'completed') return 'success';
  if (status === 'in_progress') return 'info';
  if (status === 'cancelled') return 'error';
  return 'warning';
}

export default function OtListPage() {
  const [status, setStatus] = useState<'' | OtStatus>('');
  const [rows, setRows] = useState<OtCaseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    otApi
      .list(status || undefined)
      .then(setRows)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (row: OtCaseDto, fn: () => Promise<unknown>) => {
    setBusyId(row.id);
    setActionError('');
    try {
      await fn();
      load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not update this case');
    } finally {
      setBusyId(null);
    }
  };

  const cancel = (row: OtCaseDto) => {
    const reason = window.prompt('Reason for cancelling this case');
    if (!reason) return;
    void act(row, () => otApi.cancel(row.id, reason));
  };

  if (loading && rows.length === 0 && !error) return <PageLoading label="Loading the OT list…" />;
  if (error) return <PageError error={error} onRetry={load} />;

  return (
    <>
      <PageHeader
        title={t('clinical.ot.title')}
        description="Operation theatre bookings for this location."
        actions={
          <Link href="/app/ot/new" className="hos-btn hos-btn--md hos-btn--primary">
            {t('clinical.ot.new')}
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
        emptyMessage="No OT cases yet. Schedule the first one."
        columns={[
          { id: 'when', header: 'Slot', accessor: (row) => `${formatDateTime(row.scheduledStart)}` },
          { id: 'room', header: 'Room', accessor: (row) => row.roomCode },
          { id: 'patient', header: 'Patient', accessor: (row) => `${row.patientName} · ${row.uhid}` },
          { id: 'procedure', header: 'Procedure', accessor: (row) => row.procedureName },
          { id: 'surgeon', header: 'Surgeon', accessor: (row) => row.surgeonName },
          { id: 'priority', header: 'Priority', accessor: (row) => row.priority },
          {
            id: 'status',
            header: 'Status',
            accessor: (row) => row.status,
            render: (row) => <Badge tone={tone(row.status)}>{row.status.replace('_', ' ')}</Badge>,
          },
          {
            id: 'action',
            header: '',
            accessor: () => '',
            render: (row) => (
              <span className="flex gap-2">
                {row.status === 'scheduled' ? (
                  <Button type="button" variant="secondary" disabled={busyId === row.id} onClick={() => void act(row, () => otApi.start(row.id))}>
                    Start
                  </Button>
                ) : null}
                {row.status === 'scheduled' || row.status === 'in_progress' ? (
                  <>
                    <Button type="button" disabled={busyId === row.id} onClick={() => void act(row, () => otApi.complete(row.id))}>
                      Mark complete
                    </Button>
                    <Button type="button" variant="ghost" disabled={busyId === row.id} onClick={() => cancel(row)}>
                      Cancel
                    </Button>
                  </>
                ) : null}
              </span>
            ),
          },
        ]}
      />
    </>
  );
}
