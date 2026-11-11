'use client';

import { createTranslator } from '@hos/shared';
import type { DietOrderView } from '@hos/shared';
import { DataTable, EmptyState, PageHeader } from '@hos/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { nursingApi } from '@/features/clinical/nursing/api';
import { PageError, PageLoading } from '@/features/common/LoadState';

const t = createTranslator('en');

export default function DietOrdersPage() {
  const [rows, setRows] = useState<DietOrderView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setLoading(true);
    nursingApi
      .dietList()
      .then(setRows)
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
      <PageHeader title={t('clinical.nursing.diet')} description={t('clinical.nursing.dietSubtitle')} />
      {rows.length === 0 ? (
        <EmptyState title="No active diet orders" />
      ) : (
        <DataTable
          data={rows}
          getRowId={(row) => row.orderItemId}
          pageSize={50}
          emptyMessage="No diet orders"
          columns={[
            { id: 'bed', header: 'Bed', accessor: (row) => row.bedLabel ?? '—' },
            { id: 'patient', header: 'Patient', accessor: (row) => row.patientName },
            { id: 'diet', header: 'Diet', accessor: (row) => row.dietCode },
            { id: 'note', header: 'Instructions', accessor: (row) => row.instructions ?? '—' },
            {
              id: 'chart',
              header: '',
              accessor: () => '',
              render: (row) => (
                <Link href={`/app/nursing/encounters/${row.encounterId}`} className="hos-link">
                  Chart
                </Link>
              ),
            },
          ]}
        />
      )}
    </>
  );
}
