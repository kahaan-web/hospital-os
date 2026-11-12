'use client';

import { Button, DataTable, EmptyState, PageHeader } from '@hos/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { nursingApi } from '@/features/clinical/nursing/api';
import type { HandoverPatient, HandoverSheet } from '@/features/clinical/nursing/api';
import { PageError, PageLoading } from '@/features/common/LoadState';

function vitalsText(v: HandoverPatient['latestVitals']): string {
  if (!v) return 'None recorded';
  const bp = v.bpSystolic && v.bpDiastolic ? `BP ${v.bpSystolic}/${v.bpDiastolic}` : null;
  const parts = [bp, v.pulse != null ? `P ${v.pulse}` : null, v.spo2 != null ? `SpO₂ ${v.spo2}%` : null, v.tempC != null ? `T ${v.tempC}°C` : null].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'None recorded';
}

export default function NursingHandoverPage() {
  const [sheet, setSheet] = useState<HandoverSheet | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    nursingApi
      .handover()
      .then((data) => {
        setSheet(data);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !sheet) return <PageLoading label="Preparing handover sheet" />;
  if (error && !sheet) return <PageError error={error} onRetry={load} />;

  const rows = sheet?.patients ?? [];
  const pending = rows.reduce((sum, row) => sum + row.dosesDue, 0);

  return (
    <>
      <PageHeader
        title="Shift handover"
        description={`Live summary for ${sheet?.date ?? ''}: latest vitals, today's medicine doses and diet for every in-patient. Print it for the incoming shift.`}
        actions={
          <Button type="button" variant="secondary" onClick={() => window.print()}>
            Print
          </Button>
        }
      />
      <p aria-live="polite">
        {rows.length} in-patient{rows.length === 1 ? '' : 's'} · {pending} dose{pending === 1 ? '' : 's'} still due today
      </p>
      {rows.length === 0 ? (
        <EmptyState title="No in-patients on this ward" />
      ) : (
        <DataTable
          data={rows}
          getRowId={(row) => row.encounterId}
          pageSize={50}
          emptyMessage="No in-patients"
          columns={[
            { id: 'bed', header: 'Bed', accessor: (row) => [row.wardCode, row.bedLabel].filter(Boolean).join(' · ') || '—' },
            { id: 'name', header: 'Patient', accessor: (row) => `${row.fullName} (${row.ageLabel}, ${row.gender})` },
            { id: 'uhid', header: 'UHID', accessor: (row) => row.uhid },
            { id: 'doctor', header: 'Doctor', accessor: (row) => row.doctorName ?? '—' },
            { id: 'vitals', header: 'Latest vitals', accessor: (row) => vitalsText(row.latestVitals) },
            { id: 'due', header: 'Doses due', accessor: (row) => row.dosesDue },
            { id: 'given', header: 'Given', accessor: (row) => row.dosesGiven },
            { id: 'other', header: 'Held / refused / missed', accessor: (row) => row.dosesOther },
            { id: 'diet', header: 'Diet', accessor: (row) => row.diet ?? '—' },
            {
              id: 'chart',
              header: '',
              accessor: () => '',
              render: (row) => (
                <Link href={`/app/nursing/encounters/${row.encounterId}`} className="hos-link">
                  Open chart
                </Link>
              ),
            },
          ]}
        />
      )}
    </>
  );
}
