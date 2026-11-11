'use client';

import type { DepositDto, PatientSummaryDto } from '@hos/shared';
import { formatDate, formatINR } from '@hos/shared';
import { Button, DataTable, Field, Input, MoneyInput, PageHeader, Select } from '@hos/ui';
import { useCallback, useEffect, useState } from 'react';
import { billingApi } from '@/features/clinical/billing/api';
import { PatientPicker } from '@/features/clinical/common/PatientPicker';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { ApiError } from '@/lib/api';

export default function DepositsPage() {
  const [rows, setRows] = useState<DepositDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [patient, setPatient] = useState<PatientSummaryDto | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [mode, setMode] = useState<'cash' | 'upi' | 'card' | 'cheque' | 'neft'>('cash');
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    billingApi
      .deposits()
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

  if (loading && rows.length === 0) return <PageLoading />;
  if (error && rows.length === 0) return <PageError error={error} onRetry={load} />;

  return (
    <>
      <PageHeader title="Deposits" description="Money held for a patient before the bill is settled." />
      <form
        className="mb-6 grid max-w-xl gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!patient || amount == null) return;
          setBusy(true);
          setNotice(null);
          billingApi
            .createDeposit({ patientId: patient.id, amountPaise: amount, mode })
            .then(() => {
              setNotice(`Deposit accepted for ${patient.fullName}.`);
              setAmount(null);
              load();
            })
            .catch((err: unknown) => setNotice(err instanceof ApiError ? err.message : 'Could not accept the deposit'))
            .finally(() => setBusy(false));
        }}
      >
        <Field label="Patient" htmlFor="deposit-patient">
          <PatientPicker onValueChange={setPatient} />
        </Field>
        <Field label="Amount" htmlFor="deposit-amount">
          <MoneyInput id="deposit-amount" valuePaise={amount} onChangePaise={setAmount} />
        </Field>
        <Field label="Mode" htmlFor="deposit-mode">
          <Select id="deposit-mode" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="card">Card</option>
            <option value="cheque">Cheque</option>
            <option value="neft">NEFT</option>
          </Select>
        </Field>
        <Button type="submit" disabled={busy || !patient || amount == null}>
          Accept deposit
        </Button>
        {notice ? <p role="status">{notice}</p> : null}
      </form>
      <DataTable
        data={rows}
        getRowId={(row) => row.id}
        emptyMessage="No deposits at this location."
        columns={[
          { id: 'number', header: 'Number', accessor: (row) => row.number },
          { id: 'patient', header: 'Patient', accessor: (row) => row.patientName ?? '' },
          { id: 'uhid', header: 'UHID', accessor: (row) => row.patientUhid ?? '' },
          { id: 'amount', header: 'Amount', accessor: (row) => formatINR(row.amountPaise) },
          { id: 'balance', header: 'Balance', accessor: (row) => formatINR(row.balancePaise) },
          { id: 'status', header: 'Status', accessor: (row) => row.status },
          { id: 'when', header: 'Date', accessor: (row) => formatDate(row.createdAt) },
        ]}
      />
      <RefundDeposit rows={rows} onDone={load} />
    </>
  );
}

function RefundDeposit({ rows, onDone }: { rows: DepositDto[]; onDone: () => void }) {
  const open = rows.filter((row) => row.balancePaise > 0);
  const [id, setId] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  if (open.length === 0) return null;

  return (
    <form
      className="mt-6 grid max-w-xl gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!id || amount == null) return;
        billingApi
          .refundDeposit(id, { amountPaise: amount, reason, mode: 'cash' })
          .then(() => {
            setNotice('Deposit refund recorded.');
            setReason('');
            setAmount(null);
            onDone();
          })
          .catch((err: unknown) => setNotice(err instanceof ApiError ? err.message : 'Could not refund the deposit'));
      }}
    >
      <h2 style={{ fontSize: '1.05rem' }}>Refund a deposit</h2>
      <Field label="Deposit" htmlFor="refund-deposit">
        <Select id="refund-deposit" value={id} onChange={(e) => setId(e.target.value)} required>
          <option value="">Choose</option>
          {open.map((row) => (
            <option key={row.id} value={row.id}>
              {row.number} · {row.patientName} · {formatINR(row.balancePaise)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Amount" htmlFor="refund-deposit-amount">
        <MoneyInput id="refund-deposit-amount" valuePaise={amount} onChangePaise={setAmount} />
      </Field>
      <Field label="Reason" htmlFor="refund-deposit-reason">
        <Input id="refund-deposit-reason" value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} />
      </Field>
      <Button type="submit" variant="secondary">
        Refund deposit
      </Button>
      {notice ? <p role="status">{notice}</p> : null}
    </form>
  );
}
