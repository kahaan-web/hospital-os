'use client';

import { createTranslator, type PatientSummaryDto } from '@hos/shared';
import { Button, Field, Input, PageHeader, Select, Textarea, useToast } from '@hos/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PatientPicker } from '@/features/clinical/common/PatientPicker';
import { adtApi } from '@/features/clinical/adt/api';
import { AdtLinks } from '@/features/clinical/adt/links';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { ApiError } from '@/lib/api';

const t = createTranslator('en');

interface VacantBed {
  id: string;
  label: string;
}

export default function AdmitPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [patient, setPatient] = useState<PatientSummaryDto | null>(null);
  const [doctorId, setDoctorId] = useState('');
  const [bedId, setBedId] = useState('');
  const [admissionType, setAdmissionType] = useState<'emergency' | 'elective' | 'day_care'>('elective');
  const [attendant, setAttendant] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [doctors, setDoctors] = useState<{ id: string; name: string }[]>([]);
  const [beds, setBeds] = useState<VacantBed[]>([]);

  const load = () => {
    setLoading(true);
    Promise.all([adtApi.doctors(), adtApi.board()])
      .then(([doctorRows, board]) => {
        setDoctors(doctorRows.filter((row) => row.active).map((row) => ({ id: row.id, name: row.name })));
        const vacant: VacantBed[] = [];
        for (const ward of board.wards) {
          for (const room of ward.rooms) {
            for (const bed of room.beds) {
              if (bed.status === 'vacant') vacant.push({ id: bed.id, label: `${ward.code} · ${room.code} · ${bed.label}` });
            }
          }
        }
        setBeds(vacant);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async () => {
    if (!patient || !doctorId || !bedId) {
      toast.toast({ tone: 'error', title: 'Choose a patient, doctor and vacant bed' });
      return;
    }
    setBusy(true);
    try {
      const admission = await adtApi.admit({
        patientId: patient.id,
        doctorId,
        bedId,
        admissionType,
        payerType: 'self',
        isMlc: false,
        attendant,
        provisionalDiagnosis: diagnosis,
      });
      toast.toast({ tone: 'success', title: `Admitted ${admission.number}` });
      router.push(`/app/adt/admissions/${admission.id}`);
    } catch (e) {
      toast.toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not admit' });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PageLoading label="Loading beds" />;
  if (error) return <PageError error={error} onRetry={load} />;

  return (
    <>
      <AdtLinks current="/app/adt/admit" />
      <PageHeader title={t('clinical.adt.admit')} description="Open an inpatient stay and assign a vacant bed." />
      <form
        className="flex max-w-xl flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field label={t('clinical.adt.patient')} required>
          <PatientPicker onValueChange={setPatient} />
        </Field>
        {patient ? <p className="text-sm">{`${patient.fullName} · ${patient.uhid}`}</p> : null}
        <Field label={t('clinical.adt.doctor')} required>
          <Select value={doctorId} onChange={(event) => setDoctorId(event.target.value)} required aria-label={t('clinical.adt.doctor')}>
            <option value="">Choose a doctor</option>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('clinical.adt.bed')} required hint={beds.length === 0 ? t('clinical.adt.noVacant') : undefined}>
          <Select value={bedId} onChange={(event) => setBedId(event.target.value)} required aria-label={t('clinical.adt.bed')}>
            <option value="">Choose a vacant bed</option>
            {beds.map((bed) => (
              <option key={bed.id} value={bed.id}>
                {bed.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('clinical.adt.admissionType')} required>
          <Select
            value={admissionType}
            onChange={(event) => setAdmissionType(event.target.value as typeof admissionType)}
            aria-label={t('clinical.adt.admissionType')}
          >
            <option value="elective">{t('clinical.adt.typeElective')}</option>
            <option value="emergency">{t('clinical.adt.typeEmergency')}</option>
            <option value="day_care">{t('clinical.adt.typeDayCare')}</option>
          </Select>
        </Field>
        <Field label={t('clinical.adt.attendant')}>
          <Input value={attendant} onChange={(event) => setAttendant(event.target.value)} maxLength={120} aria-label={t('clinical.adt.attendant')} />
        </Field>
        <Field label={t('clinical.adt.diagnosis')}>
          <Textarea value={diagnosis} onChange={(event) => setDiagnosis(event.target.value)} maxLength={500} aria-label={t('clinical.adt.diagnosis')} />
        </Field>
        <Button type="submit" disabled={busy || beds.length === 0}>
          {t('clinical.adt.admit')}
        </Button>
      </form>
    </>
  );
}
