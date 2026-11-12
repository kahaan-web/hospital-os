'use client';

import { DataTable, Button, Field, Input, PageHeader } from '@hos/ui';
import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { type EmployeeRow, payrollApi, rupees } from '@/features/clinical/payroll/api';

const EMPTY = { employeeCode: '', fullName: '', department: '', designation: '', basic: '', joinedOn: '' };

export default function PayrollStaffPage() {
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    payrollApi
      .employees()
      .then((items) => {
        setRows(items);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      await payrollApi.createEmployee({
        employeeCode: form.employeeCode.trim(),
        fullName: form.fullName.trim(),
        department: form.department.trim(),
        designation: form.designation.trim(),
        monthlyBasicPaise: Math.round(Number(form.basic || 0) * 100),
        joinedOn: form.joinedOn || undefined,
      });
      setForm(EMPTY);
      setAdding(false);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save the employee');
    } finally {
      setBusy(false);
    }
  }

  if (loading && rows.length === 0) return <PageLoading label="Loading staff list" />;
  if (error && rows.length === 0) return <PageError error={error} onRetry={load} />;

  return (
    <>
      <PageHeader
        title="Payroll & attendance"
        description="Staff list, daily attendance and a monthly payslip preview. Preview only: statutory rates are placeholders."
        actions={
          <Button type="button" variant="secondary" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
            {adding ? 'Close form' : 'Add employee'}
          </Button>
        }
      />
      {adding ? (
        <form onSubmit={onCreate} aria-label="Add employee" className="mb-6 grid max-w-3xl gap-3 md:grid-cols-2">
          <Field label="Employee code" required>
            <Input value={form.employeeCode} onChange={(e) => setForm({ ...form, employeeCode: e.target.value })} required maxLength={20} />
          </Field>
          <Field label="Full name" required>
            <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required maxLength={120} />
          </Field>
          <Field label="Department">
            <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} maxLength={60} />
          </Field>
          <Field label="Designation">
            <Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} maxLength={60} />
          </Field>
          <Field label="Monthly basic (₹)" required>
            <Input inputMode="decimal" value={form.basic} onChange={(e) => setForm({ ...form, basic: e.target.value })} required />
          </Field>
          <Field label="Joined on">
            <Input type="date" value={form.joinedOn} onChange={(e) => setForm({ ...form, joinedOn: e.target.value })} />
          </Field>
          {formError ? (
            <p role="alert" className="text-sm md:col-span-2" style={{ color: 'var(--hos-fg-danger)' }}>
              {formError}
            </p>
          ) : null}
          <div>
            <Button type="submit" disabled={busy}>
              Save employee
            </Button>
          </div>
        </form>
      ) : null}
      <DataTable
        data={rows}
        getRowId={(row) => row.id}
        emptyMessage="No staff yet. Add the first employee to start attendance."
        columns={[
          {
            id: 'code',
            header: 'Code',
            accessor: (row) => row.employeeCode,
            render: (row) => (
              <Link href={`/app/payroll/${row.id}`} className="hos-link">
                {row.employeeCode}
              </Link>
            ),
          },
          { id: 'name', header: 'Name', accessor: (row) => row.fullName },
          { id: 'dept', header: 'Department', accessor: (row) => row.department || '—' },
          { id: 'desig', header: 'Designation', accessor: (row) => row.designation || '—' },
          { id: 'basic', header: 'Monthly basic', accessor: (row) => rupees(row.monthlyBasicPaise) },
        ]}
      />
    </>
  );
}
