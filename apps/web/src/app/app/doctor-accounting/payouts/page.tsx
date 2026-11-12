'use client';

import { formatDate, formatINR } from '@hos/shared';
import { Badge, Button, DataTable, Field, Input, MoneyInput, PageHeader, Select } from '@hos/ui';
import { useCallback, useEffect, useState } from 'react';
import { DoctorAccountingNav } from '@/features/clinical/doctor-accounting/DoctorAccountingNav';
import { doctorAccountingApi, type DoctorOption, type PayMode, type PayoutRow } from '@/features/clinical/doctor-accounting/api';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { ApiError } from '@/lib/api';

const MODE_LABEL: Record<PayMode, string> = { bank_transfer: 'Bank transfer', upi: 'UPI', cheque: 'Cheque', cash: 'Cash' };

export default function DoctorPayoutsPage() {
  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [filterDoctor, setFilterDoctor] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [doctorId, setDoctorId] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [grossPaise, setGrossPaise] = useState<number | null>(null);
  const [sharePaise, setSharePaise] = useState<number | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [mode, setMode] = useState<PayMode>('bank_transfer');
  const [reference, setReference] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([doctorAccountingApi.payouts(filterDoctor || undefined), doctorAccountingApi.doctors()])
      .then(([nextRows, nextDoctors]) => {
        setRows(nextRows);
        setDoctors(nextDoctors);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [filterDoctor]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    if (grossPaise == null || sharePaise == null) return;
    setBusy(true);
    setFormError('');
    try {
      await doctorAccountingApi.createPayout({ doctorId, periodFrom, periodTo, grossPaise, sharePaise });
      setGrossPaise(null);
      setSharePaise(null);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save the payout');
    } finally {
      setBusy(false);
    }
  };

  const pay = async (id: string) => {
    setBusy(true);
    setFormError('');
    try {
      await doctorAccountingApi.markPaid(id, { mode, reference: reference.trim() });
      setPayingId(null);
      setReference('');
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not mark this payout paid');
    } finally {
      setBusy(false);
    }
  };

  if (loading && rows.length === 0 && !error) return <PageLoading label="Loading payouts…" />;
  if (error) return <PageError error={error} onRetry={load} />;

  const pendingPaise = rows.filter((row) => row.status === 'pending').reduce((sum, row) => sum + row.sharePaise, 0);

  return (
    <>
      <PageHeader
        title="Payout statement"
        description={`Doctor shares by period. Marking a payout paid only records the mode and reference; no money moves. Pending: ${formatINR(pendingPaise)}.`}
      />
      <DoctorAccountingNav />
      {formError ? (
        <p role="alert" className="mb-3 text-sm" style={{ color: 'var(--hos-fg-danger)' }}>
          {formError}
        </p>
      ) : null}
      <form
        className="mb-6 grid max-w-3xl gap-3 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <Field label="Doctor" required>
          <Select value={doctorId} onChange={(event) => setDoctorId(event.target.value)} required>
            <option value="">Select a doctor</option>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.name}
              </option>
            ))}
          </Select>
        </Field>
        <div />
        <Field label="Period from" required>
          <Input type="date" value={periodFrom} onChange={(event) => setPeriodFrom(event.target.value)} required />
        </Field>
        <Field label="Period to" required>
          <Input type="date" value={periodTo} onChange={(event) => setPeriodTo(event.target.value)} required />
        </Field>
        <Field label="Gross billed (₹)" required>
          <MoneyInput valuePaise={grossPaise} onChangePaise={setGrossPaise} required />
        </Field>
        <Field label="Doctor share (₹)" required>
          <MoneyInput valuePaise={sharePaise} onChangePaise={setSharePaise} required />
        </Field>
        <div>
          <Button type="submit" disabled={busy || !doctorId || !periodFrom || !periodTo || grossPaise == null || sharePaise == null}>
            Add payout
          </Button>
        </div>
      </form>
      <div className="mb-4 max-w-xs">
        <Field label="Show doctor">
          <Select value={filterDoctor} onChange={(event) => setFilterDoctor(event.target.value)}>
            <option value="">All doctors</option>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <DataTable
        data={rows}
        getRowId={(row) => row.id}
        emptyMessage="No payouts yet."
        columns={[
          { id: 'doctor', header: 'Doctor', accessor: (row) => row.doctorName },
          { id: 'period', header: 'Period', accessor: (row) => `${formatDate(row.periodFrom)} to ${formatDate(row.periodTo)}` },
          { id: 'gross', header: 'Gross', accessor: (row) => formatINR(row.grossPaise) },
          { id: 'share', header: 'Share', accessor: (row) => formatINR(row.sharePaise) },
          {
            id: 'status',
            header: 'Status',
            accessor: (row) => row.status,
            render: (row) => (
              <Badge tone={row.status === 'paid' ? 'success' : 'warning'}>
                {row.status === 'paid' ? `Paid ${row.paidOn ? formatDate(row.paidOn) : ''}` : 'Pending'}
              </Badge>
            ),
          },
          {
            id: 'action',
            header: '',
            accessor: () => '',
            render: (row) => {
              if (row.status === 'paid') return <span className="text-sm">{MODE_LABEL[row.payMode as PayMode] ?? row.payMode} {row.payRef}</span>;
              if (payingId !== row.id) {
                return (
                  <Button type="button" variant="secondary" onClick={() => setPayingId(row.id)}>
                    Mark paid
                  </Button>
                );
              }
              return (
                <div className="flex flex-wrap items-center gap-2">
                  <Select aria-label="Payment mode" value={mode} onChange={(event) => setMode(event.target.value as PayMode)}>
                    {Object.entries(MODE_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                  <Input aria-label="Reference" placeholder="Reference" value={reference} onChange={(event) => setReference(event.target.value)} />
                  <Button type="button" disabled={busy} onClick={() => void pay(row.id)}>
                    Confirm
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setPayingId(null)}>
                    Cancel
                  </Button>
                </div>
              );
            },
          },
        ]}
      />
    </>
  );
}
