'use client';

import type { PatientCreateInput, PatientSummaryDto } from '@hos/shared';
import { Button, PageHeader, useToast } from '@hos/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError } from '@/lib/api';
import { PatientForm } from '@/features/clinical/registration/PatientForm';
import { registrationApi } from '@/features/clinical/registration/api';

export default function NewPatientPage() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [duplicates, setDuplicates] = useState<PatientSummaryDto[] | null>(null);
  const [pending, setPending] = useState<PatientCreateInput | null>(null);

  const submit = async (data: PatientCreateInput, confirmNew = false) => {
    setBusy(true);
    try {
      const patient = await registrationApi.create({ ...data, confirmNew });
      toast.toast({ tone: 'success', title: `Registered ${patient.uhid}` });
      router.push(`/app/patients/${patient.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'possible_duplicate' && e.details && typeof e.details === 'object' && 'duplicates' in e.details) {
        setDuplicates((e.details as { duplicates: PatientSummaryDto[] }).duplicates);
        setPending(data);
        return;
      }
      toast.toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Registration failed' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="New patient" description="Capture demographics and issue a UHID." />
      {duplicates ? (
        <div className="mb-4 rounded border border-[var(--line)] bg-[var(--surface-muted)] p-4">
          <p className="mb-2 text-sm">A patient with this mobile may already exist.</p>
          <ul className="mb-3 text-sm">
            {duplicates.map((d) => (
              <li key={d.id}>
                {d.fullName} · {d.uhid} · {d.mobileMasked}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button type="button" disabled={busy} onClick={() => pending && void submit(pending, true)}>
              Register as new patient
            </Button>
            <Button type="button" variant="secondary" onClick={() => setDuplicates(null)}>
              Go back
            </Button>
          </div>
        </div>
      ) : (
        <PatientForm submitLabel="Save patient" busy={busy} onSubmit={(data) => submit(data)} />
      )}
    </>
  );
}
