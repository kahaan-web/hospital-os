'use client';

import type { PatientSummaryDto } from '@hos/shared';
import { Button, DataTable, Input, PageHeader } from '@hos/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { registrationApi } from '@/features/clinical/registration/api';

export default function PatientsPage() {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<PatientSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setLoading(true);
    registrationApi
      .search(query)
      .then((page) => setRows(page.items))
      .catch(setError)
      .finally(() => setLoading(false));
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && rows.length === 0) return <PageLoading />;
  if (error) return <PageError error={error} onRetry={load} />;

  return (
  <>
      <PageHeader
        title="Patients"
        description="Search by name, UHID or mobile."
        actions={
          <Link href="/app/patients/new">
            <Button type="button">New patient</Button>
          </Link>
        }
      />
      <form
        className="mb-4 flex max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(q.trim());
        }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search patients" aria-label="Search patients" />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      <DataTable
        data={rows}
        getRowId={(row) => row.id}
        emptyMessage={query ? 'No patients match this search.' : 'No patients yet. Register the first patient.'}
        columns={[
          { id: 'uhid', header: 'UHID', accessor: (row) => row.uhid },
          { id: 'name', header: 'Name', accessor: (row) => row.fullName },
          { id: 'age', header: 'Age / sex', accessor: (row) => `${row.ageLabel || '—'} · ${row.gender}` },
          { id: 'mobile', header: 'Mobile', accessor: (row) => row.mobileMasked },
          { id: 'city', header: 'City', accessor: (row) => row.city || '—' },
          {
            id: 'open',
            header: '',
            accessor: () => '',
            render: (row) => (
              <Link href={`/app/patients/${row.id}`} className="hos-link">
                Open
              </Link>
            ),
          },
        ]}
      />
    </>
  );
}
