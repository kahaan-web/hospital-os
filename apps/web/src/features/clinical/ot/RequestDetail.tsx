'use client';

import { Badge, Button, PageHeader } from '@hos/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { otSchedulingApi, type OtRequestDto } from './api';
import { Panel } from './bits';
import { dash, formatOtAge, formatOtDate, patientTypeLabel, sexLabel, yesNo } from './format';
import { useOtLookups } from './useOtLookups';

function tone(status: string): 'neutral' | 'info' | 'warning' | 'error' {
  if (status === 'booked') return 'info';
  if (status === 'cancelled') return 'error';
  if (status === 'requested') return 'warning';
  return 'neutral';
}

export function RequestDetail({ requestId }: { requestId: string }) {
  const lookups = useOtLookups();
  const [row, setRow] = useState<OtRequestDto | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    otSchedulingApi
      .request(requestId)
      .then((next) => {
        if (!cancelled) setRow(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [requestId, attempt]);

  if (loading) return <PageLoading label="Loading the OT request…" />;
  if (error || !row) return <PageError error={error ?? new Error('This OT request could not be loaded.')} onRetry={() => setAttempt((value) => value + 1)} />;

  const remarkLabels = row.specialRemarks.length > 0 ? row.specialRemarks.join(', ') : namesFor(row.specialRemarkIds, lookups.remarks.map((item) => ({ id: item.id, name: item.text })));
  const surgeonNames = joinNames(row.surgeons, row.surgeonIds, lookups.surgeons);
  const anaesthetistNames = joinNames(row.anaesthetists, row.anaesthetistIds, lookups.anaesthetists);

  return (
    <>
      <PageHeader
        title={`OT request ${row.requestNo}`}
        description="Every field saved on this request."
        actions={
          <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {row.status === 'requested' ? (
              <Button asChild>
                <Link href={`/app/ot/requests/${row.id}/edit`}>Edit OT request</Link>
              </Button>
            ) : null}
            <Button asChild variant="secondary">
              <Link href="/app/ot">Back to dashboard</Link>
            </Button>
          </span>
        }
      />
      <Panel>
        <p style={{ marginTop: 0 }}>
          <Badge tone={tone(row.status)}>{row.status.replace('_', ' ')}</Badge>
        </p>
        <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--hos-space-4)', margin: 0 }}>
          <Fact label="Request no" value={row.requestNo} />
          <Fact label="Patient no" value={row.patientNo} />
          <Fact label="Patient name" value={row.patientName} />
          <Fact label="Mobile" value={row.mobile} />
          <Fact label="Doctor" value={row.doctorName} />
          <Fact label="OP/IP" value={patientTypeLabel(row.patientType)} />
          <Fact label="IP no" value={row.ipNo} />
          <Fact label="Ward" value={row.patientType === 'ip' ? row.ward : ''} />
          <Fact label="Bed no" value={row.patientType === 'ip' ? row.bed : ''} />
          <Fact label="Sex" value={sexLabel(row.sex)} />
          <Fact label="Age" value={formatOtAge({ years: row.ageYears, months: row.ageMonths, days: row.ageDays, label: row.ageLabel, dob: row.dob })} />
          <Fact label="Expected date" value={formatOtDate(row.expectedDate)} />
          <Fact label="Expected time" value={row.expectedTime} />
          <Fact label="Office permission" value={yesNo(row.officePermission)} />
          <Fact label="Office permission remark" value={row.officePermissionRemark} />
          <Fact label="Diagnosis" value={row.diagnosis} />
          <Fact label="Indication" value={row.indication} />
          <Fact label="Type of surgery" value={row.surgeryType === 'major' ? 'Major' : row.surgeryType === 'minor' ? 'Minor' : ''} />
          <Fact label="Surgery name" value={row.surgeryName} />
          <Fact label="Frozen section" value={yesNo(row.frozenSection)} />
          <Fact label="TEE required" value={row.teeRequired === 'yes' ? 'Yes' : 'No'} />
          <Fact label="Special remarks" value={remarkLabels} />
          <Fact label="Weight" value={row.weight} />
          <Fact label="Language" value={row.language} />
          <Fact label="Surgeons" value={surgeonNames} />
          <Fact label="Anaesthetists" value={anaesthetistNames} />
        </dl>
      </Panel>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt style={{ color: 'var(--hos-fg-secondary)', fontSize: 'var(--hos-text-xs)', margin: 0 }}>{label}</dt>
      <dd style={{ margin: '2px 0 0', fontVariantNumeric: 'tabular-nums' }}>{dash(value)}</dd>
    </div>
  );
}

function namesFor(ids: string[], options: { id: string; name: string }[]): string {
  if (ids.length === 0) return '';
  return ids.map((id) => options.find((opt) => opt.id === id)?.name || id).join(', ');
}

function joinNames(embedded: { id: string; name: string }[], ids: string[], options: { id: string; name: string }[]): string {
  const named = embedded.map((person) => person.name).filter((name) => name && !ids.includes(name));
  if (named.length > 0) return named.join(', ');
  return namesFor(ids, options);
}
