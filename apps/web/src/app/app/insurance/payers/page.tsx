'use client';

import { Badge, Button, DataTable, Field, Input, PageHeader, Select } from '@hos/ui';
import { useCallback, useEffect, useState } from 'react';
import { InsuranceNav } from '@/features/clinical/insurance/InsuranceNav';
import { insuranceApi, type PayerRow, type PayerType } from '@/features/clinical/insurance/api';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { ApiError } from '@/lib/api';

const TYPE_LABEL: Record<PayerType, string> = { insurer: 'Insurer', tpa: 'TPA', corporate: 'Corporate', government: 'Government scheme' };

export default function InsurancePayersPage() {
  const [rows, setRows] = useState<PayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [payerType, setPayerType] = useState<PayerType>('insurer');
  const [copayPct, setCopayPct] = useState('0');
  const [creditDays, setCreditDays] = useState('30');

  const load = useCallback(() => {
    setLoading(true);
    insuranceApi
      .payers()
      .then((next) => {
        setRows(next);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    setBusy(true);
    setFormError('');
    try {
      const created = await insuranceApi.createPayer({
        name: name.trim(),
        payerType,
        copayPct: Number(copayPct),
        creditDays: Number(creditDays),
      });
      setRows((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name, 'en-IN')));
      setName('');
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save the payer');
    } finally {
      setBusy(false);
    }
  };

  if (loading && rows.length === 0 && !error) return <PageLoading label="Loading payers…" />;
  if (error) return <PageError error={error} onRetry={load} />;

  return (
    <>
      <PageHeader title="Payers" description="Insurers, TPAs, corporates and government schemes you bill." />
      <InsuranceNav />
      {formError ? (
        <p role="alert" className="mb-3 text-sm" style={{ color: 'var(--hos-fg-danger)' }}>
          {formError}
        </p>
      ) : null}
      <form
        className="mb-6 grid max-w-3xl gap-3 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <Field label="Payer name" required>
          <Input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} />
        </Field>
        <Field label="Type" required>
          <Select value={payerType} onChange={(event) => setPayerType(event.target.value as PayerType)}>
            {Object.entries(TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Co-pay (%)">
          <Input inputMode="numeric" value={copayPct} onChange={(event) => setCopayPct(event.target.value)} />
        </Field>
        <Field label="Credit days">
          <Input inputMode="numeric" value={creditDays} onChange={(event) => setCreditDays(event.target.value)} />
        </Field>
        <div>
          <Button type="submit" disabled={busy || name.trim().length < 2}>
            Add payer
          </Button>
        </div>
      </form>
      <DataTable
        data={rows}
        getRowId={(row) => row.id}
        emptyMessage="No payers yet. Add the insurers and TPAs you work with."
        columns={[
          { id: 'name', header: 'Payer', accessor: (row) => row.name },
          { id: 'type', header: 'Type', accessor: (row) => TYPE_LABEL[row.payerType] },
          { id: 'copay', header: 'Co-pay', accessor: (row) => `${row.copayPct}%` },
          { id: 'credit', header: 'Credit days', accessor: (row) => row.creditDays },
          {
            id: 'active',
            header: 'Status',
            accessor: (row) => (row.active ? 'Active' : 'Inactive'),
            render: (row) => <Badge tone={row.active ? 'success' : 'neutral'}>{row.active ? 'Active' : 'Inactive'}</Badge>,
          },
        ]}
      />
    </>
  );
}
