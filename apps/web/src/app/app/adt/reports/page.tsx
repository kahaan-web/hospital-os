'use client';

import { createTranslator } from '@hos/shared';
import { Button, DataTable, Field, Input, PageHeader, Select } from '@hos/ui';
import { useState } from 'react';
import { adtApi } from '@/features/clinical/adt/api';
import { AdtLinks, formatWhen, statusLabel } from '@/features/clinical/adt/links';
import { PageError } from '@/features/common/LoadState';
import { ApiError } from '@/lib/api';

const t = createTranslator('en');

type Kind = 'admissions' | 'transfers' | 'discharges' | 'discharge-summaries';

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function monthStart() {
  return `${today().slice(0, 8)}01`;
}

export default function AdtReportsPage() {
  const [kind, setKind] = useState<Kind>('admissions');
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [columns, setColumns] = useState<{ id: string; header: string }[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const show = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await adtApi.report(kind, from, to);
      const items = result.items as unknown as Record<string, string | null>[];
      const keys = items[0] ? Object.keys(items[0]) : [];
      setColumns(keys.map((key) => ({ id: key, header: key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()) })));
      setRows(
        items.map((item, index) => {
          const out: Record<string, string> = { id: String(index) };
          for (const [key, value] of Object.entries(item)) {
            if (value == null || value === '') out[key] = '—';
            else if (key.endsWith('At') || key === 'at') out[key] = formatWhen(value);
            else if (key === 'status' || key === 'summaryStatus' || key === 'admissionType' || key === 'dischargeType') out[key] = statusLabel(value);
            else out[key] = value;
          }
          return out;
        }),
      );
      setLoaded(true);
    } catch (e) {
      setError(e instanceof ApiError ? e : e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AdtLinks current="/app/adt/reports" />
      <PageHeader title={t('clinical.adt.reports')} description="Admission, transfer and discharge registers." />
      <form
        className="mb-4 flex max-w-3xl flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void show();
        }}
      >
        <Field label="Register">
          <Select value={kind} onChange={(event) => setKind(event.target.value as Kind)} aria-label="Register">
            <option value="admissions">Admissions</option>
            <option value="transfers">Transfers</option>
            <option value="discharges">Discharges</option>
            <option value="discharge-summaries">Discharge summaries</option>
          </Select>
        </Field>
        <Field label={t('clinical.adt.from')} hint="DD/MM/YYYY">
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} required aria-label={t('clinical.adt.from')} />
        </Field>
        <Field label={t('clinical.adt.to')} hint="DD/MM/YYYY">
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} required aria-label={t('clinical.adt.to')} />
        </Field>
        <Button type="submit" disabled={busy}>
          {t('clinical.adt.show')}
        </Button>
      </form>
      {error ? <PageError error={error} onRetry={() => void show()} /> : null}
      {loaded ? (
        <DataTable
          data={rows}
          getRowId={(row) => row.id ?? ''}
          pageSize={50}
          emptyMessage={t('clinical.adt.emptyReport')}
          columns={columns.map((column) => ({
            id: column.id,
            header: column.header,
            accessor: (row: Record<string, string>) => row[column.id] ?? '—',
          }))}
        />
      ) : null}
    </>
  );
}
