'use client';

import { DOC_TYPE_LABEL, formatINR } from '@hos/shared';
import type { DepositDto, OpBillDto } from '@hos/shared';
import { Button, Field, Input, MoneyInput, PageHeader, Select } from '@hos/ui';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { billingApi } from '@/features/clinical/billing/api';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { ApiError } from '@/lib/api';

const MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'neft', label: 'NEFT' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'credit', label: 'Credit' },
];

export default function BillPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [bill, setBill] = useState<OpBillDto | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState('cash');
  const [deposits, setDeposits] = useState<DepositDto[]>([]);
  const [depositId, setDepositId] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [instrument, setInstrument] = useState('');
  const [concession, setConcession] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [refundAmount, setRefundAmount] = useState<number | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    billingApi
      .bill(id)
      .then((row) => {
        setBill(row);
        setAmount(row.balancePaise > 0 ? row.balancePaise : null);
        setError(null);
        return billingApi.deposits(row.patientId).then(setDeposits).catch(() => setDeposits([]));
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (action: () => Promise<OpBillDto>, ok: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const next = await action();
      setBill(next);
      setAmount(next.balancePaise > 0 ? next.balancePaise : null);
      setNotice(ok);
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : 'That action failed');
    } finally {
      setBusy(false);
    }
  };

  if (loading && !bill) return <PageLoading />;
  if (error || !bill) return <PageError error={error ?? new Error('Bill not found')} onRetry={load} />;

  const lines = bill.lines ?? [];

  return (
    <>
      <PageHeader
        title={bill.number ?? 'Draft bill'}
        description={`${bill.patientName ?? 'Patient'} · ${bill.patientUhid ?? ''} · ${DOC_TYPE_LABEL[bill.docType]}`}
        actions={
          bill.status === 'final' ? (
            <a className="hos-link" href={billingApi.printUrl(bill.id)} target="_blank" rel="noreferrer">
              Print
            </a>
          ) : null
        }
      />
      {notice ? (
        <p role="status" className="mb-3">
          {notice}
        </p>
      ) : null}
      <p style={{ marginBottom: 'var(--hos-space-3)' }}>
        {bill.payClass} · {bill.status} · Total {formatINR(bill.totalPaise)} · Paid {formatINR(bill.paidPaise)} · Balance {formatINR(bill.balancePaise)}
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <caption style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Bill lines</caption>
        <thead>
          <tr>
            {['Description', 'Qty', 'Amount', 'Taxable', 'CGST', 'SGST'].map((heading) => (
              <th key={heading} scope="col" style={{ textAlign: 'left', borderBottom: '1px solid var(--hos-border-default)', padding: '0.4rem' }}>
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id}>
              <td style={{ padding: '0.4rem', borderBottom: '1px solid var(--hos-border-default)' }}>{line.description}</td>
              <td style={{ padding: '0.4rem', borderBottom: '1px solid var(--hos-border-default)' }}>{line.qty}</td>
              <td style={{ padding: '0.4rem', borderBottom: '1px solid var(--hos-border-default)' }}>{formatINR(line.amountPaise)}</td>
              <td style={{ padding: '0.4rem', borderBottom: '1px solid var(--hos-border-default)' }}>{formatINR(line.taxablePaise)}</td>
              <td style={{ padding: '0.4rem', borderBottom: '1px solid var(--hos-border-default)' }}>{formatINR(line.cgstPaise)}</td>
              <td style={{ padding: '0.4rem', borderBottom: '1px solid var(--hos-border-default)' }}>{formatINR(line.sgstPaise)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: 'var(--hos-space-3)' }}>
        Discount {formatINR(bill.discountPaise)} · CGST {formatINR(bill.cgstPaise)} · SGST {formatINR(bill.sgstPaise)} · Round off {formatINR(bill.roundOffPaise)} · Total {formatINR(bill.totalPaise)}
      </p>
      <p style={{ color: 'var(--hos-fg-muted)', fontSize: 13 }}>GST rates are configuration. Confirm with your CA.</p>

      {bill.status === 'draft' ? (
        <div className="mt-4 grid max-w-xl gap-4">
          <Button type="button" disabled={busy} onClick={() => void run(() => billingApi.finalise(bill.id), 'Bill finalised.')}>
            Finalise
          </Button>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (concession == null) return;
              void run(() => billingApi.concede(bill.id, { amountPaise: concession, reason }), 'Concession recorded.');
            }}
          >
            <Field label="Concession" htmlFor="concession">
              <MoneyInput id="concession" valuePaise={concession} onChangePaise={setConcession} />
            </Field>
            <Field label="Reason" htmlFor="concession-reason">
              <Input id="concession-reason" value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} />
            </Field>
            <Button type="submit" variant="secondary" disabled={busy}>
              Add concession
            </Button>
          </form>
        </div>
      ) : null}

      {bill.status === 'final' && bill.balancePaise > 0 ? (
        <form
          className="mt-4 grid max-w-xl gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (amount == null) return;
            void run(
              () =>
                billingApi.settle(bill.id, {
                  mode,
                  amountPaise: amount,
                  depositId: mode === 'deposit' ? depositId : undefined,
                  instrumentRef: instrument || undefined,
                }),
              'Payment recorded.',
            );
          }}
        >
          <Field label="Mode" htmlFor="settle-mode">
            <Select id="settle-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
              {MODES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          {mode === 'deposit' ? (
            <Field label="Deposit" htmlFor="settle-deposit">
              <Select id="settle-deposit" value={depositId} onChange={(e) => setDepositId(e.target.value)} required>
                <option value="">Choose</option>
                {deposits
                  .filter((row) => row.balancePaise > 0)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.number} · {formatINR(row.balancePaise)}
                    </option>
                  ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Amount" htmlFor="settle-amount">
            <MoneyInput id="settle-amount" valuePaise={amount} onChangePaise={setAmount} />
          </Field>
          <Field label="Reference" htmlFor="settle-ref" hint="UTR, card or cheque reference when you have one.">
            <Input id="settle-ref" value={instrument} onChange={(e) => setInstrument(e.target.value)} maxLength={40} />
          </Field>
          <Button type="submit" disabled={busy || amount == null}>
            Take payment
          </Button>
        </form>
      ) : null}

      {bill.status === 'final' && bill.paidPaise > 0 ? (
        <form
          className="mt-4 grid max-w-xl gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (refundAmount == null) return;
            void run(
              () => billingApi.refund(bill.id, { amountPaise: refundAmount, reason: refundReason, mode: 'cash' }),
              'Refund recorded.',
            );
          }}
        >
          <Field label="Refund" htmlFor="refund-amount">
            <MoneyInput id="refund-amount" valuePaise={refundAmount} onChangePaise={setRefundAmount} />
          </Field>
          <Field label="Reason" htmlFor="refund-reason">
            <Input id="refund-reason" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} required minLength={3} />
          </Field>
          <Button type="submit" variant="secondary" disabled={busy}>
            Refund
          </Button>
        </form>
      ) : null}
    </>
  );
}
