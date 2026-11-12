'use client';

import { DataTable, Button, Field, Input, PageHeader } from '@hos/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { equipmentApi, type EquipmentDetail, rupees } from '@/features/clinical/equipment/api';

const STATUS_LABEL: Record<EquipmentDetail['asset']['status'], string> = {
  operational: 'Operational',
  non_operational: 'Down',
  under_maintenance: 'Under maintenance',
  condemned: 'Condemned',
};

export default function EquipmentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [detail, setDetail] = useState<EquipmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [pmTitle, setPmTitle] = useState('');
  const [pmFrequency, setPmFrequency] = useState('90');
  const [pmNextDue, setPmNextDue] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    equipmentApi
      .asset(id)
      .then((next) => {
        setDetail(next);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      setDescription('');
      load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (loading && !detail) return <PageLoading label="Loading equipment" />;
  if (error && !detail) return <PageError error={error} onRetry={load} />;
  if (!detail) return null;

  const { asset, pmSchedules, logs } = detail;
  const isDown = asset.status === 'non_operational';
  const isCondemned = asset.status === 'condemned';

  return (
    <>
      <PageHeader
        title={`${asset.assetTag} · ${asset.name}`}
        description={`${asset.department || 'No department'} · criticality ${asset.criticality} · ${STATUS_LABEL[asset.status]}`}
      />
      <p className="mb-4 text-sm">
        <Link href="/app/equipment" className="hos-link">
          Back to the equipment register
        </Link>
      </p>
      {actionError ? (
        <p role="alert" className="mb-3 text-sm" style={{ color: 'var(--hos-fg-danger)' }}>
          {actionError}
        </p>
      ) : null}

      <section aria-labelledby="eq-status" className="mb-6 grid max-w-3xl gap-3 md:grid-cols-2">
        <h2 id="eq-status" className="text-base font-semibold md:col-span-2">
          Status
        </h2>
        <p className="text-sm">Purchase cost: {rupees(asset.purchaseCostPaise)}</p>
        <p className="text-sm">Warranty until: {asset.warrantyUntil ?? '—'}</p>
        <div className="flex gap-2 md:col-span-2">
          {isDown || isCondemned ? null : (
            <form
              aria-label="Report breakdown"
              className="flex w-full flex-wrap items-end gap-3"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                void run(() => equipmentApi.reportBreakdown(asset.id, description.trim()));
              }}
            >
              <Field label="Problem" required>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} required maxLength={500} />
              </Field>
              <Button type="submit" disabled={busy || !description.trim()}>
                Report breakdown
              </Button>
            </form>
          )}
          {isDown ? (
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void run(() => equipmentApi.restore(asset.id))}>
              Mark operational
            </Button>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="eq-pm" className="mb-6">
        <h2 id="eq-pm" className="mb-2 text-base font-semibold">
          Preventive maintenance
        </h2>
        <DataTable
          data={pmSchedules}
          getRowId={(row) => row.id}
          emptyMessage="No PM schedule yet."
          columns={[
            { id: 'title', header: 'Task', accessor: (row) => row.title },
            { id: 'freq', header: 'Every (days)', accessor: (row) => String(row.frequencyDays) },
            { id: 'due', header: 'Next due', accessor: (row) => row.nextDue },
            { id: 'last', header: 'Last done', accessor: (row) => row.lastDoneOn ?? '—' },
            {
              id: 'done',
              header: '',
              accessor: () => '',
              render: (row) => (
                <Button type="button" variant="secondary" disabled={busy} onClick={() => void run(() => equipmentApi.completePm(row.id))}>
                  Mark done
                </Button>
              ),
            },
          ]}
        />
        <form
          aria-label="Add PM schedule"
          className="mt-4 grid max-w-3xl gap-3 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() =>
              equipmentApi.addPm(asset.id, { title: pmTitle.trim(), frequencyDays: Number(pmFrequency), nextDue: pmNextDue }),
            );
          }}
        >
          <Field label="PM task" required>
            <Input value={pmTitle} onChange={(e) => setPmTitle(e.target.value)} required maxLength={120} />
          </Field>
          <Field label="Every (days)" required>
            <Input inputMode="numeric" value={pmFrequency} onChange={(e) => setPmFrequency(e.target.value)} required />
          </Field>
          <Field label="Next due" required>
            <Input type="date" value={pmNextDue} onChange={(e) => setPmNextDue(e.target.value)} required />
          </Field>
          <div>
            <Button type="submit" disabled={busy || isCondemned}>
              Add PM schedule
            </Button>
          </div>
        </form>
      </section>

      <section aria-labelledby="eq-log">
        <h2 id="eq-log" className="mb-2 text-base font-semibold">
          Service log
        </h2>
        <DataTable
          data={logs}
          getRowId={(row) => row.id}
          emptyMessage="No service entries yet."
          columns={[
            { id: 'when', header: 'When', accessor: (row) => new Date(row.loggedAt).toLocaleString('en-IN') },
            { id: 'kind', header: 'Type', accessor: (row) => row.kind },
            { id: 'desc', header: 'Details', accessor: (row) => row.description },
          ]}
        />
      </section>
    </>
  );
}
