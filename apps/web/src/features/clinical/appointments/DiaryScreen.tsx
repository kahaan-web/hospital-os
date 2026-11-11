'use client';

import type { AppointmentDto, DoctorDto, ScheduleExceptionInput, ScheduleWindowInput } from '@hos/shared';
import { APPOINTMENT_STATUS_LABEL, createTranslator } from '@hos/shared';
import { Badge, Button, DatePicker, Dialog, EmptyState, Field, Input, PageHeader, Select } from '@hos/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { formatDate } from '@/lib/format';
import { fetchMe, isTenantMe } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { appointmentsApi, formatMobile, todayIso, WEEKDAYS } from './api';

const t = createTranslator('en');

function tone(status: string): 'neutral' | 'info' | 'success' | 'warning' | 'error' | 'brand' {
  if (status === 'completed' || status === 'done') return 'success';
  if (status === 'cancelled' || status === 'no_show') return 'error';
  if (status === 'checked_in' || status === 'in_consultation' || status === 'confirmed') return 'info';
  return 'neutral';
}

function patientLabel(row: AppointmentDto): string {
  if (row.patientName) return row.patientName;
  if (row.walkinName) return `${row.walkinName} (${t('clinical.appointments.phoneBooking')})`;
  return t('clinical.appointments.notLinked');
}

