'use client';

import type { InpatientRowDto } from '@hos/shared';
import { DataTable, PageHeader } from '@hos/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { doctorApi } from '@/features/clinical/doctor/api';

export default function ClinicInpatientsPage() {
  const [rows, setRows] = useState<InpatientRowDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setLoading(true);
    doctorApi
      .inpatients()
      .then(setRows)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && rows.length === 0) return <PageLoading />;
  if (error) return <PageError error={error} onRetry={load} />;

  return (
    <>
      <PageHeader title="In-patients" description="Open IPD encounters (CPOE)." />
      <DataTable
        data={rows}
        getRowId={(row) => row.encounterId}
        emptyMessage="No in-patients."
        columns={[
          { id: 'bed', header: 'Bed', accessor: (row) => `${row.wardCode ?? '—'} ${row.bedLabel ?? ''}`.trim() },
          { id: 'patient', header: 'Patient', accessor: (row) => row.patient.fullName },
          { id: 'uhid', header: 'UHID', accessor: (row) => row.patient.uhid },
          {
            id: 'open',
            header: '',
            accessor: () => '',
            render: (row) => (
              <Link href={`/app/clinic/encounters/${row.encounterId}`} className="hos-link">
                Open
              </Link>
            ),
          },
        ]}
      />
    </>
  );
}
