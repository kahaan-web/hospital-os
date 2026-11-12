'use client';

import { formatINR } from '@hos/shared';
import type { CashSummaryDto, DepositRegisterDto, OpBillingVisitStatisticsDto, OutstandingReportDto, RevenueReportDto } from '@hos/shared';
import { Button, DataTable, Field, Input, PageHeader } from '@hos/ui';
import { useCallback, useEffect, useState } from 'react';
import { billingApi } from '@/features/clinical/billing/api';
import { PageLoading } from '@/features/common/LoadState';

function todayIst(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

interface Snapshot {
  cash: CashSummaryDto | null;
  revenue: RevenueReportDto | null;
  outstanding: OutstandingReportDto | null;
  deposits: DepositRegisterDto | null;
  visits: OpBillingVisitStatisticsDto | null;
}

const ok = <T,>(r: PromiseSettledResult<T>): T | null => (r.status === 'fulfilled' ? r.value : null);

export default function BillingSummaryPage() {
  const today = todayIst();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    void Promise.allSettled([
      billingApi.cash(from, to),
      billingApi.revenue(from, to),
      billingApi.outstanding(),
      billingApi.depositRegister(),
      billingApi.visitStatistics(from, to),
    ]).then(([cash, revenue, outstanding, deposits, visits]) => {
      setSnap({ cash: ok(cash), revenue: ok(revenue), outstanding: ok(outstanding), deposits: ok(deposits), visits: ok(visits) });
      setLoading(false);
    });
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !snap) return <PageLoading label="Loading billing summary" />;

  const cashIn = snap?.cash?.rows.filter((r) => r.direction !== 'out').reduce((s, r) => s + r.amountPaise, 0) ?? 0;
  const cashOut = snap?.cash?.rows.filter((r) => r.direction === 'out').reduce((s, r) => s + r.amountPaise, 0) ?? 0;
  const depositHeld = snap?.deposits?.rows.reduce((s, r) => s + r.balancePaise, 0) ?? 0;

  const byMode = new Map<string, { inPaise: number; outPaise: number }>();
  for (const row of snap?.cash?.rows ?? []) {
    const cur = byMode.get(row.mode) ?? { inPaise: 0, outPaise: 0 };
    if (row.direction === 'out') cur.outPaise += row.amountPaise;
    else cur.inPaise += row.amountPaise;
    byMode.set(row.mode, cur);
  }
  const modeRows = [...byMode.entries()].map(([mode, v]) => ({ mode, ...v }));

  const tiles: { label: string; value: string; hint?: string }[] = [
    { label: 'Collected (in)', value: formatINR(cashIn) },
    { label: 'Refunded (out)', value: formatINR(cashOut) },
    { label: 'Net cash book', value: formatINR(snap?.cash?.netInPaise ?? 0) },
    { label: 'Revenue billed', value: snap?.revenue ? formatINR(snap.revenue.totalPaise) : 'n/a' },
    { label: 'Patient outstanding', value: snap?.outstanding ? formatINR(snap.outstanding.balancePaise) : 'n/a', hint: snap?.outstanding ? `${snap.outstanding.rows.length} open bills` : undefined },
    { label: 'Deposits held', value: snap?.deposits ? formatINR(depositHeld) : 'n/a' },
    { label: 'OPD visits', value: snap?.visits ? String(snap.visits.opdVisits) : 'n/a', hint: snap?.visits ? `${snap.visits.opBills} OP bills` : 'Medium tier and above' },
  ];

  return (
    <>
      <PageHeader
        title="OP billing summary"
        description="Collections, revenue, outstanding and deposits at a glance, built from the existing OP billing reports."
        actions={
          <Button type="button" variant="secondary" onClick={() => window.print()}>
            Print
          </Button>
        }
      />
      <form
        className="mb-4 grid max-w-xl gap-3 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <Field label="From" htmlFor="sum-from">
          <Input id="sum-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
        </Field>
        <Field label="To" htmlFor="sum-to">
          <Input id="sum-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} required />
        </Field>
        <div className="flex items-end">
          <Button type="submit" disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
        </div>
      </form>
      <ul aria-label="Key figures" className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" style={{ listStyle: 'none', padding: 0 }}>
        {tiles.map((tile) => (
          <li key={tile.label} style={{ border: '1px solid var(--hos-border-default)', borderRadius: 'var(--hos-radius-md, 8px)', padding: 'var(--hos-space-3)' }}>
            <div style={{ color: 'var(--hos-fg-muted)', fontSize: 'var(--hos-text-sm)' }}>{tile.label}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 600 }}>{tile.value}</div>
            {tile.hint ? <div style={{ color: 'var(--hos-fg-muted)', fontSize: 'var(--hos-text-sm)' }}>{tile.hint}</div> : null}
          </li>
        ))}
      </ul>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 'var(--hos-space-2)' }}>Collections by payment mode</h2>
      <DataTable
        data={modeRows}
        getRowId={(row) => row.mode}
        emptyMessage="No cash-book entries in this period."
        columns={[
          { id: 'mode', header: 'Mode', accessor: (row) => row.mode },
          { id: 'in', header: 'Received', accessor: (row) => formatINR(row.inPaise) },
          { id: 'out', header: 'Refunded', accessor: (row) => formatINR(row.outPaise) },
          { id: 'net', header: 'Net', accessor: (row) => formatINR(row.inPaise - row.outPaise) },
        ]}
      />
    </>
  );
}
