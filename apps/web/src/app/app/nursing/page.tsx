'use client';

import { createTranslator } from '@hos/shared';
import type { WardPatient } from '@hos/shared';
import { DataTable, EmptyState, PageHeader } from '@hos/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { nursingApi } from '@/features/clinical/nursing/api';
import { PageError, PageLoading } from '@/features/common/LoadState';

const t = createTranslator('en');

export default function NursingWardPage() {
  const [rows, setRows] = useState<WardPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setLoading(true);
    nursingApi
      .ward()
      .then((items) => {
        setRows(items);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && rows.length === 0) return <PageLoading label="Loading ward census" />;
  if (error && rows.length === 0) return <PageError error={error} onRetry={load} />;

  return (
    <>
      <PageHeader title={t('clinical.nursing.title')} description={t('clinical.nursing.wardSubtitle')} />
      {rows.length === 0 ? (
        <EmptyState title="No in-patients on this ward" />
      ) : (
        <DataTable
          data={rows}
          getRowId={(row) => row.encounterId}
          pageSize={50}
          emptyMessage="No in-patients"
          columns={[
            {
              id: 'bed',
              header: 'Bed',
              accessor: (row) => [row.wardCode, row.bedLabel].filter(Boolean).join(' · ') || '—',
            },
            { id: 'uhid', header: 'UHID', accessor: (row) => row.uhid },
            { id: 'name', header: 'Patient', accessor: (row) => row.fullName },
            { id: 'age', header: 'Age', accessor: (row) => row.ageLabel },
            { id: 'doctor', header: 'Doctor', accessor: (row) => row.doctorName ?? '—' },
            {
              id: 'chart',
              header: '',
              accessor: () => '',
              render: (row) => (
                <Link href={`/app/nursing/encounters/${row.encounterId}`} className="hos-link">
                  Open chart
                </Link>
              ),
            },
          ]}
        />
      )}
    </>
  );
}
