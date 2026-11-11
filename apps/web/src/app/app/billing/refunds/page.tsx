'use client';

import type { RefundDto } from '@hos/shared';
import { formatDate, formatINR } from '@hos/shared';
import { DataTable, PageHeader } from '@hos/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { billingApi } from '@/features/clinical/billing/api';
import { PageError, PageLoading } from '@/features/common/LoadState';

export default function RefundsPage() {
  const [rows, setRows] = useState<RefundDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setLoading(true);
    billingApi
      .refunds()
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

  if (loading) return <PageLoading />;
  if (error) return <PageError error={error} onRetry={load} />;

  return (
    <>
      <PageHeader title="Refunds" description="Bill and deposit refunds recorded at this location." />
      <DataTable
        data={rows}
        getRowId={(row) => row.id}
        emptyMessage="No refunds yet."
        columns={[
          { id: 'number', header: 'Number', accessor: (row) => row.number },
          { id: 'amount', header: 'Amount', accessor: (row) => formatINR(row.amountPaise) },
          { id: 'mode', header: 'Mode', accessor: (row) => row.mode },
          { id: 'reason', header: 'Reason', accessor: (row) => row.reason },
          { id: 'when', header: 'Date', accessor: (row) => formatDate(row.createdAt) },
          {
            id: 'bill',
            header: 'Bill',
            accessor: () => '',
            render: (row) =>
              row.billId ? (
                <Link href={`/app/billing/bills/${row.billId}`} className="hos-link">
                  Open bill
                </Link>
              ) : (
                'Deposit'
              ),
          },
        ]}
      />
    </>
  );
}
