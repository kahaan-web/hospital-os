'use client';

import { createTranslator, type PatientSummaryDto } from '@hos/shared';
import { Button, Field, Input, PageHeader, Select, Textarea, useToast } from '@hos/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PatientPicker } from '@/features/clinical/common/PatientPicker';
import { otApi } from '@/features/clinical/ot/api';
import { ApiError } from '@/lib/api';

const t = createTranslator('en');

const ROOMS = ['OT-1', 'OT-2', 'OT-MINOR'];

export default function NewOtCasePage() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [patient, setPatient] = useState<PatientSummaryDto | null>(null);
  const [procedureName, setProcedureName] = useState('');
  const [surgeonName, setSurgeonName] = useState('');
  const [anaesthetistName, setAnaesthetistName] = useState('');
  const [roomCode, setRoomCode] = useState(ROOMS[0] ?? 'OT-1');
  const [priority, setPriority] = useState<'elective' | 'emergency'>('elective');
  const [anaesthesiaType, setAnaesthesiaType] = useState('');
  const [start, setStart] = useState('');
  const [duration, setDuration] = useState('60');
  const [notes, setNotes] = useState('');

  const submit = async () => {
    if (!patient || !start) {
      toast.toast({ tone: 'error', title: 'Choose a patient and a start time' });
      return;
    }
    setBusy(true);
    try {
      const created = await otApi.create({
        patientId: patient.id,
        procedureName,
        surgeonName,
        anaesthetistName,
        roomCode,
        priority,
        anaesthesiaType,
        scheduledStart: new Date(start).toISOString(),
        durationMin: Number(duration),
        notes,
      });
      toast.toast({ tone: 'success', title: `Scheduled ${created.number}` });
      router.push('/app/ot');
    } catch (err) {
      toast.toast({ tone: 'error', title: err instanceof ApiError ? err.message : 'Could not schedule this case' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={t('clinical.ot.new')} description="Book a theatre room, surgeon and slot for a patient." />
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
        <Field label="Procedure" required>
          <Input value={procedureName} onChange={(event) => setProcedureName(event.target.value)} required minLength={2} maxLength={160} aria-label="Procedure" />
        </Field>
        <Field label="Surgeon" required>
          <Input value={surgeonName} onChange={(event) => setSurgeonName(event.target.value)} required minLength={2} maxLength={120} aria-label="Surgeon" />
        </Field>
        <Field label="Anaesthetist">
          <Input value={anaesthetistName} onChange={(event) => setAnaesthetistName(event.target.value)} maxLength={120} aria-label="Anaesthetist" />
        </Field>
        <Field label="Theatre room" required>
          <Select value={roomCode} onChange={(event) => setRoomCode(event.target.value)} aria-label="Theatre room">
            {ROOMS.map((room) => (
              <option key={room} value={room}>
                {room}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Start" required>
          <Input type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} required aria-label="Start" />
        </Field>
        <Field label="Duration (minutes)" required>
          <Input type="number" min={15} max={720} step={15} value={duration} onChange={(event) => setDuration(event.target.value)} required aria-label="Duration in minutes" />
        </Field>
        <Field label="Priority">
          <Select value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)} aria-label="Priority">
            <option value="elective">Elective</option>
            <option value="emergency">Emergency</option>
          </Select>
        </Field>
        <Field label="Anaesthesia type">
          <Input value={anaesthesiaType} onChange={(event) => setAnaesthesiaType(event.target.value)} maxLength={60} aria-label="Anaesthesia type" />
        </Field>
        <Field label="Notes">
          <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} aria-label="Notes" />
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? 'Scheduling…' : 'Schedule case'}
        </Button>
      </form>
    </>
  );
}
