'use client';

import type { OpBillDto, UnbilledEncounterDto } from '@hos/shared';
import { DOC_TYPE_LABEL, formatINR } from '@hos/shared';
import { Button, DataTable, PageHeader, Select } from '@hos/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { billingApi } from '@/features/clinical/billing/api';
import { ApiError } from '@/lib/api';

export default function CashierDeskPage() {
  const router = useRouter();
  const [rows, setRows] = useState<UnbilledEncounterDto[]>([]);
  const [bills, setBills] = useState<OpBillDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [payClass, setPayClass] = useState<'cash' | 'credit' | 'free'>('cash');
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([billingApi.worklist(), billingApi.bills()])
      .then(([work, page]) => {
        setRows(work);
        setBills(page.items);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const prepare = async (encounterId: string) => {
    setBusy(encounterId);
    setFormError(null);
    try {
      const bill = await billingApi.createBill({ encounterId, payClass });
      router.push(`/app/billing/bills/${bill.id}`);
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Could not prepare the bill');
      setBusy(null);
    }
  };

  if (loading && rows.length === 0 && bills.length === 0) return <PageLoading />;
  if (error && rows.length === 0) return <PageError error={error} onRetry={load} />;

  return (
    <>
      <PageHeader title="Cashier desk" description="Unbilled OP visits at this location. GST on a bill is calculated when the bill is prepared." />
      <div className="mb-4 flex max-w-xs flex-col gap-2">
        <label htmlFor="pay-class">Pay class</label>
        <Select id="pay-class" value={payClass} onChange={(e) => setPayClass(e.target.value as 'cash' | 'credit' | 'free')}>
          <option value="cash">Cash</option>
          <option value="credit">Credit</option>
          <option value="free">Free</option>
        </Select>
      </div>
      {formError ? (
        <p role="alert" className="hos-field__error">
          {formError}
        </p>
      ) : null}
      <DataTable
        data={rows}
        getRowId={(row) => row.encounterId}
        emptyMessage="No unbilled OP charges at this location."
        columns={[
          { id: 'visit', header: 'Visit', accessor: (row) => row.encounterNumber },
          { id: 'patient', header: 'Patient', accessor: (row) => row.patientName },
          { id: 'uhid', header: 'UHID', accessor: (row) => row.uhid },
          { id: 'charges', header: 'Charges', accessor: (row) => row.chargeCount },
          { id: 'amount', header: 'Amount', accessor: (row) => formatINR(row.amountPaise) },
          {
            id: 'act',
            header: '',
            accessor: () => '',
            render: (row) => (
              <Button type="button" disabled={busy === row.encounterId} onClick={() => void prepare(row.encounterId)}>
                {busy === row.encounterId ? 'Preparing…' : 'Prepare bill'}
              </Button>
            ),
          },
        ]}
      />
      <h2 style={{ fontSize: '1.05rem', margin: '1.5rem 0 0.75rem' }}>Recent bills</h2>
      <DataTable
        data={bills}
        getRowId={(row) => row.id}
        emptyMessage="No bills yet."
        columns={[
          { id: 'number', header: 'Number', accessor: (row) => row.number ?? 'Draft' },
          { id: 'patient', header: 'Patient', accessor: (row) => row.patientName ?? row.patientUhid ?? '' },
          { id: 'doc', header: 'Document', accessor: (row) => DOC_TYPE_LABEL[row.docType] },
          { id: 'status', header: 'Status', accessor: (row) => row.status },
          { id: 'total', header: 'Total', accessor: (row) => formatINR(row.totalPaise) },
          { id: 'balance', header: 'Balance', accessor: (row) => formatINR(row.balancePaise) },
          {
            id: 'open',
            header: '',
            accessor: () => '',
            render: (row) => (
              <Link href={`/app/billing/bills/${row.id}`} className="hos-link">
                Open
              </Link>
            ),
          },
        ]}
      />
    </>
  );
}
