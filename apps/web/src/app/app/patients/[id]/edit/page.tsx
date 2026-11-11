'use client';

import type { PatientDto } from '@hos/shared';
import { PageHeader, useToast } from '@hos/ui';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { PatientForm } from '@/features/clinical/registration/PatientForm';
import { registrationApi } from '@/features/clinical/registration/api';

export default function EditPatientPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [patient, setPatient] = useState<PatientDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

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

  return (
    <>
      <PageHeader title="Edit patient" description={patient.uhid} />
      <PatientForm
        submitLabel="Save changes"
        busy={busy}
        initial={{
          firstName: patient.firstName,
          lastName: patient.lastName,
          gender: patient.gender,
          mobile: patient.mobile,
          city: patient.city,
          stateCode: patient.stateCode,
          dob: patient.dob,
        }}
        onSubmit={async (data) => {
          setBusy(true);
          try {
            await registrationApi.update(patient.id, data);
            toast.toast({ tone: 'success', title: 'Patient updated' });
            router.push(`/app/patients/${patient.id}`);
          } catch (e) {
            toast.toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Update failed' });
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}
