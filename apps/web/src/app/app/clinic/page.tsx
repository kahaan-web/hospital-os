'use client';

import type { MyQueueItemDto } from '@hos/shared';
import { Button, DataTable, PageHeader } from '@hos/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { doctorApi } from '@/features/clinical/doctor/api';

function todayIst(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

export default function ClinicQueuePage() {
  const [rows, setRows] = useState<MyQueueItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const date = todayIst();

  const load = useCallback(() => {
    setLoading(true);
    doctorApi
      .myQueue(date)
      .then(setRows)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && rows.length === 0) return <PageLoading />;
  if (error) return <PageError error={error} onRetry={load} />;

  return (
    <>
      <PageHeader title="Clinic" description={`OPD queue for ${date} (IST).`} />
      <DataTable
        data={rows}
        getRowId={(row) => row.encounterId}
        emptyMessage="No patients in your queue today."
        columns={[
          { id: 'token', header: 'Token', accessor: (row) => row.tokenHint ?? '—' },
          { id: 'patient', header: 'Patient', accessor: (row) => row.patient.fullName },
          { id: 'uhid', header: 'UHID', accessor: (row) => row.patient.uhid },
          { id: 'visit', header: 'Visit', accessor: (row) => row.visitType ?? '—' },
          {
            id: 'open',
            header: '',
            accessor: () => '',
            render: (row) => (
              <Link href={`/app/clinic/encounters/${row.encounterId}`}>
                <Button type="button" variant="secondary">
                  Open
                </Button>
              </Link>
            ),
          },
        ]}
      />
    </>
  );
}
