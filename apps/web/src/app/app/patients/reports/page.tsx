'use client';

import type { RegisterReportRow } from '@hos/shared';
import { Button, DataTable, Field, Input, PageHeader } from '@hos/ui';
import { useState } from 'react';
import { ApiError } from '@/lib/api';
import { registrationApi } from '@/features/clinical/registration/api';

const today = new Date().toISOString().slice(0, 10);
const monthStart = `${today.slice(0, 8)}01`;

export default function PatientReportsPage() {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [city, setCity] = useState('');
  const [rows, setRows] = useState<RegisterReportRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await registrationApi.report({ from, to, city: city || undefined });
      setRows(res.items);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Report failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader title="Registration report" description="Patients registered in a date range." />
      <form
        className="mb-4 grid max-w-3xl gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <Field label="From">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="City">
          <Input value={city} onChange={(e) => setCity(e.target.value)} />
        </Field>
        <div className="flex items-end gap-2">
          <Button type="submit" disabled={loading}>
            Run report
          </Button>
          <a className="hos-link text-sm" href={registrationApi.reportCsvUrl({ from, to, city: city || undefined })}>
            Download CSV
          </a>
        </div>
      </form>
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      <DataTable
        data={rows}
        getRowId={(r) => `${r.uhid}-${r.registeredAt}`}
        emptyMessage="Run the report to see patients registered in this period."
        columns={[
          { id: 'uhid', header: 'UHID', accessor: (r) => r.uhid },
          { id: 'name', header: 'Name', accessor: (r) => r.fullName },
          { id: 'city', header: 'City', accessor: (r) => r.city },
          { id: 'mobile', header: 'Mobile', accessor: (r) => r.mobile },
          { id: 'at', header: 'Registered', accessor: (r) => new Date(r.registeredAt).toLocaleDateString('en-IN') },
        ]}
      />
    </>
  );
}
