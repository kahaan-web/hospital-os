'use client';

import type { MlcCaseDto } from '@hos/shared';
import { DataTable, PageHeader } from '@hos/ui';
import { useCallback, useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { registrationApi } from '@/features/clinical/registration/api';

export default function MlcRegisterPage() {
  const [rows, setRows] = useState<MlcCaseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setLoading(true);
    registrationApi
      .listMlc()
      .then(setRows)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <PageLoading />;
  if (error) return <PageError error={error} onRetry={load} />;

  return (
    <>
      <PageHeader title="MLC cases" description="Medico-legal cases linked to visits." />
      <DataTable
        data={rows}
        getRowId={(row) => row.id}
        emptyMessage="No MLC cases recorded."
        columns={[
          { id: 'number', header: 'MLC no.', accessor: (row) => row.number },
          { id: 'patient', header: 'Patient', accessor: (row) => row.patientName ?? row.patientId },
          { id: 'uhid', header: 'UHID', accessor: (row) => row.patientUhid ?? '—' },
          { id: 'station', header: 'Police station', accessor: (row) => row.policeStation || '—' },
          { id: 'reported', header: 'Reported', accessor: (row) => new Date(row.reportedAt).toLocaleString('en-IN') },
        ]}
      />
    </>
  );
}
