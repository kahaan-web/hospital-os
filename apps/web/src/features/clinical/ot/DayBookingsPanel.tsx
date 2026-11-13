'use client';

import { Button, Combobox, DatePicker } from '@hos/ui';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { otSchedulingApi, type OtBookingDto } from './api';
import { InlineNote } from './bits';
import { dash, otActionError, todayIso } from './format';
import { useOtLookups } from './useOtLookups';

const HEADERS = [
  'Req no',
  'Doctor',
  'Doctor name',
  'Start time',
  'End time',
  'Patient no',
  'Patient name',
  'IP/OP',
  'Appt no',
  'AnesTyp',
  'AnesTypCd',
  'Nurse name',
] as const;

export function DayBookingsPanel() {
  const router = useRouter();
  const lookups = useOtLookups();
  const [date, setDate] = useState(todayIso);
  const [resourceId, setResourceId] = useState('');
  const [rows, setRows] = useState<OtBookingDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const otOptions = useMemo(
    () => lookups.resources.map((resource) => ({ value: resource.id, label: resource.name || resource.code })),
    [lookups.resources],
  );

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    otSchedulingApi
      .dayBookings(date, resourceId || undefined)
      .then(setRows)
      .catch((err: unknown) => {
        setRows([]);
        setError(otActionError(err));
      })
      .finally(() => setLoading(false));
  }, [date, resourceId]);

  useEffect(() => {
    load();
  }, [load]);

  const openBooking = (row: OtBookingDto) => {
    const params = new URLSearchParams();
    params.set('bookingId', row.id);
    if (row.date) params.set('date', row.date);
    if (row.resourceId) params.set('resourceId', row.resourceId);
    router.push(`/app/ot/book?${params.toString()}`);
  };

  return (
  <>
    <p style={{ margin: '0 0 var(--hos-space-3)', color: 'var(--hos-fg-secondary)', fontSize: 'var(--hos-text-sm)' }}>
      Theatre bookings for the selected date. Click a row to open it on the booking screen.
    </p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--hos-space-3)', alignItems: 'end', marginBottom: 'var(--hos-space-3)' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--hos-text-sm)', fontWeight: 500 }}>
        Date
        <DatePicker aria-label="Booking date" value={date} onChange={(next) => next && setDate(next)} />
      </label>
      <div style={{ minWidth: 220 }}>
        <span style={{ display: 'block', fontSize: 'var(--hos-text-sm)', fontWeight: 500, marginBottom: 4 }}>OT</span>
        <Combobox aria-label="OT" options={otOptions} value={resourceId || undefined} placeholder="All theatres" onValueChange={setResourceId} />
      </div>
      <Button type="button" variant="secondary" onClick={load} disabled={loading}>
        Refresh
      </Button>
      <Button type="button" onClick={() => router.push(`/app/ot/book?date=${encodeURIComponent(date)}${resourceId ? `&resourceId=${encodeURIComponent(resourceId)}` : ''}`)}>
        Direct OT booking
      </Button>
    </div>
    <InlineNote tone="muted">{lookups.warning}</InlineNote>
    <InlineNote>{error}</InlineNote>
    {loading ? <p style={{ color: 'var(--hos-fg-muted)' }}>Loading bookings…</p> : null}
    <div className="hos-table-wrap">
      <table className="hos-table">
        <thead>
          <tr>
            {HEADERS.map((header) => (
              <th key={header} scope="col">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!loading && rows.length === 0 ? (
            <tr>
              <td colSpan={HEADERS.length} style={{ color: 'var(--hos-fg-muted)' }}>
                No bookings for this date{resourceId ? ' in the selected theatre' : ''}.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.id}
                style={{ cursor: 'pointer' }}
                onClick={() => openBooking(row)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openBooking(row);
                  }
                }}
                tabIndex={0}
              >
                <td>{dash(row.requestNo)}</td>
                <td>{dash(row.doctorCode)}</td>
                <td>{dash(row.doctorName)}</td>
                <td style={{ fontVariantNumeric: 'tabular-nums' }}>{dash(row.startTime)}</td>
                <td style={{ fontVariantNumeric: 'tabular-nums' }}>{dash(row.endTime)}</td>
                <td>{dash(row.patientNo)}</td>
                <td>{dash(row.patientName)}</td>
                <td>{row.patientType === 'ip' ? 'IP' : row.patientType === 'op' ? 'OP' : '—'}</td>
                <td style={{ fontVariantNumeric: 'tabular-nums' }}>{dash(row.apptNo)}</td>
                <td>{dash(row.anesType)}</td>
                <td>{dash(row.anesTypeCode)}</td>
                <td>{dash(row.nurseName)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  </>
  );
}
