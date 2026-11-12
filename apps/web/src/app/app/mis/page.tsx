'use client';

import { createTranslator, formatDateTime, formatINR, formatNumberIN } from '@hos/shared';
import { PageHeader, StatCard } from '@hos/ui';
import { useCallback, useEffect, useState } from 'react';
import { misApi, type MisKpis } from '@/features/clinical/mvp/api';
import { PageError, PageLoading } from '@/features/common/LoadState';

const t = createTranslator('en');

export default function MisDashboardPage() {
  const [kpis, setKpis] = useState<MisKpis | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    misApi.kpis().then(setKpis).catch(setError);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error && !kpis) return <PageError error={error} onRetry={load} />;
  if (!kpis) return <PageLoading label="Loading dashboard…" />;

  return (
    <>
      <PageHeader title={t('clinical.mis.title')} description={t('clinical.mis.subtitle')} />
      <p className="mb-4 text-sm" style={{ color: 'var(--hos-fg-muted)' }}>
        {`As of ${formatDateTime(kpis.asOf)}`}
      </p>
      <h2 className="mb-2 text-base font-semibold">Revenue</h2>
      <section aria-label="Revenue" className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Billed today" value={formatINR(kpis.revenue.todayPaise)} />
        <StatCard label="Billed this month" value={formatINR(kpis.revenue.monthPaise)} hint={`${formatNumberIN(kpis.revenue.billsThisMonth)} final bills`} />
        <StatCard label="Credit outstanding" value={formatINR(kpis.revenue.outstandingPaise)} hint="Final credit bills, unpaid part" />
      </section>
      <h2 className="mb-2 text-base font-semibold">Admissions and beds</h2>
      <section aria-label="Admissions and beds" className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Bed occupancy" value={`${kpis.adt.occupancyPct}%`} hint={`${formatNumberIN(kpis.adt.occupiedBeds)} of ${formatNumberIN(kpis.adt.totalBeds)} beds`} />
        <StatCard label="In-patients now" value={formatNumberIN(kpis.adt.currentInpatients)} />
        <StatCard label="Admissions this month" value={formatNumberIN(kpis.adt.admissionsThisMonth)} />
      </section>
      <h2 className="mb-2 text-base font-semibold">Stores</h2>
      <section aria-label="Stores" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Stock lines" value={formatNumberIN(kpis.stores.stockLines)} />
        <StatCard label="Units on hand" value={formatNumberIN(kpis.stores.unitsOnHand)} />
        <StatCard label="Near expiry (90 days)" value={formatNumberIN(kpis.stores.nearExpiryLines)} />
      </section>
    </>
  );
}
