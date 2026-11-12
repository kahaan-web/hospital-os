'use client';

import { PHARMACY_REPORTS, type PharmacyReportDto, type PharmacyReportKey } from '@hos/shared';
import { Button, DataTable, Field, Input, PageHeader, Select } from '@hos/ui';
import { useState } from 'react';
import { pharmacyApi } from '@/features/clinical/pharmacy/api';
import { GstNote, PharmacyNav } from '@/features/clinical/pharmacy/PharmacyNav';

const LABELS: Record<PharmacyReportKey, string> = {
  'stock-register': 'Stock register',
  receipts: 'Receipt register',
  rejections: 'Rejection register',
  issues: 'Issue register',
  'issue-returns': 'Issue return register',
  adjustments: 'Stock adjustment register',
  'ip-statement': 'Patient issue / return statement (IP)',
  expiry: 'Expiry item report',
  purchases: 'Purchase register',
  'h1-register': 'Schedule H1 / X register',
};

export default function PharmacyReportsPage() {
  const [report, setReport] = useState<PharmacyReportKey>('stock-register');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<PharmacyReportDto | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      setData(await pharmacyApi.report(report, { from: from || undefined, to: to || undefined }));
    } catch (err) {
      setData(null);
      setMessage(err instanceof Error ? err.message : 'Could not load the report');
    } finally {
      setBusy(false);
    }
  }

  const tableRows = (data?.rows ?? []).map((cells, index) => ({ id: String(index), cells }));
  const columns = (data?.columns ?? []).map((header, index) => ({
    id: `c${index}`,
    header,
    accessor: (row: { cells: string[] }) => row.cells[index] ?? '',
  }));

  return (
    <>
      <PharmacyNav />
      <PageHeader title="Pharmacy reports" description="Purchase register needs the Medium plan." />
      <form onSubmit={run} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'end', marginBottom: '1rem' }}>
        <Field label="Report" htmlFor="report">
          <Select id="report" value={report} onChange={(e) => setReport(e.target.value as PharmacyReportKey)}>
            {PHARMACY_REPORTS.map((key) => (
              <option key={key} value={key}>
                {LABELS[key]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="From" htmlFor="from">
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To" htmlFor="to">
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Button type="submit" loading={busy}>
          Show
        </Button>
      </form>
      {message ? <p role="alert">{message}</p> : null}
      {data ? (
        <DataTable data={tableRows} getRowId={(row) => row.id} columns={columns} emptyMessage="No rows in this range." />
      ) : null}
      <GstNote />
    </>
  );
}