export function DiaryScreen() {
  const [date, setDate] = useState(todayIso());
  const [doctorId, setDoctorId] = useState('');
  const [doctors, setDoctors] = useState<DoctorDto[]>([]);
  const [locationName, setLocationName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [columns, setColumns] = useState<{ doctorId: string; doctorName: string; speciality: string; appointments: AppointmentDto[] }[]>([]);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [moveId, setMoveId] = useState<string | null>(null);
  const [moveDate, setMoveDate] = useState(todayIso());
  const [moveSlot, setMoveSlot] = useState('');
  const [moveSlots, setMoveSlots] = useState<{ start: string; end: string; available: boolean; note?: string | null }[]>([]);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetchMe(), appointmentsApi.doctors(), appointmentsApi.diary(date, doctorId || undefined)])
      .then(([me, doctorRows, diary]) => {
        if (me && isTenantMe(me)) {
          const name = me.locations.find((loc) => loc.id === me.currentLocationId)?.name;
          setLocationName(name ?? me.locations[0]?.name ?? '');
          const here = me.currentLocationId;
          setDoctors(doctorRows.filter((doctor) => doctor.active && (!here || doctor.locationId === here)));
        } else {
          setDoctors(doctorRows.filter((doctor) => doctor.active));
        }
        setColumns(diary.columns);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [date, doctorId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!moveId) return;
    const column = columns.find((item) => item.appointments.some((row) => row.id === moveId));
    if (!column) return;
    appointmentsApi
      .slots(column.doctorId, moveDate)
      .then((slots) => setMoveSlots(slots))
      .catch(() => setMoveSlots([]));
  }, [moveId, moveDate, columns]);

  const onCancel = async () => {
    if (!cancelId) return;
    setBusy(true);
    setFormError(null);
    try {
      await appointmentsApi.cancel(cancelId, cancelReason.trim());
      setCancelId(null);
      setCancelReason('');
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not cancel the appointment');
    } finally {
      setBusy(false);
    }
  };

  const onMove = async () => {
    if (!moveId || !moveSlot) return;
    setBusy(true);
    setFormError(null);
    try {
      await appointmentsApi.reschedule(moveId, moveDate, moveSlot);
      setMoveId(null);
      setMoveSlot('');
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not reschedule');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title={t('clinical.appointments.title')}
        description={locationName ? t('clinical.appointments.showingLocation', { location: locationName }) : formatDate(date)}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/app/opd/queue">{t('clinical.appointments.queue')}</Link>
            </Button>
            <Button asChild>
              <Link href="/app/appointments/new">{t('clinical.appointments.bookAction')}</Link>
            </Button>
          </>
        }
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--hos-space-3)', margin: 'var(--hos-space-4) 0' }}>
        <Field label={t('clinical.appointments.date')}>
          <DatePicker value={date} onChange={(next) => next && setDate(next)} aria-label={t('clinical.appointments.date')} />
        </Field>
        <Field label={t('clinical.appointments.doctor')}>
          <Select value={doctorId} onChange={(event) => setDoctorId(event.target.value)} aria-label={t('clinical.appointments.doctor')}>
            <option value="">{t('clinical.appointments.allDoctors')}</option>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.name}
                {doctor.speciality ? ` · ${doctor.speciality}` : ''}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {loading ? <PageLoading /> : null}
      {error ? <PageError error={error} onRetry={load} /> : null}
      {!loading && !error && columns.every((column) => column.appointments.length === 0) ? (
        <EmptyState
          title={t('clinical.appointments.diaryEmpty')}
          action={
            <Button asChild>
              <Link href="/app/appointments/new">{t('clinical.appointments.bookFirst')}</Link>
            </Button>
          }
        />
      ) : null}
      {!loading && !error
        ? columns
            .filter((column) => column.appointments.length > 0)
            .map((column) => (
              <section key={column.doctorId} style={{ marginTop: 'var(--hos-space-4)' }}>
                  <h2 style={{ fontSize: 'var(--hos-text-xl)', fontWeight: 600, marginBottom: 'var(--hos-space-2)' }}>
                  {column.doctorName}
                  {column.speciality ? <span style={{ color: 'var(--hos-fg-muted)', fontWeight: 400 }}> · {column.speciality}</span> : null}
                </h2>
                <div className="hos-table-wrap">
                  <table className="hos-table">
                    <thead>
                      <tr>
                        <th scope="col">{t('clinical.appointments.slot')}</th>
                        <th scope="col">{t('clinical.appointments.patient')}</th>
                        <th scope="col">{t('clinical.appointments.uhid')}</th>
                        <th scope="col">{t('clinical.appointments.channel')}</th>
                        <th scope="col">{t('clinical.appointments.status')}</th>
                        <th scope="col">{t('clinical.appointments.token')}</th>
                        <th scope="col">{t('clinical.appointments.reason')}</th>
                        <th scope="col">
                          <span className="hos-sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {column.appointments.map((row) => (
                        <tr key={row.id}>
                          <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {row.slotStart}–{row.slotEnd ?? '—'}
                          </td>
                          <td>
                            {patientLabel(row)}
                            {row.walkinMobile ? (
                              <div style={{ color: 'var(--hos-fg-muted)', fontSize: 'var(--hos-text-xs)' }}>{formatMobile(row.walkinMobile)}</div>
                            ) : null}
                          </td>
                          <td style={{ fontVariantNumeric: 'tabular-nums' }}>{row.uhid || '—'}</td>
                          <td>{row.channel === 'phone' ? t('clinical.appointments.phone') : row.channel === 'portal' ? t('clinical.appointments.portal') : t('clinical.appointments.counter')}</td>
                          <td>
                            <Badge tone={tone(row.status)}>{APPOINTMENT_STATUS_LABEL[row.status as keyof typeof APPOINTMENT_STATUS_LABEL] ?? row.status}</Badge>
                          </td>
                          <td style={{ fontVariantNumeric: 'tabular-nums' }}>{row.token ?? '—'}</td>
                          <td>{row.reason || '—'}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 'var(--hos-space-2)', flexWrap: 'wrap' }}>
                              {row.patientId && (row.status === 'booked' || row.status === 'confirmed') ? (
                                <Button asChild size="sm" variant="secondary">
                                  <Link href={`/app/opd/visits?appointmentId=${row.id}&patientId=${row.patientId}&doctorId=${row.doctorId}`}>{t('clinical.appointments.checkIn')}</Link>
                                </Button>
                              ) : null}
                              {!row.patientId && (row.status === 'booked' || row.status === 'confirmed') ? (
                                <Button asChild size="sm" variant="secondary">
                                  <Link href={`/app/opd/visits?appointmentId=${row.id}&doctorId=${row.doctorId}`}>{t('clinical.appointments.checkIn')}</Link>
                                </Button>
                              ) : null}
                              {row.status === 'booked' || row.status === 'confirmed' ? (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setMoveId(row.id);
                                      setMoveDate(row.date);
                                      setMoveSlot('');
                                      setFormError(null);
                                    }}
                                  >
                                    {t('clinical.appointments.reschedule')}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="danger"
                                    onClick={() => {
                                      setCancelId(row.id);
                                      setCancelReason('');
                                      setFormError(null);
                                    }}
                                  >
                                    {t('clinical.appointments.cancelAction')}
                                  </Button>
                                </>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))
        : null}
      {doctorId ? <HoursPanel doctorId={doctorId} /> : null}
      <Dialog
        open={Boolean(cancelId)}
        onOpenChange={(open) => {
          if (!open) setCancelId(null);
        }}
        title={t('clinical.appointments.confirmCancel')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelId(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" loading={busy} onClick={onCancel} disabled={cancelReason.trim().length < 2}>
              {t('clinical.appointments.cancelAction')}
            </Button>
          </>
        }
      >
        <Field label={t('clinical.appointments.cancelReason')} required>
          <Input value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} />
        </Field>
        {formError ? <p style={{ color: 'var(--hos-status-error-fg)', marginTop: 'var(--hos-space-2)' }}>{formError}</p> : null}
      </Dialog>
      <Dialog
        open={Boolean(moveId)}
        onOpenChange={(open) => {
          if (!open) setMoveId(null);
        }}
        title={t('clinical.appointments.reschedule')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setMoveId(null)}>
              {t('common.cancel')}
            </Button>
            <Button loading={busy} disabled={!moveSlot} onClick={onMove}>
              {t('clinical.appointments.saveReschedule')}
            </Button>
          </>
        }
      >
        <Field label={t('clinical.appointments.date')}>
          <DatePicker value={moveDate} onChange={(next) => next && setMoveDate(next)} aria-label={t('clinical.appointments.date')} />
        </Field>
        <Field label={t('clinical.appointments.slot')}>
          <Select value={moveSlot} onChange={(event) => setMoveSlot(event.target.value)} aria-label={t('clinical.appointments.slot')}>
            <option value="">{t('clinical.appointments.chooseSlot')}</option>
            {moveSlots
              .filter((slot) => slot.available)
              .map((slot) => (
                <option key={slot.start} value={slot.start}>
                  {slot.start}–{slot.end}
                </option>
              ))}
          </Select>
        </Field>
        {formError ? <p style={{ color: 'var(--hos-status-error-fg)', marginTop: 'var(--hos-space-2)' }}>{formError}</p> : null}
      </Dialog>
    </>
  );
}

