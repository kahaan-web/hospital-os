'use client';

import { formatDate } from '@hos/shared';
import { Button, DatePicker, EmptyState, Field, PageHeader, Select, PrintLayout } from '@hos/ui';
import type { DoctorDto } from '@hos/shared';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  otGknm2Api,
  type CancellationReportRowDto,
  type DepartmentMatrixDto,
  type DuplicateReportRowDto,
  type FrozenStatsRowDto,
  type RegisterReportRowDto,
  type ReportKind,
  type ReportResultDto,
  type SurgeryMasterDto,
} from '@/features/clinical/ot/api-gknm2';
import { PageError } from '@/features/common/LoadState';
import { ApiError } from '@/lib/api';
import { apiGet } from '@/lib/api';
import { OtSectionNav } from './OtSectionNav';
import { BOOKING_TYPE_OPTIONS, plusDays, todayIso } from './helpers';

type ReportPicker =
  | 'register'
  | 'register_date'
  | 'doctor'
  | 'department'
  | 'anaesthetist'
  | 'cancellation'
  | 'duplicates'
  | 'frozen';

const REPORT_OPTIONS: { value: ReportPicker; label: string; kind: ReportKind }[] = [
  { value: 'register', label: 'OT register (with LOS)', kind: 'register' },
  { value: 'register_date', label: 'Date-wise register', kind: 'register' },
  { value: 'doctor', label: 'Doctor-wise surgery list', kind: 'doctor' },
  { value: 'department', label: 'Department-wise matrix', kind: 'department' },
  { value: 'anaesthetist', label: 'Anaesthetist-wise', kind: 'anaesthetist' },
  { value: 'cancellation', label: 'Cancellation list', kind: 'cancellation' },
  { value: 'duplicates', label: 'Check duplication', kind: 'duplicates' },
  { value: 'frozen', label: 'Frozen statistics', kind: 'frozen' },
];

