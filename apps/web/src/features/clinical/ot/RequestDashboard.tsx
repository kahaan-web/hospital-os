'use client';

import { Badge, Button, Combobox, DatePicker, PageHeader, RadioGroup, Select } from '@hos/ui';
import { Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { otSchedulingApi, type OtRequestDto, type OtSort } from './api';
import { InlineNote } from './bits';
import { CancelRequestDialog } from './CancelRequestDialog';
import { dash, formatOtAge, formatOtDate, otActionError, patientTypeLabel, sexLabel, todayIso } from './format';
import { OutstandingDialog } from './OutstandingDialog';
import { useOtLookups } from './useOtLookups';

const SORTS: { value: OtSort; label: string }[] = [
  { value: 'requestNo', label: 'Request No' },
  { value: 'patientNo', label: 'Patient No' },
  { value: 'patientName', label: 'Patient Name' },
  { value: 'doctorName', label: 'Doctor Name' },
];

function statusTone(status: string): 'warning' | 'info' | 'error' | 'neutral' {
  if (status === 'booked') return 'info';
  if (status === 'cancelled') return 'error';
  if (status === 'requested') return 'warning';
  return 'neutral';
}

export function RequestDashboard() {
  const router = useRouter();
  const lookups = useOtLookups();
  const [sort, setSort] = useState<OtSort>('requestNo');
  const [otId, setOtId] = useState('');
  const [from, setFrom] = useState(todayIso);
  const [to, setTo] = useState(todayIso);
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<OtRequestDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [outstandingId, setOutstandingId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    otSchedulingApi
      .requests({ from, to, otId: otId || undefined, sort, status: status || undefined })
      .then(setRows)
      .catch((err: unknown) => {
        setRows([]);
        setError(otActionError(err));
      })
      .finally(() => setLoading(false));
  }, [from, to, otId, sort, status]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (selectedId && !rows.some((row) => row.id === selectedId)) setSelectedId(null);
  }, [rows, selectedId]);

  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const otOptions = useMemo(
    () => lookups.resources.map((resource) => ({ value: resource.id, label: resource.name || resource.code })),
    [lookups.resources],
  );

  const openDetail = (id: string) => router.push(`/app/ot/requests/${id}`);

  return (
    <>
      <PageHeader
        title="OT scheduling"
        description="Requests for a date range. Select a row to book, edit or cancel it."
      />
      <div className="ot-no-print" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hos-space-3)', marginBottom: 'var(--hos-space-4)' }}>
        <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
          <legend style={{ fontSize: 'var(--hos-text-sm)', fontWeight: 600, marginBottom: 6 }}>Sort by</legend>
          <RadioGroup aria-label="Sort by" value={sort} onValueChange={(value) => setSort(value as OtSort)} options={SORTS} />
        </fieldset>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--hos-space-3)', alignItems: 'end' }}>
          <div style={{ minWidth: 220 }}>
            <span style={{ display: 'block', fontSize: 'var(--hos-text-sm)', fontWeight: 500, marginBottom: 4 }}>OT</span>
            <Combobox aria-label="OT" options={otOptions} value={otId || undefined} placeholder="All theatres" onValueChange={setOtId} />
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--hos-text-sm)', fontWeight: 500 }}>
            From
            <DatePicker aria-label="From date" value={from} onChange={(next) => next && setFrom(next)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--hos-text-sm)', fontWeight: 500 }}>
            To date
            <DatePicker aria-label="To date" value={to} onChange={(next) => next && setTo(next)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--hos-text-sm)', fontWeight: 500 }}>
            Status
            <Select aria-label="Status" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">All</option>
              <option value="requested">Requested</option>
              <option value="booked">Booked</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </label>
          <Button type="button" variant="secondary" onClick={() => router.push('/app/ot/list-status')}>
            OT List
          </Button>
          {otId ? (
            <Button type="button" variant="ghost" onClick={() => setOtId('')}>
              Clear OT
            </Button>
          ) : null}
        </div>
        <InlineNote tone="muted">{lookups.warning}</InlineNote>
      </div>

      <InlineNote>{error}</InlineNote>
      {error ? (
        <Button type="button" variant="secondary" onClick={load}>
          Retry
        </Button>
      ) : null}
      {loading ? <p style={{ color: 'var(--hos-fg-muted)' }}>Loading requests…</p> : null}

      <div className="hos-table-wrap ot-print-table">
        <table className="hos-table">
          <caption style={{ captionSide: 'bottom', textAlign: 'left', color: 'var(--hos-fg-muted)', fontSize: 'var(--hos-text-xs)', paddingTop: 8 }}>
            OP/IP is the patient type. Office permission is the flag from outstanding. Age is years, months and days.
          </caption>
          <thead>
            <tr>
              <th scope="col">Sel</th>
              <th scope="col">Req no</th>
              <th scope="col">IP no</th>
              <th scope="col">Patient name</th>
              <th scope="col">O.S.</th>
              <th scope="col">Doctor name</th>
              <th scope="col">OP/IP</th>
              <th scope="col">Office permission</th>
              <th scope="col">Gender</th>
              <th scope="col">Age</th>
              <th scope="col">Mobile</th>
              <th scope="col">Expected date</th>
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={12} style={{ color: 'var(--hos-fg-muted)' }}>
                  No OT requests in this range.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const selected = row.id === selectedId;
                return (
                  <tr
                    key={row.id}
                    aria-selected={selected}
                    style={{ background: selected ? 'var(--hos-brand-50)' : undefined, cursor: 'pointer' }}
                    onClick={(event) => {
                      const target = event.target as HTMLElement;
                      if (target.closest('a, button, input, label')) return;
                      openDetail(row.id);
                    }}
                  >
                    <td>
                      <input
                        type="radio"
                        name="ot-request-select"
                        checked={selected}
                        aria-label={`Select request ${row.requestNo}`}
                        onChange={() => setSelectedId(row.id)}
                      />
                    </td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                      <Button type="button" variant="link" onClick={() => openDetail(row.id)}>
                        {dash(row.requestNo)}
                      </Button>{' '}
                      <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                    </td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{dash(row.ipNo)}</td>
                    <td>{dash(row.patientName)}</td>
                    <td>
                      <Button type="button" variant="link" onClick={() => setOutstandingId(row.id)}>
                        OS
                      </Button>
                    </td>
                    <td>{dash(row.doctorName)}</td>
                    <td>{patientTypeLabel(row.patientType)}</td>
                    <td>
                      {row.officePermission ? <Check size={16} strokeWidth={1.5} aria-label="Office permission granted" /> : <span aria-label="No office permission">—</span>}
                    </td>
                    <td>{dash(sexLabel(row.sex))}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {formatOtAge({ years: row.ageYears, months: row.ageMonths, days: row.ageDays, label: row.ageLabel, dob: row.dob })}
                    </td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{dash(row.mobile)}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{formatOtDate(row.expectedDate)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="ot-no-print" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--hos-space-2)', marginTop: 'var(--hos-space-4)' }}>
        <Button type="button" variant="secondary" onClick={() => router.push('/app/ot/book')}>
          Direct OT booking
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!selected}
          title={selected ? undefined : 'Select a request first'}
          onClick={() => selected && router.push(`/app/ot/book?requestId=${encodeURIComponent(selected.id)}`)}
        >
          OT booking against request
        </Button>
        <Button type="button" onClick={() => router.push('/app/ot/requests/new')}>
          New OT request
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!selected || selected.status !== 'requested'}
          title={!selected ? 'Select a request first' : selected.status !== 'requested' ? 'Only a requested row can be edited' : undefined}
          onClick={() => selected && router.push(`/app/ot/requests/${selected.id}/edit`)}
        >
          Edit OT request
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={!selected || selected.status !== 'requested'}
          title={!selected ? 'Select a request first' : selected.status !== 'requested' ? 'Only a requested row can be cancelled' : undefined}
          onClick={() => selected && setCancelId(selected.id)}
        >
          Cancel OT request
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.push('/app/ot/schedule')}>
          OT schedule dashboard
        </Button>
        <Button type="button" variant="secondary" onClick={() => window.print()}>
          Print
        </Button>
        <Button type="button" variant="ghost" disabled={!selectedId} title="Clear the selected row" onClick={() => setSelectedId(null)}>
          Cancel
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push('/app')}>
          Exit
        </Button>
        <Button type="button" variant="secondary" disabled={!selected} onClick={() => selected && openDetail(selected.id)}>
          View
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push('/app/ot/reports')}>
          Reports
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push('/app/ot/masters')}>
          Masters
        </Button>
      </div>

      <OutstandingDialog
        requestId={outstandingId}
        remark={rows.find((row) => row.id === outstandingId)?.officePermissionRemark ?? ''}
        onClose={() => setOutstandingId(null)}
        onPermission={(granted) => {
          if (!outstandingId) return;
          setRows((prev) => prev.map((row) => (row.id === outstandingId ? { ...row, officePermission: granted } : row)));
        }}
      />
      <CancelRequestDialog
        requestId={cancelId}
        onClose={() => setCancelId(null)}
        onCancelled={() => {
          setCancelId(null);
          setSelectedId(null);
          load();
        }}
      />
    </>
  );
}
