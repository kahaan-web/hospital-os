'use client';

import { createTranslator } from '@hos/shared';
import type { BedBoardBedDto } from '@hos/shared';
import { Badge, Button, DataTable, EmptyState, PageHeader } from '@hos/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AdtLinks, formatWhen, statusLabel } from '@/features/clinical/adt/links';
import { adtApi } from '@/features/clinical/adt/api';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { ApiError } from '@/lib/api';

const t = createTranslator('en');

const TONE: Record<string, 'success' | 'info' | 'warning' | 'neutral' | 'error'> = {
  vacant: 'success',
  occupied: 'info',
  housekeeping: 'warning',
  maintenance: 'neutral',
  blocked: 'error',
};

interface BoardRow {
  id: string;
  ward: string;
  room: string;
  bed: string;
  status: BedBoardBedDto['status'];
  patient: string;
  uhid: string;
  admitted: string;
  admissionId: string | null;
}

export default function BedBoardPage() {
  const [rows, setRows] = useState<BoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [posting, setPosting] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    adtApi
      .board()
      .then((board) => {
        const next: BoardRow[] = [];
        for (const ward of board.wards) {
          for (const room of ward.rooms) {
            for (const bed of room.beds) {
              next.push({
                id: bed.id,
                ward: `${ward.code} · ${ward.name}`,
                room: room.code,
                bed: bed.label,
                status: bed.status,
                patient: bed.admission?.patientName ?? '',
                uhid: bed.admission?.uhid ?? '',
                admitted: bed.admission?.admittedAt ?? '',
                admissionId: bed.admission?.id ?? null,
              });
            }
          }
        }
        setRows(next);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const postCharges = async () => {
    setPosting(true);
    setNotice('');
    try {
      const result = await adtApi.postCharges();
      setNotice(`${t('clinical.adt.chargesPosted')}: ${result.charges.length}. ${t('clinical.adt.gstNote')}`);
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : 'Could not post bed charges');
    } finally {
      setPosting(false);
    }
  };

  if (loading && rows.length === 0) return <PageLoading label="Loading the bed board" />;
  if (error && rows.length === 0) return <PageError error={error} onRetry={load} />;

  return (
    <>
      <AdtLinks current="/app/adt" />
      <PageHeader
        title={t('clinical.adt.title')}
        description="Who is in each bed at this location."
        actions={
          <div className="flex gap-2">
            <Button type="button" variant="secondary" disabled={posting} onClick={() => void postCharges()}>
              {t('clinical.adt.postCharges')}
            </Button>
            <Link href="/app/adt/admit">
              <Button type="button">{t('clinical.adt.admit')}</Button>
            </Link>
          </div>
        }
      />
      <p className="mb-3 text-sm" style={{ color: 'var(--hos-fg-muted)' }}>
        {t('clinical.adt.gstNote')}
      </p>
      {notice ? (
        <p className="mb-3 text-sm" role="status">
          {notice}
        </p>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState
          title={t('clinical.adt.emptyBoard')}
          action={
            <Link href="/app/adt/masters">
              <Button type="button">{t('clinical.adt.emptyBoardAction')}</Button>
            </Link>
          }
        />
      ) : (
        <DataTable
          data={rows}
          getRowId={(row) => row.id}
          pageSize={50}
          emptyMessage={t('clinical.adt.emptyBoard')}
          columns={[
            { id: 'ward', header: t('clinical.adt.ward'), accessor: (row) => row.ward },
            { id: 'room', header: t('clinical.adt.room'), accessor: (row) => row.room },
            { id: 'bed', header: t('clinical.adt.bed'), accessor: (row) => row.bed },
            {
              id: 'status',
              header: t('clinical.adt.status'),
              accessor: (row) => statusLabel(row.status),
              render: (row) => <Badge tone={TONE[row.status] ?? 'neutral'}>{statusLabel(row.status)}</Badge>,
            },
            { id: 'patient', header: t('clinical.adt.patient'), accessor: (row) => row.patient || '—' },
            { id: 'uhid', header: t('clinical.adt.uhid'), accessor: (row) => row.uhid || '—' },
            { id: 'admitted', header: t('clinical.adt.admitted'), accessor: (row) => (row.admitted ? formatWhen(row.admitted) : '—') },
            {
              id: 'open',
              header: '',
              accessor: () => '',
              render: (row) =>
                row.admissionId ? (
                  <Link href={`/app/adt/admissions/${row.admissionId}`} className="hos-link">
                    {t('clinical.adt.open')}
                  </Link>
                ) : (
                  '—'
                ),
            },
          ]}
        />
      )}
    </>
  );
}