export function ReportsScreen() {
  const today = todayIso();
  const [picker, setPicker] = useState<ReportPicker>('register');
  const [from, setFrom] = useState(plusDays(today, -30));
  const [to, setTo] = useState(today);
  const [otId, setOtId] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [anaesthetistId, setAnaesthetistId] = useState('');
  const [bookingType, setBookingType] = useState('');
  const [surgeryIds, setSurgeryIds] = useState<string[]>([]);

  const [ots, setOts] = useState<{ id: string; resourceCode: string }[]>([]);
  const [doctors, setDoctors] = useState<DoctorDto[]>([]);
  const [surgeries, setSurgeries] = useState<SurgeryMasterDto[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);

  const [result, setResult] = useState<ReportResultDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [loaded, setLoaded] = useState(false);

  const selected = useMemo(() => REPORT_OPTIONS.find((r) => r.value === picker)!, [picker]);

  useEffect(() => {
    Promise.all([
      otGknm2Api.listOtOptions(),
      apiGet<DoctorDto[]>('/tenant/clinical/doctors').catch(() => [] as DoctorDto[]),
      otGknm2Api.listSurgeries().catch(() => [] as SurgeryMasterDto[]),
      apiGet<{ id: string; name: string }[]>('/tenant/clinical/departments').catch(() => []),
    ]).then(([otRows, docRows, surgRows, deptRows]) => {
      setOts(otRows);
      setDoctors(docRows.filter((d) => d.active));
      setSurgeries(surgRows.filter((s) => s.active));
      setDepartments(deptRows);
    });
  }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    setLoaded(true);
    try {
      const data = await otGknm2Api.report({
        kind: selected.kind,
        from,
        to,
        otId: otId || undefined,
        doctorId: doctorId || undefined,
        departmentId: departmentId || undefined,
        anaesthetistId: anaesthetistId || undefined,
        bookingType: bookingType || undefined,
        surgeryIds: surgeryIds.length ? surgeryIds : undefined,
      });
      setResult(data);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 501)) {
        setResult(null);
      } else {
        setError(err);
      }
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    setFrom(plusDays(today, -30));
    setTo(today);
    setOtId('');
    setDoctorId('');
    setDepartmentId('');
    setAnaesthetistId('');
    setBookingType('');
    setSurgeryIds([]);
    setResult(null);
    setLoaded(false);
    setError(null);
  };

  const print = () => window.print();

  const toggleSurgery = (id: string) => {
    setSurgeryIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  return (
    <>
      <OtSectionNav current="/app/ot/reports" />
      <PageHeader
        title="OT reports"
        description="Registers, statistics and cancellation lists for OT scheduling."
        actions={
          <Link href="/app/ot" className="hos-btn hos-btn--md hos-btn--secondary">
            Back
          </Link>
        }
      />

      <form
        className="no-print mb-6 flex max-w-5xl flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <Field label="Report">
          <Select value={picker} onChange={(e) => setPicker(e.target.value as ReportPicker)} aria-label="Report type">
            {REPORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From">
            <DatePicker value={from} onChange={(v) => v && setFrom(v)} aria-label="From date" />
          </Field>
          <Field label="To">
            <DatePicker value={to} onChange={(v) => v && setTo(v)} aria-label="To date" />
          </Field>
        </div>
        <MotionFilters
          otId={otId}
          setOtId={setOtId}
          ots={ots}
          doctorId={doctorId}
          setDoctorId={setDoctorId}
          doctors={doctors}
          departmentId={departmentId}
          setDepartmentId={setDepartmentId}
          departments={departments}
          anaesthetistId={anaesthetistId}
          setAnaesthetistId={setAnaesthetistId}
          bookingType={bookingType}
          setBookingType={setBookingType}
        />
        {(picker === 'register' || picker === 'register_date' || picker === 'doctor' || picker === 'department') && surgeries.length > 0 ? (
          <Field label="Surgeries (multi-select)" hint="CR P11: filter by surgeries from master">
            <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto rounded border p-2" style={{ borderColor: 'var(--hos-line)' }}>
              {surgeries.map((s) => (
                <label key={s.id} className="flex cursor-pointer items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={surgeryIds.includes(s.id)}
                    onChange={() => toggleSurgery(s.id)}
                    aria-label={s.name}
                  />
                  {s.name} ({s.type})
                </label>
              ))}
            </div>
          </Field>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={loading}>
            {loading ? 'Loading…' : 'Show'}
          </Button>
          <Button type="button" variant="secondary" onClick={print} disabled={!loaded}>
            Print
          </Button>
          <Button type="button" variant="secondary" onClick={clear}>
            Clear
          </Button>
        </div>
      </form>

      {error ? <PageError error={error} onRetry={() => void load()} /> : null}

      <MotionReportBody
        loaded={loaded}
        loading={loading}
        picker={picker}
        result={result}
        selectedLabel={selected.label}
        from={from}
        to={to}
      />
    </>
  );
}

function MotionFilters(props: {
  otId: string;
  setOtId: (v: string) => void;
  ots: { id: string; resourceCode: string }[];
  doctorId: string;
  setDoctorId: (v: string) => void;
  doctors: DoctorDto[];
  departmentId: string;
  setDepartmentId: (v: string) => void;
  departments: { id: string; name: string }[];
  anaesthetistId: string;
  setAnaesthetistId: (v: string) => void;
  bookingType: string;
  setBookingType: (v: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="OT">
        <Select value={props.otId} onChange={(e) => props.setOtId(e.target.value)} aria-label="OT">
          <option value="">All</option>
          {props.ots.map((ot) => (
            <option key={ot.id} value={ot.id}>
              {ot.resourceCode}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Operating doctor">
        <Select value={props.doctorId} onChange={(e) => props.setDoctorId(e.target.value)} aria-label="Operating doctor">
          <option value="">All</option>
          {props.doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Department">
        <Select value={props.departmentId} onChange={(e) => props.setDepartmentId(e.target.value)} aria-label="Department">
          <option value="">All</option>
          {props.departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Anaesthetist">
        <Select value={props.anaesthetistId} onChange={(e) => props.setAnaesthetistId(e.target.value)} aria-label="Anaesthetist">
          <option value="">All</option>
          {props.doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Booking type">
        <Select value={props.bookingType} onChange={(e) => props.setBookingType(e.target.value)} aria-label="Booking type">
          {BOOKING_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value || 'all'} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

function MotionReportBody({
  loaded,
  loading,
  picker,
  result,
  selectedLabel,
  from,
  to,
}: {
  loaded: boolean;
  loading: boolean;
  picker: ReportPicker;
  result: ReportResultDto | null;
  selectedLabel: string;
  from: string;
  to: string;
}) {
  if (!loaded || loading) return null;
  if (!result) {
    return (
      <EmptyState
        title="No report data"
        description="The report API may still be building. Adjust filters and try again."
      />
    );
  }

  return (
    <div className="hos-ot-report-print">
      <PrintLayout
        title={
          <>
            {selectedLabel}
            <span style={{ display: 'block', fontSize: '0.875rem', fontWeight: 400, marginTop: '0.25rem' }}>
              {formatDate(from)} – {formatDate(to)}
            </span>
          </>
        }
      >
        {result.kind === 'department' ? (
          <DepartmentMatrixTable matrix={result.matrix} />
        ) : result.kind === 'cancellation' ? (
          <CancellationTable rows={result.rows} />
        ) : result.kind === 'duplicates' ? (
          <DuplicatesTable rows={result.rows} />
        ) : result.kind === 'frozen' ? (
          <FrozenTable rows={result.rows} />
        ) : (
          <RegisterTable rows={result.rows} showLos={picker === 'register'} groupByDate={picker === 'register_date'} />
        )}
      </PrintLayout>
    </div>
  );
}

function RegisterTable({
  rows,
  showLos,
  groupByDate,
}: {
  rows: RegisterReportRowDto[];
  showLos: boolean;
  groupByDate: boolean;
}) {
  const sorted = groupByDate ? [...rows].sort((a, b) => a.date.localeCompare(b.date)) : rows;
  if (sorted.length === 0) return <EmptyState title="No rows" />;
  return (
    <div className="hos-table-wrap">
      <table className="hos-table">
        <thead>
          <tr>
            {groupByDate ? <th scope="col">Sno</th> : null}
            <th scope="col">OT</th>
            <th scope="col">Date</th>
            {!groupByDate ? <th scope="col">Time</th> : null}
            <th scope="col">OP no</th>
            <th scope="col">IP no</th>
            <th scope="col">Name</th>
            <th scope="col">Sex</th>
            <th scope="col">Age</th>
            <th scope="col">Diagnosis</th>
            <th scope="col">Surgery</th>
            {showLos ? <th scope="col">LOS</th> : null}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={`${row.opNo}-${row.date}-${i}`}>
              {groupByDate ? <td>{row.sno ?? i + 1}</td> : null}
              <td>{row.ot}</td>
              <td>{row.date ? formatDate(row.date) : '—'}</td>
              {!groupByDate ? <td>{row.time ?? '—'}</td> : null}
              <td>{row.opNo}</td>
              <td>{row.ipNo ?? '—'}</td>
              <td>{row.name}</td>
              <td>{row.sex}</td>
              <td>{row.age}</td>
              <td>{row.diagnosis}</td>
              <td>{row.surgery}</td>
              {showLos ? <td>{row.lengthOfStay ?? '—'}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DepartmentMatrixTable({ matrix }: { matrix: DepartmentMatrixDto }) {
  if (!matrix.ots.length || !matrix.departments.length) return <EmptyState title="No matrix data" />;
  const cellMap = new Map(matrix.cells.map((c) => [`${c.department}::${c.ot}`, c.count]));
  return (
    <div className="hos-table-wrap">
      <table className="hos-table">
        <thead>
          <tr>
            <th scope="col">Department</th>
            {matrix.ots.map((ot) => (
              <th key={ot} scope="col">
                {ot}
              </th>
            ))}
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {matrix.departments.map((dept) => (
            <tr key={dept}>
              <td>{dept}</td>
              {matrix.ots.map((ot) => (
                <td key={ot} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {cellMap.get(`${dept}::${ot}`) ?? 0}
                </td>
              ))}
              <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{matrix.rowTotals[dept] ?? 0}</td>
            </tr>
          ))}
          <tr>
            <td style={{ fontWeight: 600 }}>Total</td>
            {matrix.ots.map((ot) => (
              <td key={ot} style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                {matrix.colTotals[ot] ?? 0}
              </td>
            ))}
            <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{matrix.grandTotal}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function CancellationTable({ rows }: { rows: CancellationReportRowDto[] }) {
  if (rows.length === 0) return <EmptyState title="No cancellations" />;
  return (
    <table className="hos-table">
      <thead>
        <tr>
          <th>Type</th>
          <th>OT</th>
          <th>Number</th>
          <th>Name</th>
          <th>Date</th>
          <th>Time</th>
          <th>Reason</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={`${row.number}-${i}`}>
            <td>{row.type}</td>
            <td>{row.ot}</td>
            <td>{row.number}</td>
            <td>{row.name}</td>
            <td>{formatDate(row.date)}</td>
            <td>{row.time}</td>
            <td>{row.reason}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DuplicatesTable({ rows }: { rows: DuplicateReportRowDto[] }) {
  if (rows.length === 0) return <EmptyState title="No duplicate bookings" />;
  return (
    <table className="hos-table">
      <thead>
        <tr>
          <th>Sno</th>
          <th>Date</th>
          <th>Time</th>
          <th>OP no</th>
          <th>IP no</th>
          <th>Name</th>
          <th>Sex</th>
          <th>Diagnosis</th>
          <th>Surgery</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.sno}>
            <td>{row.sno}</td>
            <td>{formatDate(row.date)}</td>
            <td>{row.time}</td>
            <td>{row.opNo}</td>
            <td>{row.ipNo ?? '—'}</td>
            <td>{row.name}</td>
            <td>{row.sex}</td>
            <td>{row.diagnosis}</td>
            <td>{row.surgery}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FrozenTable({ rows }: { rows: FrozenStatsRowDto[] }) {
  if (rows.length === 0) return <EmptyState title="No frozen-section cases" />;
  return (
    <table className="hos-table">
      <thead>
        <tr>
          <th>Sno</th>
          <th>OP/IP</th>
          <th>Number</th>
          <th>Date/time</th>
          <th>Name</th>
          <th>Sex/age</th>
          <th>Ward</th>
          <th>OT</th>
          <th>Diagnosis</th>
          <th>Surgery</th>
          <th>Surgeon</th>
          <th>Frozen indication</th>
          <th>Cancelled</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.sno}>
            <td>{row.sno}</td>
            <td>{row.patientType}</td>
            <td>{row.number}</td>
            <td>{row.dateTime}</td>
            <td>{row.name}</td>
            <td>{row.sexAge}</td>
            <td>{row.ward}</td>
            <td>{row.ot}</td>
            <td>{row.diagnosis}</td>
            <td>{row.surgery}</td>
            <td>{row.surgeon}</td>
            <td>{row.frozenIndication}</td>
            <td>{row.cancelled ? 'Yes' : 'No'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
