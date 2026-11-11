'use client';

import type { DoctorDto, PatientSummaryDto, SlotDto } from '@hos/shared';
import { createTranslator } from '@hos/shared';
import { Button, DatePicker, EmptyState, Field, Input, PageHeader, Select, Textarea } from '@hos/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PatientPicker } from '@/features/clinical/common/PatientPicker';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { fetchMe, isTenantMe } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { appointmentsApi, todayIso } from './api';

const t = createTranslator('en');

export function BookScreen() {
  const [doctors, setDoctors] = useState<DoctorDto[]>([]);
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState(todayIso());
  const [slots, setSlots] = useState<SlotDto[]>([]);
  const [slotStart, setSlotStart] = useState('');
  const [patient, setPatient] = useState<PatientSummaryDto | null>(null);
  const [phone, setPhone] = useState(false);
  const [walkinName, setWalkinName] = useState('');
  const [walkinMobile, setWalkinMobile] = useState('');
  const [reason, setReason] = useState('');
  const [counterKind, setCounterKind] = useState<'' | 'new' | 'repeat'>('');
  const [loading, setLoading] = useState(true);
  const [slotsError, setSlotsError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<string | null>(null);
  const [allowPhone, setAllowPhone] = useState(true);

  useEffect(() => {
    Promise.all([fetchMe(), appointmentsApi.doctors()])
      .then(([me, rows]) => {
        const here = me && isTenantMe(me) ? me.currentLocationId : null;
        if (me && isTenantMe(me)) setAllowPhone(me.features.includes('appointments.phone-appointment-without-registration'));
        const list = rows.filter((doctor) => doctor.active && (!here || doctor.locationId === here));
        setDoctors(list);
        setDoctorId((current) => current || list[0]?.id || '');
      })
      .catch(setSlotsError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!doctorId) return;
    setSlotStart('');
    appointmentsApi
      .slots(doctorId, date)
      .then(setSlots)
      .catch(setSlotsError);
  }, [doctorId, date]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = phone
        ? { doctorId, date, slotStart, reason, walkinName, walkinMobile }
        : { doctorId, date, slotStart, reason, patientId: patient?.id, ...(counterKind ? { counterKind } : {}) };
      const row = await appointmentsApi.book(body);
      setBooked(`${row.slotStart}–${row.slotEnd ?? ''}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not book the appointment');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PageLoading />;
  if (slotsError && doctors.length === 0) return <PageError error={slotsError} onRetry={() => window.location.reload()} />;

  const openSlots = slots.filter((slot) => slot.available);

  return (
    <>
      <PageHeader
        title={t('clinical.appointments.new')}
        actions={
          <Button asChild variant="secondary">
            <Link href="/app/appointments">{t('clinical.appointments.title')}</Link>
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
        <Field label={t('clinical.appointments.doctor')} required>
          <Select value={doctorId} onChange={(event) => setDoctorId(event.target.value)} required>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('clinical.appointments.date')} required>
          <DatePicker value={date} onChange={(next) => next && setDate(next)} aria-label={t('clinical.appointments.date')} />
        </Field>
        <Field label={t('clinical.appointments.slot')} required>
          <Select value={slotStart} onChange={(event) => setSlotStart(event.target.value)} required>
            <option value="">{t('clinical.appointments.chooseSlot')}</option>
            {openSlots.map((slot) => (
              <option key={slot.start} value={slot.start}>
                {slot.start}–{slot.end}
                {slot.remaining != null ? ` · ${slot.remaining} open` : ''}
              </option>
            ))}
          </Select>
        </Field>
        {openSlots.length === 0 ? <EmptyState title={t('clinical.appointments.noSlots')} /> : null}
        {allowPhone ? (
          <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: 'var(--hos-text-sm)' }}>
            <input
              type="checkbox"
              checked={phone}
              onChange={(event) => {
                setPhone(event.target.checked);
                setPatient(null);
              }}
            />
            <span>
              {t('clinical.appointments.withoutRecord')}
              <span style={{ display: 'block', color: 'var(--hos-fg-muted)' }}>{t('clinical.appointments.withoutRecordHelp')}</span>
            </span>
          </label>
        ) : null}
        {phone ? (
          <>
            <Field label={t('clinical.appointments.callerName')} required>
              <Input value={walkinName} onChange={(event) => setWalkinName(event.target.value)} required />
            </Field>
            <Field label={t('clinical.appointments.callerMobile')} required hint="+91">
              <Input value={walkinMobile} onChange={(event) => setWalkinMobile(event.target.value)} inputMode="tel" required />
            </Field>
          </>
        ) : (
          <>
            <Field label={t('clinical.appointments.patient')} required>
              <PatientPicker onValueChange={setPatient} />
              {patient ? (
                <p style={{ fontSize: 'var(--hos-text-sm)', marginTop: '4px' }}>
                  {patient.fullName} · {patient.uhid}
                </p>
              ) : null}
            </Field>
            <Field label={t('clinical.appointments.visitType')}>
              <Select value={counterKind} onChange={(event) => setCounterKind(event.target.value as '' | 'new' | 'repeat')}>
                <option value="">{t('clinical.appointments.autoKind')}</option>
                <option value="new">{t('clinical.appointments.newPatient')}</option>
                <option value="repeat">{t('clinical.appointments.repeatPatient')}</option>
              </Select>
            </Field>
          </>
        )}
        <Field label={t('clinical.appointments.reason')} required>
          <Textarea value={reason} onChange={(event) => setReason(event.target.value)} required rows={3} />
        </Field>
        {error ? <p style={{ color: 'var(--hos-status-error-fg)' }}>{error}</p> : null}
        {booked ? (
          <p style={{ color: 'var(--hos-status-success-fg)' }}>
            {t('clinical.appointments.appointmentBooked')} {booked}.
          </p>
        ) : null}
        <div>
          <Button type="submit" loading={busy} disabled={!doctorId || !slotStart || !reason.trim() || (phone ? walkinName.trim().length < 2 : !patient)}>
            {t('clinical.appointments.bookAction')}
          </Button>
        </div>
      </form>
    </>
  );
}
