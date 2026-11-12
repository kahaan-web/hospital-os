'use client';

import { createTranslator, type PatientSummaryDto } from '@hos/shared';
import { Button, Field, Input, PageHeader, Select, Textarea, useToast } from '@hos/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PatientPicker } from '@/features/clinical/common/PatientPicker';
import { MODALITIES, radApi, type RadModality } from '@/features/clinical/radiology/api';
import { ApiError } from '@/lib/api';

const t = createTranslator('en');

export default function NewRadiologyOrderPage() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [patient, setPatient] = useState<PatientSummaryDto | null>(null);
  const [modality, setModality] = useState<RadModality>('xray');
  const [studyName, setStudyName] = useState('');
  const [priority, setPriority] = useState<'routine' | 'urgent' | 'stat'>('routine');
  const [doctor, setDoctor] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');

  const submit = async () => {
    if (!patient) {
      toast.toast({ tone: 'error', title: 'Choose a patient' });
      return;
    }
    setBusy(true);
    try {
      const created = await radApi.create({
        patientId: patient.id,
        modality,
        studyName,
        priority,
        orderingDoctorName: doctor,
        clinicalNotes,
      });
      toast.toast({ tone: 'success', title: `Ordered ${created.number}` });
      router.push('/app/radiology');
    } catch (err) {
      toast.toast({ tone: 'error', title: err instanceof ApiError ? err.message : 'Could not save the order' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={t('clinical.radiology.new')} description="Order an imaging study for the worklist." />
      <form
        className="flex max-w-xl flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field label="Patient" required>
          <PatientPicker onValueChange={setPatient} />
        </Field>
        {patient ? <p className="text-sm">{`${patient.fullName} · ${patient.uhid}`}</p> : null}
        <Field label="Modality" required>
          <Select value={modality} onChange={(event) => setModality(event.target.value as RadModality)} aria-label="Modality">
            {MODALITIES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Study" required hint="For example: Chest PA view, Abdomen ultrasound">
          <Input value={studyName} onChange={(event) => setStudyName(event.target.value)} required minLength={2} maxLength={160} aria-label="Study" />
        </Field>
        <Field label="Priority">
          <Select value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)} aria-label="Priority">
            <option value="routine">Routine</option>
            <option value="urgent">Urgent</option>
            <option value="stat">Stat</option>
          </Select>
        </Field>
        <Field label="Ordering doctor">
          <Input value={doctor} onChange={(event) => setDoctor(event.target.value)} maxLength={120} aria-label="Ordering doctor" />
        </Field>
        <Field label="Clinical notes">
          <Textarea value={clinicalNotes} onChange={(event) => setClinicalNotes(event.target.value)} maxLength={1000} aria-label="Clinical notes" />
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Place order'}
        </Button>
      </form>
    </>
  );
}
