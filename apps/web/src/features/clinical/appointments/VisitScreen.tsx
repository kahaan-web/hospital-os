'use client';

import type { DoctorDto, PatientSummaryDto, PayerType, RegisteredVisitDto, VisitType } from '@hos/shared';
import { PAYER_TYPES, createTranslator } from '@hos/shared';
import { Button, Field, PageHeader, Select } from '@hos/ui';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PatientPicker } from '@/features/clinical/common/PatientPicker';
import { PageLoading } from '@/features/common/LoadState';
import { formatINR } from '@/lib/format';
import { fetchMe, isTenantMe } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { appointmentsApi, formatMobile } from './api';

const t = createTranslator('en');

const PAYER_LABEL: Record<PayerType, string> = {
  self: t('clinical.appointments.self'),
  corporate: t('clinical.appointments.corporate'),
  tpa: t('clinical.appointments.tpa'),
  scheme: t('clinical.appointments.scheme'),
  free: t('clinical.appointments.free'),
};

export function VisitScreen() {
  const params = useSearchParams();
  const appointmentId = params.get('appointmentId') ?? '';
  const [doctors, setDoctors] = useState<DoctorDto[]>([]);
  const [doctorId, setDoctorId] = useState(params.get('doctorId') ?? '');
  const [patient, setPatient] = useState<PatientSummaryDto | null>(null);
  const [visitType, setVisitType] = useState<'' | VisitType>('');
  const [payerType, setPayerType] = useState<PayerType>('self');
  const [summary, setSummary] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RegisteredVisitDto | null>(null);

  useEffect(() => {
    const presetPatient = params.get('patientId');
    Promise.all([fetchMe(), appointmentsApi.doctors(), appointmentId ? appointmentsApi.appointment(appointmentId) : Promise.resolve(null)])
      .then(([me, doctorRows, appointment]) => {
        const here = me && isTenantMe(me) ? me.currentLocationId : null;
        const list = doctorRows.filter((doctor) => doctor.active && (!here || doctor.locationId === here));
        setDoctors(list);
        if (appointment) {
          setDoctorId(appointment.doctorId);
          const who = appointment.patientName || appointment.walkinName || t('clinical.appointments.phoneBooking');
          const mobile = appointment.walkinMobile ? ` · ${formatMobile(appointment.walkinMobile)}` : '';
          setSummary(`${who}${mobile} · ${appointment.date} ${appointment.slotStart}`);
          if (appointment.counterKind === 'repeat') setVisitType('follow_up');
          if (appointment.counterKind === 'new') setVisitType('new');
          if (appointment.patientId && appointment.patientName) {
            setPatient({
              id: appointment.patientId,
              uhid: appointment.uhid ?? '—',
              fullName: appointment.patientName,
              gender: 'other',
              ageLabel: '—',
              mobileMasked: '—',
              city: '',
            });
          }
        }
        if (!presetPatient && !appointment?.patientId) setPatient(null);
        setDoctorId((current) => current || list[0]?.id || '');
      })
      .finally(() => setLoading(false));
  }, [appointmentId, params]);

  const submit = async () => {
    if (!patient || !doctorId) return;
    setBusy(true);
    setError(null);
    try {
      const visit = await appointmentsApi.registerVisit({
        patientId: patient.id,
        doctorId,
        ...(appointmentId ? { appointmentId } : {}),
        ...(visitType ? { visitType } : {}),
        payerType,
      });
      setResult(visit);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not register the visit');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PageLoading />;

  return (
    <>
      <PageHeader
        title={t('clinical.appointments.visits')}
        description={appointmentId ? t('clinical.appointments.fromAppointment') : t('clinical.appointments.walkIn')}
        actions={
          <Button asChild variant="secondary">
            <Link href="/app/opd/queue">{t('clinical.appointments.queue')}</Link>
          </Button>
        }
      />
      <form
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hos-space-3)', maxWidth: '40rem', marginTop: 'var(--hos-space-4)' }}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {summary ? <p style={{ fontSize: 'var(--hos-text-sm)' }}>{summary}</p> : null}
        <Field label={t('clinical.appointments.patient')} required>
          <PatientPicker
            onValueChange={(next) => {
              setPatient(next);
            }}
          />
          {patient ? (
            <p style={{ fontSize: 'var(--hos-text-sm)', marginTop: '4px' }}>
              {patient.fullName} · {patient.uhid} · {patient.ageLabel}
            </p>
          ) : (
            <p style={{ fontSize: 'var(--hos-text-sm)', color: 'var(--hos-fg-muted)', marginTop: '4px' }}>Search by name, UHID or mobile.</p>
          )}
        </Field>
        <Field label={t('clinical.appointments.doctor')} required>
          <Select value={doctorId} onChange={(event) => setDoctorId(event.target.value)} required>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('clinical.appointments.visitType')}>
          <Select value={visitType} onChange={(event) => setVisitType(event.target.value as '' | VisitType)}>
            <option value="">{t('clinical.appointments.autoKind')}</option>
            <option value="new">{t('clinical.appointments.newPatient')}</option>
            <option value="follow_up">{t('clinical.appointments.followUp')}</option>
          </Select>
        </Field>
        <Field label={t('clinical.appointments.payer')}>
          <Select value={payerType} onChange={(event) => setPayerType(event.target.value as PayerType)}>
            {PAYER_TYPES.map((payer) => (
              <option key={payer} value={payer}>
                {PAYER_LABEL[payer]}
              </option>
            ))}
          </Select>
        </Field>
        <p style={{ fontSize: 'var(--hos-text-sm)', color: 'var(--hos-fg-muted)' }}>{t('clinical.appointments.gstNote')}</p>
        {error ? <p style={{ color: 'var(--hos-status-error-fg)' }}>{error}</p> : null}
        <div>
          <Button type="submit" loading={busy} disabled={!patient || !doctorId}>
            {t('clinical.appointments.registerVisit')}
          </Button>
        </div>
      </form>
      {result ? (
        <section style={{ marginTop: 'var(--hos-space-5)', maxWidth: '40rem' }}>
          <h2 style={{ fontSize: 'var(--hos-text-xl)', fontWeight: 600 }}>{t('clinical.appointments.visitRegistered')}</h2>
          <p style={{ fontSize: 'var(--hos-text-2xl)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
            {t('clinical.appointments.token')} {result.token}
          </p>
          <p>
            {result.number} · {result.patient?.fullName ?? '—'} · {result.visitType === 'follow_up' ? t('clinical.appointments.followUp') : t('clinical.appointments.newPatient')}
          </p>
          <p>
            {t('clinical.appointments.consultation')}: {formatINR(result.consultation.amountPaise)} · {t('clinical.appointments.exempt')} ({result.consultation.hsnSac}).{' '}
            {t('clinical.appointments.confirmWithCa')}
          </p>
          <Button asChild variant="secondary">
            <Link href="/app/opd/queue">{t('clinical.appointments.queue')}</Link>
          </Button>
        </section>
      ) : null}
    </>
  );
}
