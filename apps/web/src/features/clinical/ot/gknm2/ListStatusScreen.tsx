'use client';

import { formatDate } from '@hos/shared';
import { Button, Checkbox, DatePicker, EmptyState, Field, Input, PageHeader, RadioGroup, Select } from '@hos/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { otGknm2Api, type ListStatusCriteria, type ListStatusFilter, type ListStatusRowDto } from '@/features/clinical/ot/api-gknm2';
import { PageError } from '@/features/common/LoadState';
import { ApiError } from '@/lib/api';
import { OtSectionNav } from './OtSectionNav';
import { PATIENT_TYPE_OPTIONS, plusDays, todayIso } from './helpers';

export function ListStatusScreen() {
  const today = todayIso();
  const [useFromDate, setUseFromDate] = useState(true);
  const [from, setFrom] = useState(plusDays(today, -7));
  const [to, setTo] = useState(today);
  const [criteria, setCriteria] = useState<ListStatusCriteria>('surgery');
  const [status, setStatus] = useState<ListStatusFilter>('active');
  const [otId, setOtId] = useState('');
  const [creditCompany, setCreditCompany] = useState('');
  const [patientType, setPatientType] = useState('');
  const [ots, setOts] = useState<{ id: string; resourceCode: string }[]>([]);
  const [rows, setRows] = useState<ListStatusRowDto[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    otGknm2Api.listOtOptions().then(setOts).catch(() => setOts([]));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    setSearched(true);
    otGknm2Api
      .listStatus({
        from: useFromDate ? from : undefined,
        to,
        criteria,
        status,
        otId: otId || undefined,
        creditCompany: creditCompany.trim() || undefined,
        patientType: patientType || undefined,
      })
      .then(setRows)
      .catch((err) => {
        if (err instanceof ApiError && (err.status === 404 || err.status === 501)) {
          setRows([]);
        } else {
          setError(err);
        }
      })
      .finally(() => setLoading(false));
  }, [useFromDate, from, to, criteria, status, otId, creditCompany, patientType]);

  const clear = () => {
    setUseFromDate(true);
    setFrom(plusDays(today, -7));
    setTo(today);
    setCriteria('surgery');
    setStatus('active');
    setOtId('');
    setCreditCompany('');
    setPatientType('');
    setRows(null);
    setSearched(false);
    setError(null);
  };

  return (
    <>
      <OtSectionNav current="/app/ot/list-status" />
      <PageHeader
        title="OT list status"
        description="Bookings and surgeries for the selected period."
        actions={
          <Link href="/app/ot" className="hos-btn hos-btn--md hos-btn--secondary">
            Back
          </Link>
        }
      />

      <form
        className="mb-6 flex max-w-5xl flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <MotionDates
          useFromDate={useFromDate}
          setUseFromDate={setUseFromDate}
          from={from}
          setFrom={setFrom}
          to={to}
          setTo={setTo}
        />
        <Field label="Criteria">
          <RadioGroup
            name="criteria"
            value={criteria}
            onValueChange={(v) => setCriteria(v as ListStatusCriteria)}
            options={[
              { value: 'surgery', label: 'Surgery date' },
              { value: 'booking', label: 'Booking date' },
            ]}
          />
        </Field>
        <Field label="Status">
          <RadioGroup
            name="status"
            value={status}
            onValueChange={(v) => setStatus(v as ListStatusFilter)}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'cancelled', label: 'Cancelled' },
              { value: 'all', label: 'All' },
            ]}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="OT">
            <Select value={otId} onChange={(e) => setOtId(e.target.value)} aria-label="OT">
              <option value="">All theatres</option>
              {ots.map((ot) => (
                <option key={ot.id} value={ot.id}>
                  {ot.resourceCode}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cr company" hint="Credit company / payer name">
            <Input value={creditCompany} onChange={(e) => setCreditCompany(e.target.value)} aria-label="Cr company" />
          </Field>
          <Field label="Patient type">
            <Select value={patientType} onChange={(e) => setPatientType(e.target.value)} aria-label="Patient type">
              {PATIENT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={loading}>
            {loading ? 'Loading…' : 'Show'}
          </Button>
          <Button type="button" variant="secondary" onClick={clear}>
            Clear
          </Button>
        </div>
      </form>

      {error ? <PageError error={error} onRetry={load} /> : null}

      {searched && !loading && !error ? (
        rows && rows.length > 0 ? (
          <div className="hos-table-wrap">
            <table className="hos-table">
              <thead>
                <tr>
                  <th scope="col">Surgery date</th>
                  <th scope="col">Bkg date</th>
                  <th scope="col">Bkg time</th>
                  <th scope="col">Theatre</th>
                  <th scope="col">From tm</th>
                  <th scope="col">To tm</th>
                  <th scope="col">Booking doctor</th>
                  <th scope="col">Surgeon &amp; assistant</th>
                  <th scope="col">Surgery</th>
                  <th scope="col">Remark</th>
                  <th scope="col">Patient no</th>
                  <th scope="col">IP no</th>
                  <th scope="col">Patient name</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.patientNo}-${row.bookingTime}-${index}`}>
                    <td>{row.surgeryDate ? formatDate(row.surgeryDate) : '—'}</td>
                    <td>{row.bookingDate ? formatDate(row.bookingDate) : '—'}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{row.bookingTime || '—'}</td>
                    <td>{row.theatre}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{row.fromTime || '—'}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{row.toTime || '—'}</td>
                    <td>{row.bookingDoctor}</td>
                    <td>{row.surgeonAndAssistant}</td>
                    <td>{row.surgery}</td>
                    <td>{row.remark || '—'}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{row.patientNo}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{row.ipNo ?? '—'}</td>
                    <td>{row.patientName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No rows for this filter"
            description="Try widening the date range or choosing All status. The list-status API may still be deploying."
          />
        )
      ) : null}
    </>
  );
}

function MotionDates({
  useFromDate,
  setUseFromDate,
  from,
  setFrom,
  to,
  setTo,
}: {
  useFromDate: boolean;
  setUseFromDate: (v: boolean) => void;
  from: string;
  setFrom: (v: string) => void;
  to: string;
  setTo: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <Checkbox
        id="use-from"
        checked={useFromDate}
        onCheckedChange={(c) => setUseFromDate(c === true)}
        label="Dates from"
      />
      <Field label="From" className="min-w-[10rem]">
        <DatePicker value={from} onChange={(v) => v && setFrom(v)} disabled={!useFromDate} aria-label="From date" />
      </Field>
      <Field label="To" className="min-w-[10rem]">
        <DatePicker value={to} onChange={(v) => v && setTo(v)} aria-label="To date" />
      </Field>
    </div>
  );
}
