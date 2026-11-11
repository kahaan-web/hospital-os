'use client';

import { createTranslator, istDateKey } from '@hos/shared';
import type { ClinicalNoteDto, ClinicalOrderDto, MarDose, VitalSignsDto } from '@hos/shared';
import { Badge, Button, DataTable, Dialog, Field, PageHeader, Select, Tabs, Textarea } from '@hos/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { nursingApi } from '@/features/clinical/nursing/api';
import { PageError, PageLoading } from '@/features/common/LoadState';

const t = createTranslator('en');

type OrderRow = ClinicalOrderDto['items'][0] & { kind: string };

function VitalsPanel({ rows }: { rows: VitalSignsDto[] }) {
  const points = rows
    .map((r) => ({ t: new Date(r.recordedAt).getTime(), pulse: r.pulse }))
    .filter((p) => p.pulse != null) as { t: number; pulse: number }[];
  const path = useMemo(() => {
    if (points.length < 2) return '';
    const xs = points.map((p) => p.t);
    const min = Math.min(...xs);
    const max = Math.max(...xs);
    const span = max - min || 1;
    const w = 320;
    const h = 80;
    return points
      .map((p, i) => {
        const x = ((p.t - min) / span) * w;
        const y = h - (Math.min(140, Math.max(40, p.pulse)) - 40) * (h / 100);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }, [points]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hos-space-4)' }}>
      {points.length >= 2 ? (
        <figure aria-label="Pulse trend chart">
          <svg width="340" height="96" role="img">
            <title>Pulse rate over time</title>
            <path d={path} fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        </figure>
      ) : (
        <p style={{ color: 'var(--hos-fg-muted)', fontSize: 'var(--hos-text-sm)' }}>
          Record at least two vitals entries to see the pulse trend.
        </p>
      )}
      <DataTable
        data={rows}
        getRowId={(r) => r.id}
        pageSize={25}
        emptyMessage="No vitals recorded yet"
        columns={[
          {
            id: 'when',
            header: 'Recorded',
            accessor: (r) => new Date(r.recordedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
          },
          {
            id: 'bp',
            header: 'BP',
            accessor: (r) => (r.bpSystolic && r.bpDiastolic ? `${r.bpSystolic}/${r.bpDiastolic}` : '—'),
          },
          { id: 'pulse', header: 'Pulse', accessor: (r) => r.pulse ?? '—' },
          { id: 'spo2', header: 'SpO₂', accessor: (r) => r.spo2 ?? '—' },
          { id: 'temp', header: 'Temp °C', accessor: (r) => (r.tempC == null ? '—' : String(r.tempC)) },
        ]}
      />
      <p className="sr-only">Vitals table is the accessible data view for the pulse chart.</p>
    </div>
  );
}

export default function NursingEncounterPage() {
  const params = useParams<{ id: string }>();
  const encounterId = params.id;
  const [tab, setTab] = useState('orders');
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [notes, setNotes] = useState<ClinicalNoteDto[]>([]);
  const [vitals, setVitals] = useState<VitalSignsDto[]>([]);
  const [mar, setMar] = useState<MarDose[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [doseId, setDoseId] = useState<string | null>(null);
  const [status, setStatus] = useState<MarDose['status']>('given');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const marDate = istDateKey(new Date());

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      nursingApi.orders(encounterId),
      nursingApi.notes(encounterId),
      nursingApi.vitals(encounterId),
      nursingApi.mar(encounterId, marDate),
    ])
      .then(([o, n, v, m]) => {
        setOrders(o.flatMap((order) => order.items.map((item) => ({ ...item, kind: order.kind }))));
        setNotes(n);
        setVitals(v);
        setMar(m);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [encounterId, marDate]);

  useEffect(() => {
    load();
  }, [load]);

  const submitDose = async () => {
    if (!doseId) return;
    setBusy(true);
    try {
      await nursingApi.administer(doseId, { status: status as 'given', reason: reason || undefined });
      setDoseId(null);
      setReason('');
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PageLoading />;
  if (error) return <PageError error={error} onRetry={load} />;

  return (
    <>
      <PageHeader
        title={t('clinical.nursing.encounter')}
        description={t('clinical.nursing.encounterSubtitle')}
        actions={
          <Link href="/app/nursing" className="hos-link">
            Back to ward
          </Link>
        }
      />
      <Tabs
        value={tab}
        onValueChange={setTab}
        tabs={[
          {
            value: 'orders',
            label: 'Orders',
            content: (
              <DataTable
                data={orders}
                getRowId={(r) => r.id}
                pageSize={25}
                emptyMessage="No lab or medicine orders"
                columns={[
                  { id: 'kind', header: 'Kind', accessor: (r) => r.kind },
                  { id: 'name', header: 'Item', accessor: (r) => r.drugName ?? r.dietCode ?? '—' },
                  {
                    id: 'status',
                    header: 'Status',
                    accessor: (r) => r.status,
                    render: (r) => <Badge tone="neutral">{r.status}</Badge>,
                  },
                ]}
              />
            ),
          },
          {
            value: 'mar',
            label: 'MAR',
            content: (
              <DataTable
                data={mar}
                getRowId={(r) => r.id}
                pageSize={25}
                emptyMessage="No doses scheduled for today"
                columns={[
                  {
                    id: 'when',
                    header: 'Due',
                    accessor: (r) => new Date(r.scheduledAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
                  },
                  { id: 'drug', header: 'Medicine', accessor: (r) => r.drugName },
                  { id: 'dose', header: 'Dose', accessor: (r) => r.dose ?? '—' },
                  { id: 'status', header: 'Status', accessor: (r) => r.status },
                  {
                    id: 'act',
                    header: '',
                    accessor: () => '',
                    render: (r) =>
                      r.status === 'due' ? (
                        <Button type="button" variant="secondary" onClick={() => { setDoseId(r.id); setStatus('given'); }}>
                          Record
                        </Button>
                      ) : (
                        '—'
                      ),
                  },
                ]}
              />
            ),
          },
          {
            value: 'vitals',
            label: 'Vitals',
            content: <VitalsPanel rows={vitals} />,
          },
          {
            value: 'notes',
            label: 'Notes',
            content: (
              <DataTable
                data={notes}
                getRowId={(r) => r.id}
                pageSize={25}
                emptyMessage="No doctor notes"
                columns={[
                  { id: 'kind', header: 'Type', accessor: (r) => r.kind },
                  { id: 'body', header: 'Note', accessor: (r) => r.body },
                ]}
              />
            ),
          },
        ]}
      />

      <Dialog open={!!doseId} onOpenChange={(open) => !open && setDoseId(null)} title="Record dose">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hos-space-3)' }}>
          <Field label="Status" htmlFor="mar-status">
            <Select id="mar-status" value={status} onChange={(e) => setStatus(e.target.value as MarDose['status'])}>
              <option value="given">Given</option>
              <option value="held">Held</option>
              <option value="refused">Refused</option>
              <option value="missed">Missed</option>
            </Select>
          </Field>
          <Field label="Reason (if early or not given)" htmlFor="mar-reason">
            <Textarea id="mar-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
          </Field>
          <Button type="button" onClick={() => void submitDose()} disabled={busy}>
            Save
          </Button>
        </div>
      </Dialog>
    </>
  );
}
