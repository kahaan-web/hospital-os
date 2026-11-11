'use client';

import type { LabMisDto, PatientSummaryDto } from '@hos/shared';
import { formatDateTime } from '@hos/shared';
import { Button, DataTable, DatePicker, Field, PageHeader } from '@hos/ui';
import Link from 'next/link';
import { useState } from 'react';
import { PatientPicker } from '@/features/clinical/common/PatientPicker';
import { LabNav } from '@/features/clinical/lab/LabNav';
import { labApi } from '@/features/clinical/lab/api';
import { ApiError } from '@/lib/api';

function monthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export default function LabReportsPage() {
  const [patient, setPatient] = useState<PatientSummaryDto | null>(null);
  const [history, setHistory] = useState<Array<{ id: string; name: string; status: string; reportedAt: string | null }>>([]);
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [mis, setMis] = useState<LabMisDto | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadHistory = async (next: PatientSummaryDto) => {
    setPatient(next);
    setError('');
    setBusy(true);
    try {
      setHistory(await labApi.history(next.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load history');
    } finally {
      setBusy(false);
    }
  };

  const loadMis = async () => {
    setError('');
    setBusy(true);
    try {
      setMis(await labApi.mis(from, to));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the MIS');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Lab reports" description="Verified reports for one patient, and a count of samples for a date range." />
      <LabNav />
      {error ? (
        <p role="alert" className="mb-3 text-sm" style={{ color: 'var(--hos-fg-danger)' }}>
          {error}
        </p>
      ) : null}
      <section className="mb-8 max-w-3xl" aria-label="Patient history">
        <h2 className="mb-2 text-lg font-semibold">Patient history</h2>
        <PatientPicker onValueChange={(next) => void loadHistory(next)} disabled={busy} />
        {patient ? (
          <DataTable
            data={history}
            getRowId={(row) => row.id}
            emptyMessage={`${patient.fullName} has no verified reports yet.`}
            columns={[
              { id: 'test', header: 'Test', accessor: (row) => row.name },
              { id: 'status', header: 'Status', accessor: (row) => row.status },
              { id: 'when', header: 'Reported', accessor: (row) => (row.reportedAt ? formatDateTime(row.reportedAt) : '—') },
              {
                id: 'open',
                header: '',
                accessor: () => '',
                render: (row) => (
                  <Link href={`/app/lab/accessions/${row.id}`} className="hos-link">
                    Open
                  </Link>
                ),
              },
            ]}
          />
        ) : (
          <p className="mt-2 text-sm" style={{ color: 'var(--hos-fg-muted)' }}>
            Search a patient to see verified reports.
          </p>
        )}
      </section>
      <section className="max-w-3xl" aria-label="Lab MIS">
        <h2 className="mb-2 text-lg font-semibold">Lab MIS</h2>
        <form
          className="mb-4 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void loadMis();
          }}
        >
          <Field label="From">
            <DatePicker value={from} onChange={(value) => setFrom(value ?? '')} aria-label="From date" />
          </Field>
          <Field label="To">
            <DatePicker value={to} onChange={(value) => setTo(value ?? '')} aria-label="To date" />
          </Field>
          <Button type="submit" disabled={busy || !from || !to}>
            Show counts
          </Button>
        </form>
        {mis ? (
          <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <div>
              <dt style={{ color: 'var(--hos-fg-muted)' }}>Samples</dt>
              <dd className="tabular-nums text-lg">{mis.total}</dd>
            </div>
            <div>
              <dt style={{ color: 'var(--hos-fg-muted)' }}>Critical</dt>
              <dd className="tabular-nums text-lg">{mis.criticalCount}</dd>
            </div>
            <div>
              <dt style={{ color: 'var(--hos-fg-muted)' }}>TAT breaches</dt>
              <dd className="tabular-nums text-lg">{mis.tatBreaches}</dd>
            </div>
            <div>
              <dt style={{ color: 'var(--hos-fg-muted)' }}>By status</dt>
              <dd>{Object.entries(mis.byStatus).map(([status, count]) => `${status} ${count}`).join(', ') || '—'}</dd>
            </div>
          </dl>
        ) : null}
      </section>
    </>
  );
}
