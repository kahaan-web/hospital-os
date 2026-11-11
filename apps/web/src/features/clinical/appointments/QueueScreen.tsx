'use client';

import type { DoctorDto, OpdQueueItemDto, OpdQueueStatus } from '@hos/shared';
import { createTranslator } from '@hos/shared';
import { Badge, Button, DatePicker, Dialog, EmptyState, Field, PageHeader, Select } from '@hos/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { formatDateTime } from '@/lib/format';
import { fetchMe, isTenantMe } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { appointmentsApi, todayIso } from './api';

const t = createTranslator('en');

const LABEL: Record<OpdQueueStatus, string> = {
  waiting: t('clinical.appointments.waiting'),
  in_consultation: t('clinical.appointments.inConsultation'),
  done: t('clinical.appointments.done'),
  skipped: t('clinical.appointments.skipped'),
};

function tone(status: OpdQueueStatus): 'info' | 'brand' | 'success' | 'warning' {
  if (status === 'done') return 'success';
  if (status === 'skipped') return 'warning';
  if (status === 'in_consultation') return 'brand';
  return 'info';
}

export function QueueScreen() {
  const [date, setDate] = useState(todayIso());
  const [doctorId, setDoctorId] = useState('');
  const [doctors, setDoctors] = useState<DoctorDto[]>([]);
  const [rows, setRows] = useState<OpdQueueItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState<{ id: string; status: 'done' | 'skipped' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetchMe(), appointmentsApi.doctors(), appointmentsApi.queue(date, doctorId || undefined)])
      .then(([me, doctorRows, queue]) => {
        const here = me && isTenantMe(me) ? me.currentLocationId : null;
        setDoctors(doctorRows.filter((doctor) => doctor.active && (!here || doctor.locationId === here)));
        setRows(queue);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [date, doctorId]);

  useEffect(() => {
    load();
  }, [load]);

  const apply = async (encounterId: string, status: OpdQueueStatus) => {
    setBusy(true);
    setFormError(null);
    try {
      await appointmentsApi.setStatus(encounterId, status);
      setPending(null);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not update the queue');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title={t('clinical.appointments.queue')}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/app/opd/reports">{t('clinical.appointments.reports')}</Link>
            </Button>
            <Button asChild>
              <Link href="/app/opd/visits">{t('clinical.appointments.registerVisit')}</Link>
            </Button>
          </>
        }
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--hos-space-3)', margin: 'var(--hos-space-4) 0' }}>
        <Field label={t('clinical.appointments.date')}>
          <DatePicker value={date} onChange={(next) => next && setDate(next)} aria-label={t('clinical.appointments.date')} />
        </Field>
        <Field label={t('clinical.appointments.doctor')}>
          <Select value={doctorId} onChange={(event) => setDoctorId(event.target.value)}>
            <option value="">{t('clinical.appointments.allDoctors')}</option>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {loading ? <PageLoading /> : null}
      {error ? <PageError error={error} onRetry={load} /> : null}
      {!loading && !error && rows.length === 0 ? <EmptyState title={t('clinical.appointments.queueEmpty')} /> : null}
      {!loading && !error && rows.length > 0 ? (
        <div className="hos-table-wrap">
          <table className="hos-table">
            <thead>
              <tr>
                <th scope="col">{t('clinical.appointments.token')}</th>
                <th scope="col">{t('clinical.appointments.patient')}</th>
                <th scope="col">{t('clinical.appointments.uhid')}</th>
                <th scope="col">{t('clinical.appointments.doctor')}</th>
                <th scope="col">{t('clinical.appointments.number')}</th>
                <th scope="col">{t('clinical.appointments.visitType')}</th>
                <th scope="col">{t('clinical.appointments.status')}</th>
                <th scope="col">{t('clinical.appointments.arrived')}</th>
                <th scope="col">
                  <span className="hos-sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.encounterId}>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{row.token}</td>
                  <td>{row.patientName}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{row.uhid}</td>
                  <td>{row.doctorName}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{row.encounterNumber}</td>
                  <td>{row.visitType === 'follow_up' ? t('clinical.appointments.followUp') : row.visitType === 'new' ? t('clinical.appointments.newPatient') : '—'}</td>
                  <td>
                    <Badge tone={tone(row.status)}>{LABEL[row.status]}</Badge>
                  </td>
                  <td>{formatDateTime(row.arrivedAt)}</td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--hos-space-2)' }}>
                      {row.status !== 'in_consultation' ? (
                        <Button size="sm" variant="secondary" onClick={() => apply(row.encounterId, 'in_consultation')}>
                          {t('clinical.appointments.callIn')}
                        </Button>
                      ) : null}
                      {row.status !== 'waiting' ? (
                        <Button size="sm" variant="ghost" onClick={() => apply(row.encounterId, 'waiting')}>
                          {t('clinical.appointments.backToWaiting')}
                        </Button>
                      ) : null}
                      {row.status !== 'done' ? (
                        <Button size="sm" onClick={() => setPending({ id: row.encounterId, status: 'done' })}>
                          {t('clinical.appointments.markDone')}
                        </Button>
                      ) : null}
                      {row.status !== 'skipped' ? (
                        <Button size="sm" variant="danger" onClick={() => setPending({ id: row.encounterId, status: 'skipped' })}>
                          {t('clinical.appointments.markSkipped')}
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <Dialog
        open={Boolean(pending)}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={pending?.status === 'skipped' ? t('clinical.appointments.confirmSkip') : t('clinical.appointments.confirmDone')}
        description={t('clinical.appointments.chargeStays')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant={pending?.status === 'skipped' ? 'danger' : 'primary'}
              loading={busy}
              onClick={() => pending && apply(pending.id, pending.status)}
            >
              {pending?.status === 'skipped' ? t('clinical.appointments.markSkipped') : t('clinical.appointments.markDone')}
            </Button>
          </>
        }
      >
        {formError ? <p style={{ color: 'var(--hos-status-error-fg)' }}>{formError}</p> : <p>{t('clinical.appointments.gstNote')}</p>}
      </Dialog>
    </>
  );
}
