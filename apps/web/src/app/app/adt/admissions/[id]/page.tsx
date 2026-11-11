'use client';

import { createTranslator, DISCHARGE_TYPES, type AdmissionDto, type DischargeType } from '@hos/shared';
import { Badge, Button, DataTable, Dialog, Field, PageHeader, Select, Textarea } from '@hos/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { PatientBanner } from '@/features/clinical/common/PatientBanner';
import { adtApi } from '@/features/clinical/adt/api';
import { AdtLinks, formatWhen, statusLabel } from '@/features/clinical/adt/links';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { ApiError } from '@/lib/api';

const t = createTranslator('en');

export default function AdmissionPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [admission, setAdmission] = useState<AdmissionDto | null>(null);
  const [vacant, setVacant] = useState<{ id: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [transferOpen, setTransferOpen] = useState(false);
  const [dischargeOpen, setDischargeOpen] = useState(false);
  const [bedId, setBedId] = useState('');
  const [dischargeType, setDischargeType] = useState<DischargeType>('normal');
  const [overrideReason, setOverrideReason] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([adtApi.admission(id), adtApi.board()])
      .then(([row, board]) => {
        setAdmission(row);
        const beds: { id: string; label: string }[] = [];
        for (const ward of board.wards) {
          for (const room of ward.rooms) {
            for (const bed of room.beds) {
              if (bed.status === 'vacant') beds.push({ id: bed.id, label: `${ward.code} ${bed.label}` });
            }
          }
        }
        setVacant(beds);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn: () => Promise<AdmissionDto>, done: string) => {
    setBusy(true);
    setMessage('');
    try {
      const next = await fn();
      setAdmission(next);
      setMessage(done);
      setTransferOpen(false);
      setDischargeOpen(false);
      load();
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : 'Could not update the admission');
    } finally {
      setBusy(false);
    }
  };

  if (loading && !admission) return <PageLoading label="Loading the admission" />;
  if (error && !admission) return <PageError error={error} onRetry={load} />;
  if (!admission) return null;

  const open = admission.status === 'admitted' || admission.status === 'discharge_initiated';
  const current = admission.assignments.find((row) => row.toAt == null);

  return (
    <>
      <AdtLinks current="/app/adt/admissions/[id]" />
      <PageHeader
        title={`${t('clinical.adt.admission')} ${admission.number}`}
        description={statusLabel(admission.status)}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/app/adt/admissions/${admission.id}/summary`} className="hos-link">
              {t('clinical.adt.openSummary')}
            </Link>
            <Button type="button" variant="secondary" disabled={!open} onClick={() => setTransferOpen(true)}>
              {t('clinical.adt.transfer')}
            </Button>
            <Button type="button" disabled={!open} onClick={() => setDischargeOpen(true)}>
              {t('clinical.adt.discharge')}
            </Button>
          </div>
        }
      />
      <PatientBanner patient={admission.patient} alerts={[]} />
      <dl className="my-4 grid max-w-3xl grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <dt style={{ color: 'var(--hos-fg-muted)' }}>{t('clinical.adt.doctor')}</dt>
        <dd>{admission.doctorName || '—'}</dd>
        <dt style={{ color: 'var(--hos-fg-muted)' }}>{t('clinical.adt.bed')}</dt>
        <dd>{current ? `${current.wardCode} ${current.bedLabel}` : '—'}</dd>
        <dt style={{ color: 'var(--hos-fg-muted)' }}>{t('clinical.adt.admitted')}</dt>
        <dd style={{ fontVariantNumeric: 'tabular-nums' }}>{formatWhen(admission.admittedAt)}</dd>
        <dt style={{ color: 'var(--hos-fg-muted)' }}>{t('clinical.adt.attendant')}</dt>
        <dd>{admission.attendant || '—'}</dd>
        <dt style={{ color: 'var(--hos-fg-muted)' }}>{t('clinical.adt.diagnosis')}</dt>
        <dd>{admission.provisionalDiagnosis || '—'}</dd>
        <dt style={{ color: 'var(--hos-fg-muted)' }}>{t('clinical.adt.dischargeType')}</dt>
        <dd>{admission.dischargeType ? statusLabel(admission.dischargeType) : '—'}</dd>
      </dl>
      {message ? (
        <p className="mb-3 text-sm" role="status">
          {message}
        </p>
      ) : null}
      <h2 className="mb-2 text-lg font-semibold">{t('clinical.adt.history')}</h2>
      <DataTable
        data={admission.assignments}
        getRowId={(row) => row.id}
        emptyMessage="No bed assigned."
        columns={[
          { id: 'ward', header: t('clinical.adt.ward'), accessor: (row) => row.wardCode },
          { id: 'bed', header: t('clinical.adt.bed'), accessor: (row) => row.bedLabel },
          { id: 'from', header: t('clinical.adt.from'), accessor: (row) => formatWhen(row.fromAt) },
          { id: 'to', header: t('clinical.adt.to'), accessor: (row) => (row.toAt ? formatWhen(row.toAt) : '—') },
          {
            id: 'status',
            header: t('clinical.adt.status'),
            accessor: (row) => (row.toAt ? 'Moved' : 'Current'),
            render: (row) => <Badge tone={row.toAt ? 'neutral' : 'info'}>{row.toAt ? 'Moved' : 'Current'}</Badge>,
          },
        ]}
      />
      <p className="mt-3 text-sm" style={{ color: 'var(--hos-fg-muted)' }}>
        {t('clinical.adt.gstNote')}
      </p>

      <Dialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        title={t('clinical.adt.transfer')}
        description={current ? `Currently in ${current.wardCode} ${current.bedLabel}.` : undefined}
        footer={
          <Button
            type="button"
            disabled={busy || !bedId}
            onClick={() => void run(() => adtApi.transfer(admission.id, bedId), 'Transferred')}
          >
            {t('clinical.adt.confirmTransfer')}
          </Button>
        }
      >
        <Field label={t('clinical.adt.bed')} hint={vacant.length === 0 ? t('clinical.adt.noVacant') : undefined}>
          <Select value={bedId} onChange={(event) => setBedId(event.target.value)} aria-label={t('clinical.adt.bed')}>
            <option value="">Choose a vacant bed</option>
            {vacant.map((bed) => (
              <option key={bed.id} value={bed.id}>
                {bed.label}
              </option>
            ))}
          </Select>
        </Field>
      </Dialog>

      <Dialog
        open={dischargeOpen}
        onOpenChange={setDischargeOpen}
        title={t('clinical.adt.discharge')}
        description="This closes the stay and frees the bed."
        footer={
          <Button
            type="button"
            disabled={busy}
            onClick={() => void run(() => adtApi.discharge(admission.id, dischargeType, overrideReason || undefined), 'Discharged')}
          >
            {t('clinical.adt.confirmDischarge')}
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label={t('clinical.adt.dischargeType')}>
            <Select
              value={dischargeType}
              onChange={(event) => setDischargeType(event.target.value as DischargeType)}
              aria-label={t('clinical.adt.dischargeType')}
            >
              {DISCHARGE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type === 'lama' ? 'LAMA' : type === 'dama' ? 'DAMA' : type === 'normal' ? 'Normal' : type === 'referred' ? 'Referred' : type === 'death' ? 'Death' : 'Absconded'}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('clinical.adt.override')} hint={t('clinical.adt.overrideHint')}>
            <Textarea value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} maxLength={500} />
          </Field>
        </div>
      </Dialog>
    </>
  );
}
