'use client';

import type { DoctorDto, VisitRegisterRowDto, VisitStatisticsDto } from '@hos/shared';
import { createTranslator } from '@hos/shared';
import { Button, DatePicker, EmptyState, Field, PageHeader, Select, Tabs } from '@hos/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { formatDate } from '@/lib/format';
import { fetchMe, isTenantMe } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { appointmentsApi, plusDays, todayIso } from './api';

const t = createTranslator('en');

function csvCell(value: string | number | null): string {
  const text = value == null || value === '' ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(rows: VisitRegisterRowDto[]) {
  const header = ['Date', 'Number', 'UHID', 'Patient', 'Doctor', 'Visit type', 'Token', 'Payer', 'Status'];
  const lines = [
    header,
    ...rows.map((row) => [
      formatDate(row.startedAt),
      row.number,
      row.uhid,
      row.patientName,
      row.doctorName,
      row.visitType ?? '',
      row.token ?? '',
      row.payerType,
      row.status,
    ]),
  ];
  const blob = new Blob(['\uFEFF' + lines.map((line) => line.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'visit-register.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function RegisterTable({ rows }: { rows: VisitRegisterRowDto[] }) {
  if (rows.length === 0) return <EmptyState title={t('clinical.appointments.noVisits')} />;
  return (
    <div className="hos-table-wrap">
      <table className="hos-table">
        <thead>
          <tr>
            <th scope="col">{t('clinical.appointments.date')}</th>
            <th scope="col">{t('clinical.appointments.number')}</th>
            <th scope="col">{t('clinical.appointments.uhid')}</th>
            <th scope="col">{t('clinical.appointments.patient')}</th>
            <th scope="col">{t('clinical.appointments.doctor')}</th>
            <th scope="col">{t('clinical.appointments.visitType')}</th>
            <th scope="col">{t('clinical.appointments.token')}</th>
            <th scope="col">{t('clinical.appointments.payer')}</th>
            <th scope="col">{t('clinical.appointments.status')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.encounterId}>
              <td>{formatDate(row.startedAt)}</td>
              <td style={{ fontVariantNumeric: 'tabular-nums' }}>{row.number}</td>
              <td style={{ fontVariantNumeric: 'tabular-nums' }}>{row.uhid}</td>
              <td>{row.patientName}</td>
              <td>{row.doctorName}</td>
              <td>{row.visitType === 'follow_up' ? t('clinical.appointments.followUp') : row.visitType === 'new' ? t('clinical.appointments.newPatient') : '—'}</td>
              <td style={{ fontVariantNumeric: 'tabular-nums' }}>{row.token ?? '—'}</td>
              <td>{row.payerType}</td>
              <td>{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReportsScreen() {
  const today = todayIso();
  const [from, setFrom] = useState(plusDays(today, -7));
  const [to, setTo] = useState(today);
  const [doctorId, setDoctorId] = useState('');
  const [doctors, setDoctors] = useState<DoctorDto[]>([]);
  const [register, setRegister] = useState<VisitRegisterRowDto[] | null>(null);
  const [detail, setDetail] = useState<VisitRegisterRowDto[] | null>(null);
  const [stats, setStats] = useState<VisitStatisticsDto | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([fetchMe(), appointmentsApi.doctors()])
      .then(([me, rows]) => {
        const here = me && isTenantMe(me) ? me.currentLocationId : null;
        const list = rows.filter((doctor) => doctor.active && (!here || doctor.locationId === here));
        setDoctors(list);
        setDoctorId(list[0]?.id ?? '');
      })
      .finally(() => setReady(true));
  }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [reg, statistics, byDoctor] = await Promise.all([
        appointmentsApi.register(from, to),
        appointmentsApi.statistics(from, to),
        doctorId ? appointmentsApi.byDoctor(from, to, doctorId) : Promise.resolve(null),
      ]);
      setRegister(reg.rows);
      setStats(statistics);
      setDetail(byDoctor?.rows ?? []);
      setTruncated(reg.truncated || statistics.truncated || Boolean(byDoctor?.truncated));
    } catch (err) {
      setError(err instanceof ApiError ? err : err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader
        title={t('clinical.appointments.reports')}
        description={stats?.locationName ? t('clinical.appointments.showingLocation', { location: stats.locationName }) : undefined}
        actions={
          <Button asChild variant="secondary">
            <Link href="/app/opd/queue">{t('clinical.appointments.queue')}</Link>
          </Button>
        }
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--hos-space-3)', alignItems: 'flex-end', margin: 'var(--hos-space-4) 0' }}>
        <Field label={t('clinical.appointments.fromDate')}>
          <DatePicker value={from} onChange={(next) => next && setFrom(next)} aria-label={t('clinical.appointments.fromDate')} />
        </Field>
        <Field label={t('clinical.appointments.toDate')}>
          <DatePicker value={to} onChange={(next) => next && setTo(next)} aria-label={t('clinical.appointments.toDate')} />
        </Field>
        <Field label={t('clinical.appointments.doctor')}>
          <Select value={doctorId} onChange={(event) => setDoctorId(event.target.value)} disabled={!ready}>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button onClick={() => void load()} loading={loading}>
          {t('clinical.appointments.loadReport')}
        </Button>
      </div>
      {error ? <PageError error={error} onRetry={() => void load()} /> : null}
      {loading ? <PageLoading /> : null}
      {truncated ? <p style={{ color: 'var(--hos-status-warning-fg)' }}>Showing the first 1,000 visits.</p> : null}
      {register && stats ? (
        <Tabs
          tabs={[
            {
              value: 'register',
              label: t('clinical.appointments.reportsRegister'),
              content: (
                <>
                  <div style={{ margin: 'var(--hos-space-3) 0' }}>
                    <Button variant="secondary" onClick={() => downloadCsv(register)} disabled={register.length === 0}>
                      {t('clinical.appointments.downloadCsv')}
                    </Button>
                  </div>
                  <RegisterTable rows={register} />
                </>
              ),
            },
            {
              value: 'doctor',
              label: t('clinical.appointments.reportsDoctor'),
              content: <RegisterTable rows={detail ?? []} />,
            },
            {
              value: 'stats',
              label: t('clinical.appointments.reportsStats'),
              content: (
                <div>
                  <p style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {t('clinical.appointments.totalVisits')}: {stats.total} · {t('clinical.appointments.newPatient')}: {stats.newCount} · {t('clinical.appointments.followUp')}: {stats.followUpCount}
                  </p>
                  <div className="hos-table-wrap" style={{ marginTop: 'var(--hos-space-3)' }}>
                    <table className="hos-table">
                      <thead>
                        <tr>
                          <th scope="col">{t('clinical.appointments.doctor')}</th>
                          <th scope="col">{t('clinical.appointments.totalVisits')}</th>
                          <th scope="col">{t('clinical.appointments.newPatient')}</th>
                          <th scope="col">{t('clinical.appointments.followUp')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.byDoctor.map((row) => (
                          <tr key={row.doctorId ?? 'none'}>
                            <td>{row.doctorName}</td>
                            <td style={{ fontVariantNumeric: 'tabular-nums' }}>{row.total}</td>
                            <td style={{ fontVariantNumeric: 'tabular-nums' }}>{row.newCount}</td>
                            <td style={{ fontVariantNumeric: 'tabular-nums' }}>{row.followUpCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ),
            },
          ]}
        />
      ) : null}
    </>
  );
}
