'use client';

import { DataTable, Button, Field, Input, PageHeader, Select } from '@hos/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { type AttendanceStatus, type EmployeeDetail, type PayslipPreview, payrollApi, rupees, STATUS_LABEL } from '@/features/clinical/payroll/api';
import { istDateKey } from '@hos/shared';

const STATUSES = Object.keys(STATUS_LABEL) as AttendanceStatus[];

export default function PayrollEmployeePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [month, setMonth] = useState(() => istDateKey(new Date()).slice(0, 7));
  const [detail, setDetail] = useState<EmployeeDetail | null>(null);
  const [payslip, setPayslip] = useState<PayslipPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [workDate, setWorkDate] = useState(() => istDateKey(new Date()));
  const [status, setStatus] = useState<AttendanceStatus>('present');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([payrollApi.employee(id, month), payrollApi.payslip(id, month)])
      .then(([next, slip]) => {
        setDetail(next);
        setPayslip(slip);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [id, month]);

  useEffect(() => {
    load();
  }, [load]);

  async function onMark(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setActionError(null);
    try {
      await payrollApi.markAttendance(id, { workDate, status, note: note.trim() });
      setNote('');
      load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Attendance was not saved');
    } finally {
      setBusy(false);
    }
  }

  if (loading && !detail) return <PageLoading label="Loading employee" />;
  if (error && !detail) return <PageError error={error} onRetry={load} />;
  if (!detail || !payslip) return null;

  const { employee, attendance } = detail;

  return (
    <>
      <PageHeader title={`${employee.fullName} · ${employee.employeeCode}`} description={`${employee.designation || 'Staff'} · ${employee.department || 'No department'}`} />
      <p className="mb-4 text-sm">
        <Link href="/app/payroll" className="hos-link">
          Back to staff list
        </Link>
      </p>
      <Field label="Month">
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </Field>

      {actionError ? (
        <p role="alert" className="my-3 text-sm" style={{ color: 'var(--hos-fg-danger)' }}>
          {actionError}
        </p>
      ) : null}

      <section aria-labelledby="pay-att" className="my-6">
        <h2 id="pay-att" className="mb-2 text-base font-semibold">
          Attendance
        </h2>
        <form onSubmit={onMark} aria-label="Mark attendance" className="mb-4 grid max-w-3xl gap-3 md:grid-cols-2">
          <Field label="Date" required>
            <Input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} required />
          </Field>
          <Field label="Status" required>
            <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as AttendanceStatus)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Note">
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
          </Field>
          <div>
            <Button type="submit" disabled={busy}>
              Mark attendance
            </Button>
          </div>
        </form>
        <DataTable
          data={attendance}
          getRowId={(row) => row.id}
          emptyMessage="No attendance marked for this month."
          columns={[
            { id: 'date', header: 'Date', accessor: (row) => row.workDate },
            { id: 'status', header: 'Status', accessor: (row) => STATUS_LABEL[row.status] },
            { id: 'note', header: 'Note', accessor: (row) => row.note || '—' },
          ]}
        />
      </section>

      <section aria-labelledby="pay-slip">
        <h2 id="pay-slip" className="mb-2 text-base font-semibold">
          Payslip preview · {payslip.month}
        </h2>
        <p role="note" className="mb-3 max-w-3xl rounded border p-3 text-sm" style={{ borderColor: 'var(--hos-fg-warning, currentColor)' }}>
          Preview only. Statutory rates are placeholders until the payroll research batch is confirmed. Do not use for salary payment.
        </p>
        <dl className="grid max-w-3xl grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <dt>Days in month</dt>
          <dd>{payslip.daysInMonth}</dd>
          <dt>Paid days</dt>
          <dd>{payslip.paidDays}</dd>
          <dt>Loss of pay days</dt>
          <dd>{payslip.lopDays}</dd>
          <dt>Basic</dt>
          <dd>{rupees(payslip.basicPaise)}</dd>
          <dt>Earned (gross)</dt>
          <dd>{rupees(payslip.grossPaise)}</dd>
          <dt>PF employee (12%, placeholder)</dt>
          <dd>{rupees(payslip.pfEmployeePaise)}</dd>
          <dt>ESI employee (0.75%, placeholder)</dt>
          <dd>{rupees(payslip.esiEmployeePaise)}</dd>
          <dt>Professional tax</dt>
          <dd>{rupees(payslip.professionalTaxPaise)} (not modelled)</dd>
          <dt>Net (preview)</dt>
          <dd>{rupees(payslip.netPaise)}</dd>
        </dl>
        <ul className="mt-3 list-disc pl-5 text-sm">
          {payslip.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </section>
    </>
  );
}
