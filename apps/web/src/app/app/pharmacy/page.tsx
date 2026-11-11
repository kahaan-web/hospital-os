'use client';

import { DataTable, PageHeader } from '@hos/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { pharmacyApi } from '@/features/clinical/pharmacy/api';
import { PharmacyNav } from '@/features/clinical/pharmacy/PharmacyNav';

interface QueueRow {
  id: string;
  number: string;
  patientName: string;
  uhid: string;
  encounterNumber: string;
  drug: string;
  qty: string;
  href: string;
}

export default function PharmacyQueuePage() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setLoading(true);
    pharmacyApi
      .queue()
      .then((items) => {
        const next: QueueRow[] = [];
        for (const item of items) {
          for (const line of item.order.items) {
            if (line.status !== 'pending' && line.status !== 'in_progress') continue;
            const params = new URLSearchParams({
              orderId: item.order.id,
              orderItemId: line.id,
              patientId: item.order.patientId,
              encounterId: item.order.encounterId,
              generic: line.genericCode ?? '',
              qty: String(Math.max(1, (line.quantity ?? 1) - line.fulfilledQty)),
            });
            next.push({
              id: line.id,
              number: item.order.number,
              patientName: item.patientName,
              uhid: item.uhid,
              encounterNumber: item.encounterNumber,
              drug: [line.drugName, line.strength, line.frequencyCode].filter(Boolean).join(' · '),
              qty: String(line.quantity ?? '—'),
              href: `/app/pharmacy/sales/new?${params}`,
            });
          }
        }
        setRows(next);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && rows.length === 0) return <PageLoading label="Loading the prescription queue" />;
  if (error) return <PageError error={error} onRetry={load} />;

  return (
    <>
      <PharmacyNav />
      <PageHeader title="Prescription queue" description="Open medicine orders waiting to be dispensed." />
      <DataTable
        data={rows}
        getRowId={(row) => row.id}
        emptyMessage="No open prescriptions. Use Counter sale for a walk-in."
        columns={[
          { id: 'number', header: 'Order', accessor: (row) => row.number },
          { id: 'patient', header: 'Patient', accessor: (row) => `${row.patientName} · ${row.uhid}` },
          { id: 'visit', header: 'Visit', accessor: (row) => row.encounterNumber },
          { id: 'drug', header: 'Medicine', accessor: (row) => row.drug || '—' },
          { id: 'qty', header: 'Qty', accessor: (row) => row.qty },
          {
            id: 'dispense',
            header: '',
            accessor: () => '',
            render: (row) => (
              <Link href={row.href} className="hos-link">
                Dispense
              </Link>
            ),
          },
        ]}
      />
    </>
  );
}
