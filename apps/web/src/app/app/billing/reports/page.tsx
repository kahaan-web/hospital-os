'use client';

import { DOC_TYPE_LABEL, formatDate, formatINR } from '@hos/shared';
import type { ClinicalDocType } from '@hos/shared';
import { Button, DataTable, Field, Input, PageHeader, Select } from '@hos/ui';
import { useState } from 'react';
import { billingApi } from '@/features/clinical/billing/api';
import { ApiError } from '@/lib/api';

type ReportId = 'cash' | 'revenue' | 'doctor-sharing' | 'outstanding' | 'deposits' | 'visit-statistics';

function todayIst(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

const today = todayIst();
const monthStart = `${today.slice(0, 8)}01`;

export default function BillingReportsPage() {
  const [report, setReport] = useState<ReportId>('cash');
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<{ key: string; cells: Record<string, string | number> }[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      if (report === 'cash') {
        const data = await billingApi.cash(from, to);
        setRows(data.rows.map((row, index) => ({ key: String(index), cells: { Type: row.entryType, Direction: row.direction, Mode: row.mode, Source: row.refType, Count: row.count, Amount: formatINR(row.amountPaise) } })));
        setSummary(`Net in ${formatINR(data.netInPaise)}`);
      } else if (report === 'revenue') {
        const data = await billingApi.revenue(from, to);
        setRows(data.rows.map((row, index) => ({ key: String(index), cells: { Document: DOC_TYPE_LABEL[row.docType as ClinicalDocType] ?? row.docType, Bills: row.bills, Tax: formatINR(row.taxPaise), Total: formatINR(row.totalPaise) } })));
        setSummary(`Total ${formatINR(data.totalPaise)}`);
      } else if (report === 'doctor-sharing') {
        const data = await billingApi.doctorSharing(from, to);
        setRows(data.rows.map((row, index) => ({ key: String(index), cells: { Doctor: row.doctorName, Lines: row.lines, Amount: formatINR(row.amountPaise) } })));
        setSummary(null);
      } else if (report === 'outstanding') {
        const data = await billingApi.outstanding();
        setRows(data.rows.map((row) => ({ key: row.billId, cells: { Bill: row.number ?? 'Draft', Patient: row.patientName, UHID: row.uhid, Balance: formatINR(row.balancePaise) } })));
        setSummary(`Outstanding ${formatINR(data.balancePaise)}`);
      } else if (report === 'deposits') {
        const data = await billingApi.depositRegister();
        setRows(data.rows.map((row) => ({ key: row.id, cells: { Number: row.number, Patient: row.patientName, UHID: row.uhid, Balance: formatINR(row.balancePaise), Status: row.status, Date: formatDate(row.createdAt) } })));
        setSummary(null);
      } else {
        const data = await billingApi.visitStatistics(from, to);
        setRows([{ key: 'visits', cells: { 'OPD visits': data.opdVisits, 'OP bills': data.opBills, Billed: formatINR(data.billedPaise) } }]);
        setSummary(null);
      }
    } catch (e) {
      setRows([]);
      setSummary(null);
      setError(e instanceof ApiError ? e.message : 'Report failed');
    } finally {
      setLoading(false);
    }
  };

  const columns = Object.keys(rows[0]?.cells ?? { Report: '' }).map((key) => ({
    id: key,
    header: key,
    accessor: (row: { key: string; cells: Record<string, string | number> }) => row.cells[key] ?? '',
  }));

  return (
    <>
      <PageHeader title="Billing reports" description="Cash includes every module that wrote to the cash book. GST figures are configuration. Confirm with your CA." />
      <form
        className="mb-4 grid max-w-3xl gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <Field label="Report" htmlFor="report-kind">
          <Select id="report-kind" value={report} onChange={(e) => setReport(e.target.value as ReportId)}>
            <option value="cash">Cash summary</option>
            <option value="revenue">Revenue</option>
            <option value="doctor-sharing">Doctor sharing</option>
            <option value="outstanding">Outstanding</option>
            <option value="deposits">Deposits</option>
            <option value="visit-statistics">Visit statistics</option>
          </Select>
        </Field>
        <Field label="From" htmlFor="report-from">
          <Input id="report-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
        </Field>
        <Field label="To" htmlFor="report-to">
          <Input id="report-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} required />
        </Field>
        <div className="flex items-end">
          <Button type="submit" disabled={loading}>
            {loading ? 'Running…' : 'Run report'}
          </Button>
        </div>
      </form>
      {error ? (
        <p role="alert" className="hos-field__error">
          {error}
        </p>
      ) : null}
      {summary ? <p>{summary}</p> : null}
      <DataTable data={rows} getRowId={(row) => row.key} emptyMessage="Run a report to see rows." columns={columns} />
    </>
  );
}