function HoursPanel({ doctorId }: { doctorId: string }) {
  const [windows, setWindows] = useState<ScheduleWindowInput[]>([]);
  const [exceptions, setExceptions] = useState<ScheduleExceptionInput[]>([]);
  const [days, setDays] = useState<boolean[]>([false, true, true, true, true, true, true]);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('13:00');
  const [slotMinutes, setSlotMinutes] = useState(15);
  const [maxPerSlot, setMaxPerSlot] = useState(2);
  const [exDate, setExDate] = useState(todayIso());
  const [exKind, setExKind] = useState<ScheduleExceptionInput['kind']>('closed');
  const [exReason, setExReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    appointmentsApi
      .schedule(doctorId)
      .then((schedule) => {
        setWindows(schedule.windows);
        setExceptions(schedule.exceptions.map((row) => ({ date: row.date, kind: row.kind, start: row.start ?? undefined, end: row.end ?? undefined, slotMinutes: row.slotMinutes ?? undefined, maxPerSlot: row.maxPerSlot ?? undefined, reason: row.reason })));
      })
      .catch(() => setWindows([]));
  }, [doctorId]);

  useEffect(() => {
    load();
  }, [load]);

  const saveHours = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    const next = days.flatMap((on, weekday) => (on ? [{ weekday, start, end, slotMinutes, maxPerSlot }] : []));
    try {
      const saved = await appointmentsApi.saveSchedule(doctorId, { windows: next, exceptions });
      setWindows(saved.windows);
      setMessage(t('clinical.appointments.hoursSaved'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save clinic hours');
    } finally {
      setBusy(false);
    }
  };

  const addException = async () => {
    setBusy(true);
    setError(null);
    const next = [
      ...exceptions,
      exKind === 'closed'
        ? { date: exDate, kind: exKind, reason: exReason }
        : { date: exDate, kind: exKind, start: '10:00', end: '12:00', slotMinutes: 15, maxPerSlot: 2, reason: exReason },
    ];
    try {
      const saved = await appointmentsApi.saveSchedule(doctorId, { windows, exceptions: next });
      setExceptions(saved.exceptions.map((row) => ({ date: row.date, kind: row.kind, start: row.start ?? undefined, end: row.end ?? undefined, reason: row.reason })));
      setExReason('');
      setMessage(t('clinical.appointments.hoursSaved'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add the exception');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={{ marginTop: 'var(--hos-space-6)', maxWidth: '40rem' }}>
      <h2 style={{ fontSize: 'var(--hos-text-xl)', fontWeight: 600 }}>{t('clinical.appointments.clinicHours')}</h2>
      <p style={{ color: 'var(--hos-fg-muted)', fontSize: 'var(--hos-text-sm)' }}>{t('clinical.appointments.hoursHelp')}</p>
      {windows.length > 0 ? (
        <ul style={{ paddingLeft: '1.25rem', fontSize: 'var(--hos-text-sm)' }}>
          {windows.map((window) => (
            <li key={`${window.weekday}-${window.start}`}>
              {WEEKDAYS[window.weekday]} {window.start}–{window.end}, {window.slotMinutes} min, {window.maxPerSlot} per slot
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ fontSize: 'var(--hos-text-sm)' }}>{t('clinical.appointments.noSlots')}</p>
      )}
      <p style={{ fontSize: 'var(--hos-text-sm)', marginTop: 'var(--hos-space-3)' }}>{t('clinical.appointments.applyHours')}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--hos-space-2)', margin: 'var(--hos-space-2) 0' }}>
        {WEEKDAYS.map((label, index) => (
          <label key={label} style={{ display: 'flex', gap: '4px', alignItems: 'center', fontSize: 'var(--hos-text-sm)' }}>
            <input
              type="checkbox"
              checked={days[index]}
              onChange={(event) => setDays((current) => current.map((on, i) => (i === index ? event.target.checked : on)))}
            />
            {label.slice(0, 3)}
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--hos-space-3)' }}>
        <Field label={t('clinical.appointments.fromTime')}>
          <Input type="time" value={start} onChange={(event) => setStart(event.target.value)} />
        </Field>
        <Field label={t('clinical.appointments.toTime')}>
          <Input type="time" value={end} onChange={(event) => setEnd(event.target.value)} />
        </Field>
        <Field label={t('clinical.appointments.slotMinutes')}>
          <Input type="number" min={5} max={180} value={slotMinutes} onChange={(event) => setSlotMinutes(Number(event.target.value))} />
        </Field>
        <Field label={t('clinical.appointments.maxPerSlot')}>
          <Input type="number" min={1} max={50} value={maxPerSlot} onChange={(event) => setMaxPerSlot(Number(event.target.value))} />
        </Field>
      </div>
      <Button style={{ marginTop: 'var(--hos-space-3)' }} loading={busy} onClick={saveHours}>
        {t('clinical.appointments.saveHours')}
      </Button>
      <h3 style={{ fontSize: 'var(--hos-text-base)', fontWeight: 600, marginTop: 'var(--hos-space-5)' }}>{t('clinical.appointments.exceptions')}</h3>
      {exceptions.length === 0 ? <p style={{ fontSize: 'var(--hos-text-sm)' }}>{t('clinical.appointments.noExceptions')}</p> : null}
      <ul style={{ paddingLeft: '1.25rem', fontSize: 'var(--hos-text-sm)' }}>
        {exceptions.map((row) => (
          <li key={`${row.date}-${row.kind}-${row.start ?? ''}`}>
            {formatDate(row.date)} · {row.kind}
            {row.reason ? ` · ${row.reason}` : ''}
          </li>
        ))}
      </ul>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--hos-space-3)', marginTop: 'var(--hos-space-3)' }}>
        <Field label={t('clinical.appointments.date')}>
          <DatePicker value={exDate} onChange={(next) => next && setExDate(next)} aria-label={t('clinical.appointments.date')} />
        </Field>
        <Field label={t('clinical.appointments.exceptionKind')}>
          <Select value={exKind} onChange={(event) => setExKind(event.target.value as ScheduleExceptionInput['kind'])}>
            <option value="closed">{t('clinical.appointments.exceptionClosed')}</option>
            <option value="extra">{t('clinical.appointments.exceptionExtra')}</option>
            <option value="override">{t('clinical.appointments.exceptionOverride')}</option>
          </Select>
        </Field>
        <Field label={t('clinical.appointments.exceptionReason')}>
          <Input value={exReason} onChange={(event) => setExReason(event.target.value)} />
        </Field>
      </div>
      <Button variant="secondary" style={{ marginTop: 'var(--hos-space-3)' }} loading={busy} onClick={addException}>
        {t('clinical.appointments.addException')}
      </Button>
      {message ? <p style={{ color: 'var(--hos-status-success-fg)', marginTop: 'var(--hos-space-2)' }}>{message}</p> : null}
      {error ? <p style={{ color: 'var(--hos-status-error-fg)', marginTop: 'var(--hos-space-2)' }}>{error}</p> : null}
    </section>
  );
}
