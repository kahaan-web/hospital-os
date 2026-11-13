'use client';

import { Button, Checkbox, Combobox, DatePicker, Field, IconButton, Input, PageHeader, RadioGroup, Select, Textarea } from '@hos/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { PageError } from '@/features/common/LoadState';
import { otSchedulingApi, type OtBulkResult, type OtScheduleBooking, type OtScheduleRow } from './api';
import { FieldGrid, InlineNote, Panel } from './bits';
import { formatOtDate, formatTime12, minutesOf, otActionError, plusDays, todayIso } from './format';
import { OtSubNav } from './OtSubNav';
import { useOtLookups } from './useOtLookups';

const GRID_START = 7 * 60;
const GRID_END = 19 * 60;
const STEP = 15;
const COLS = (GRID_END - GRID_START) / STEP;
const COL_W = 36;

export function ScheduleScreen() {
  const router = useRouter();
  const lookups = useOtLookups();
  const [date, setDate] = useState(todayIso);
  const [category, setCategory] = useState('');
  const [rows, setRows] = useState<OtScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [selectBy, setSelectBy] = useState<'ticks' | 'doctor'>('ticks');
  const [doctorId, setDoctorId] = useState('');
  const [from, setFrom] = useState(todayIso);
  const [to, setTo] = useState(todayIso);
  const [reason, setReason] = useState('');
  const [moveBy, setMoveBy] = useState<'days' | 'date'>('days');
  const [shiftDays, setShiftDays] = useState('1');
  const [toDate, setToDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [result, setResult] = useState<OtBulkResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    otSchedulingApi
      .schedule(date, category || undefined)
      .then((next) => {
        if (!cancelled) setRows(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setRows([]);
          setError(err);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, category, attempt]);

  const categories = useMemo(() => {
    const values = new Set<string>();
    for (const resource of lookups.resources) if (resource.categoryName) values.add(resource.categoryName);
    for (const row of rows) if (row.category) values.add(row.category);
    if (category) values.add(category);
    return [...values];
  }, [lookups.resources, rows]);

  const shown = rows.filter((row) => !category || !row.category || row.category === category);
  const bookings = shown.flatMap((row) => row.bookings.map((booking) => ({ ...booking, resourceName: booking.resourceName || row.resourceName, resourceId: booking.resourceId || row.resourceId })));
  const outside = bookings.filter((booking) => {
    const start = minutesOf(booking.fromTime);
    const end = minutesOf(booking.toTime);
    if (start == null || end == null) return false;
    return end <= GRID_START || start >= GRID_END;
  });

  const doctors = useMemo(() => {
    const merged = new Map<string, string>();
    for (const doctor of [...lookups.surgeons, ...lookups.anaesthetists]) merged.set(doctor.id, doctor.name);
    return [...merged.entries()].map(([value, label]) => ({ value, label }));
  }, [lookups.surgeons, lookups.anaesthetists]);

  const toggle = (id: string, on: boolean) => {
    setPicked((prev) => (on ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((item) => item !== id)));
  };

  const target = (): { ids?: string[]; doctorId?: string; from?: string; to?: string } | string => {
    if (selectBy === 'ticks') {
      if (picked.length === 0) return 'Tick at least one booking.';
      return { ids: picked };
    }
    if (!doctorId) return 'Choose a doctor.';
    if (!from || !to) return 'Choose the date range.';
    return { doctorId, from, to };
  };

  const runCancel = async () => {
    const body = target();
    if (typeof body === 'string') {
      setBulkError(body);
      return;
    }
    if (!reason.trim()) {
      setBulkError('Enter a reason for the bulk cancellation.');
      return;
    }
    setBusy(true);
    setBulkError('');
    setResult(null);
    try {
      setResult(await otSchedulingApi.bulkCancel({ ...body, reason: reason.trim() }));
      setPicked([]);
      setAttempt((value) => value + 1);
    } catch (err) {
      setBulkError(otActionError(err));
    } finally {
      setBusy(false);
    }
  };

  const runReschedule = async () => {
    const body = target();
    if (typeof body === 'string') {
      setBulkError(body);
      return;
    }
    const days = Number(shiftDays);
    if (moveBy === 'days' && (!Number.isFinite(days) || days === 0)) {
      setBulkError('Enter a number of days other than zero.');
      return;
    }
    if (moveBy === 'date' && !toDate) {
      setBulkError('Choose the date to move the bookings to.');
      return;
    }
    setBusy(true);
    setBulkError('');
    setResult(null);
    try {
      setResult(
        await otSchedulingApi.bulkReschedule({
          ...body,
          ...(moveBy === 'days' ? { shiftDays: days } : { toDate }),
        }),
      );
      setPicked([]);
      setAttempt((value) => value + 1);
    } catch (err) {
      setBulkError(otActionError(err));
    } finally {
      setBusy(false);
    }
  };

  const openBooking = (booking: OtScheduleBooking) => {
    const query = new URLSearchParams({ bookingId: booking.id, date: booking.date || date });
    if (booking.resourceId) query.set('resourceId', booking.resourceId);
    router.push(`/app/ot/book?${query.toString()}`);
  };

  return (
    <>
      <OtSubNav />
      <PageHeader title="OT schedule" description="Theatres across the day. Click a block to open the booking." />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--hos-space-3)', alignItems: 'end', marginBottom: 'var(--hos-space-3)' }}>
        <div>
          <span style={{ display: 'block', fontSize: 'var(--hos-text-sm)', fontWeight: 500, marginBottom: 4 }}>Select date</span>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <IconButton label="Previous day" size="sm" onClick={() => setDate((value) => plusDays(value, -1))}>
              <ChevronLeft size={16} strokeWidth={1.5} />
            </IconButton>
            <DatePicker aria-label="Select date" value={date} onChange={(next) => next && setDate(next)} />
            <IconButton label="Next day" size="sm" onClick={() => setDate((value) => plusDays(value, 1))}>
              <ChevronRight size={16} strokeWidth={1.5} />
            </IconButton>
          </div>
        </div>
        <Field label="OT category">
          <Select aria-label="OT category" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">All categories</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <InlineNote tone="muted">{lookups.warning}</InlineNote>
      {loading ? <p style={{ color: 'var(--hos-fg-muted)' }}>Loading the schedule…</p> : null}
      {error ? <PageError error={error} onRetry={() => setAttempt((value) => value + 1)} /> : null}

      <div style={{ overflowX: 'auto', border: '1px solid var(--hos-border-default)', borderRadius: 'var(--hos-radius-lg)', background: 'var(--hos-bg-elevated)' }}>
        <div style={{ minWidth: 160 + COLS * COL_W }}>
          <div style={{ display: 'grid', gridTemplateColumns: `160px repeat(${COLS}, ${COL_W}px)`, position: 'sticky', top: 0, background: 'var(--hos-bg-elevated)' }}>
            <div style={{ padding: 8, fontSize: 'var(--hos-text-xs)', color: 'var(--hos-fg-muted)' }}>Theatre</div>
            {Array.from({ length: COLS }, (_, index) => (
              <div key={index} style={{ fontSize: 11, color: 'var(--hos-fg-muted)', borderLeft: '1px solid var(--hos-border-default)', fontVariantNumeric: 'tabular-nums', padding: '4px 0 4px 2px' }}>
                {index % 4 === 0 ? formatTime12(minutesToClock(GRID_START + index * STEP)) : ''}
              </div>
            ))}
          </div>
          {!loading && !error && shown.length === 0 ? <p style={{ padding: 12, color: 'var(--hos-fg-muted)' }}>No theatres for this date.</p> : null}
          {shown.map((row) => (
            <div key={row.resourceId} style={{ display: 'grid', gridTemplateColumns: `160px ${COLS * COL_W}px`, borderTop: '1px solid var(--hos-border-default)', minHeight: 72 }}>
              <div style={{ padding: 8, fontSize: 'var(--hos-text-sm)', fontWeight: 500 }}>{row.resourceName}</div>
              <div style={{ position: 'relative', backgroundImage: `repeating-linear-gradient(to right, var(--hos-border-default) 0, var(--hos-border-default) 1px, transparent 1px, transparent ${COL_W}px)` }}>
                {row.bookings.map((booking) => {
                  const block = blockBox(booking);
                  if (!block) return null;
                  return (
                    <button
                      key={booking.id}
                      type="button"
                      onClick={() => openBooking(booking)}
                      style={{
                        position: 'absolute',
                        left: block.left,
                        width: block.width,
                        top: 6,
                        bottom: 6,
                        overflow: 'hidden',
                        textAlign: 'left',
                        padding: 4,
                        borderRadius: 6,
                        border: '1px solid var(--hos-brand-300)',
                        background: 'var(--hos-brand-50)',
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      <span style={{ display: 'block', fontWeight: 600 }}>
                        Appt No: {booking.apptNo || '—'} From {formatTime12(booking.fromTime)} To {formatTime12(booking.toTime)}
                      </span>
                      <span style={{ display: 'block' }}>{booking.patientName || booking.patientNo || 'Patient'}</span>
                      <span style={{ display: 'block' }}>{booking.doctors || booking.doctorName}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      {outside.length > 0 ? (
        <InlineNote tone="muted">Bookings outside 07:00–19:00 stay in the list below and are not drawn on the grid.</InlineNote>
      ) : null}

      <Panel title="Bulk cancel or reschedule">
        <p style={{ marginTop: 0, color: 'var(--hos-fg-secondary)', fontSize: 'var(--hos-text-sm)' }}>
          Tick bookings on this date, or choose a doctor and a date range. Each booking is checked for overlap. The result lists what moved and what failed.
        </p>
        <RadioGroup
          aria-label="How to select bookings"
          value={selectBy}
          onValueChange={(value) => setSelectBy(value === 'doctor' ? 'doctor' : 'ticks')}
          options={[
            { value: 'ticks', label: 'Ticked bookings' },
            { value: 'doctor', label: 'Doctor and date range' },
          ]}
        />
        {selectBy === 'doctor' ? (
          <FieldGrid>
            <Field label="Doctor">
              <Combobox aria-label="Doctor" options={doctors} value={doctorId || undefined} placeholder="Search doctor" onValueChange={setDoctorId} />
            </Field>
            <Field label="From">
              <DatePicker aria-label="From date" value={from} onChange={(next) => next && setFrom(next)} />
            </Field>
            <Field label="To">
              <DatePicker aria-label="To date" value={to} onChange={(next) => next && setTo(next)} />
            </Field>
          </FieldGrid>
        ) : (
          <div style={{ maxHeight: 220, overflow: 'auto', marginTop: 8 }}>
            <Checkbox
              checked={bookings.length > 0 && picked.length === bookings.length}
              label="Select all on this day"
              onCheckedChange={(checked) => setPicked(checked === true ? bookings.map((booking) => booking.id) : [])}
            />
            {bookings.length === 0 ? <p style={{ color: 'var(--hos-fg-muted)' }}>No bookings to tick.</p> : null}
            {bookings.map((booking) => (
              <Checkbox
                key={booking.id}
                checked={picked.includes(booking.id)}
                label={`${booking.resourceName} · Appt ${booking.apptNo || booking.id} · ${booking.patientName || 'Patient'} · ${formatTime12(booking.fromTime)}`}
                onCheckedChange={(checked) => toggle(booking.id, checked === true)}
              />
            ))}
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          <Field label="Cancellation reason">
            <Textarea aria-label="Cancellation reason" value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} />
          </Field>
          <Button type="button" variant="danger" disabled={busy} onClick={() => void runCancel()}>
            Bulk cancel
          </Button>
        </div>
        <div style={{ marginTop: 16 }}>
          <RadioGroup
            aria-label="How to reschedule"
            value={moveBy}
            onValueChange={(value) => setMoveBy(value === 'date' ? 'date' : 'days')}
            options={[
              { value: 'days', label: 'Shift by days' },
              { value: 'date', label: 'Move to a date' },
            ]}
          />
          {moveBy === 'days' ? (
            <Field label="Days" hint="Use a negative number to move earlier.">
              <Input type="number" aria-label="Days" value={shiftDays} onChange={(event) => setShiftDays(event.target.value)} />
            </Field>
          ) : (
            <Field label="Move to">
              <DatePicker aria-label="Move to date" value={toDate} onChange={(next) => setToDate(next ?? '')} />
            </Field>
          )}
          <Button type="button" disabled={busy} onClick={() => void runReschedule()}>
            Bulk reschedule
          </Button>
        </div>
        <InlineNote>{bulkError}</InlineNote>
        {result ? <BulkResult result={result} /> : null}
      </Panel>
    </>
  );
}

function BulkResult({ result }: { result: OtBulkResult }) {
  return (
    <div style={{ marginTop: 12 }}>
      <p style={{ margin: '0 0 8px' }}>
        Done {result.done.length}. Failed {result.failed.length}.
      </p>
      {result.done.length > 0 ? (
        <ul>
          {result.done.map((item) => (
            <li key={`done-${item.id}`}>{item.label || item.id}</li>
          ))}
        </ul>
      ) : null}
      {result.failed.length > 0 ? (
        <ul>
          {result.failed.map((item) => (
            <li key={`fail-${item.id}`}>
              {item.id}: {item.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function minutesToClock(total: number): string {
  const hours = Math.floor(total / 60) % 24;
  const mins = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function blockBox(booking: OtScheduleBooking): { left: number; width: number } | null {
  const start = minutesOf(booking.fromTime);
  const end = minutesOf(booking.toTime);
  if (start == null || end == null) return null;
  if (end <= GRID_START || start >= GRID_END || end <= start) return null;
  const visStart = Math.max(start, GRID_START);
  const visEnd = Math.min(end, GRID_END);
  return {
    left: ((visStart - GRID_START) / STEP) * COL_W,
    width: Math.max(((visEnd - visStart) / STEP) * COL_W - 2, 8),
  };
}
