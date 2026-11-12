'use client';

import type { PatientDto } from '@hos/shared';
import { ageLabel, maskMobile } from '@hos/shared';
import { Button, PageHeader } from '@hos/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { PatientBanner } from '@/features/clinical/common/PatientBanner';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { registrationApi } from '@/features/clinical/registration/api';

export default function PatientDetailPage() {
  const params = useParams<{ id: string }>();
  const [patient, setPatient] = useState<PatientDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setLoading(true);
    registrationApi
      .patient(params.id)
      .then(setPatient)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <PageLoading />;
  if (error || !patient) return <PageError error={error ?? 'Not found'} onRetry={load} />;

  const summary = {
    id: patient.id,
    uhid: patient.uhid,
    fullName: patient.fullName,
    gender: patient.gender,
    ageLabel: patient.ageLabel || ageLabel(patient.dob),
    mobileMasked: maskMobile(patient.mobile),
    city: patient.city,
  };

  return (
    <>
      <PageHeader
        title={patient.fullName}
        description={`UHID ${patient.uhid}`}
        actions={
          <Link href={`/app/patients/${patient.id}/edit`}>
            <Button type="button">Edit</Button>
          </Link>
        }
      />
      <PatientBanner patient={summary} alerts={[]} />
      <section className="mt-6 space-y-4 text-sm">
        <dl className="grid max-w-lg grid-cols-2 gap-x-4 gap-y-2">
          <dt className="text-[var(--ink-muted)]">Mobile</dt>
          <dd>{patient.mobile || '—'}</dd>
          <dt className="text-[var(--ink-muted)]">City</dt>
          <dd>{patient.city || '—'}</dd>
          <dt className="text-[var(--ink-muted)]">Registered</dt>
          <dd>{new Date(patient.createdAt).toLocaleDateString('en-IN')}</dd>
        </dl>
        <div className="flex flex-wrap gap-2">
          <a className="hos-link" href={registrationApi.printUrl(patient.id, 'case-paper', 'pdf')}>
            Case paper PDF
          </a>
          <Link className="hos-link" href={`/app/patients/${patient.id}/allergies`}>
            Allergies and alerts
          </Link>
          <a className="hos-link" href={registrationApi.printUrl(patient.id, 'sticker', 'pdf')}>
            Sticker PDF
          </a>
          <a className="hos-link" href={registrationApi.printUrl(patient.id, 'case-paper', 'html')} target="_blank" rel="noreferrer">
            Preview case paper
          </a>
        </div>
      </section>
    </>
  );
}
