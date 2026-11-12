'use client';

import { formatDateTime } from '@hos/shared';
import { Badge, Button, DataTable, DatePicker, Field, PageHeader } from '@hos/ui';
import Link from 'next/link';
import { useState } from 'react';
import { LabNav } from '@/features/clinical/lab/LabNav';
import { labApi, type LabCriticalRow, type LabTatRow } from '@/features/clinical/lab/api';
import { ApiError } from '@/lib/api';

function monthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export default function LabTatPage() {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [tat, setTat] = useState<LabTatRow[] | null>(null);
  const [critical, setCritical] = useState<LabCriticalRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setError('');
    setBusy(true);
    try {
      const [tatRows, criticalRows] = await Promise.all([labApi.tat(from, to), labApi.critical(from, to)]);
      setTat(tatRows);
      setCritical(criticalRows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the report');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="TAT and critical values" description="Turnaround time by test against its target, and a log of critical results." />
      <LabNav />
      <form
        className="mb-4 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <Field label="From">
          <DatePicker value={from} onChange={(value) => setFrom(value ?? '')} aria-label="From date" />
        </Field>
        <Field label="To">
          <DatePicker value={to} onChange={(value) => setTo(value ?? '')} aria-label="To date" />
        </Field>
        <Button type="submit" disabled={busy || !from || !to}>
          Show report
        </Button>
      </form>
      {error ? (
        <p role="alert" className="mb-3 text-sm" style={{ color: 'var(--hos-fg-danger)' }}>
          {error}
        </p>
      ) : null}
      {tat ? (
        <section className="mb-8 max-w-4xl" aria-label="TAT by test">
          <h2 className="mb-2 text-lg font-semibold">TAT by test</h2>
          <DataTable
            data={tat}
            getRowId={(row) => row.testName}
            emptyMessage="No verified samples in this date range."
            columns={[
              { id: 'test', header: 'Test', accessor: (row) => row.testName },
              { id: 'samples', header: 'Samples', accessor: (row) => row.samples },
              { id: 'avg', header: 'Average (h)', accessor: (row) => row.avgHours },
              { id: 'target', header: 'Target (h)', accessor: (row) => row.targetHours },
              {
                id: 'breaches',
                header: 'Breaches',
                accessor: (row) => row.breaches,
                render: (row) => <Badge tone={row.breaches > 0 ? 'warning' : 'success'}>{row.breaches}</Badge>,
              },
            ]}
          />
        </section>
      ) : null}
      {critical ? (
        <section className="max-w-4xl" aria-label="Critical values">
          <h2 className="mb-2 text-lg font-semibold">Critical values</h2>
          <DataTable
            data={critical}
            getRowId={(row) => `${row.accessionId}-${row.parameter}`}
            emptyMessage="No critical results in this date range."
            columns={[
              { id: 'acc', header: 'Accession', accessor: (row) => row.accessionNumber },
              { id: 'patient', header: 'Patient', accessor: (row) => `${row.patientName} (${row.uhid})` },
              { id: 'param', header: 'Parameter', accessor: (row) => row.parameter },
              { id: 'value', header: 'Value', accessor: (row) => `${row.value} ${row.flag}` },
              { id: 'verified', header: 'Verified', accessor: (row) => (row.verifiedAt ? formatDateTime(row.verifiedAt) : 'Not yet') },
              {
                id: 'open',
                header: '',
                accessor: () => '',
                render: (row) => (
                  <Link href={`/app/lab/accessions/${row.accessionId}`} className="hos-link">
                    Open
                  </Link>
                ),
              },
            ]}
          />
        </section>
      ) : null}
    </>
  );
}
