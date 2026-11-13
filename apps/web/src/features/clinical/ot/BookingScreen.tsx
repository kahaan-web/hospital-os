'use client';

import type { PatientSummaryDto } from '@hos/shared';
import { Button, Checkbox, Combobox, DatePicker, Dialog, Field, IconButton, Input, PageHeader, RadioGroup, Select, Textarea, useToast } from '@hos/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PatientPicker } from '@/features/clinical/common/PatientPicker';
import {
  otSchedulingApi,
  type OtBookingDto,
  type OtBookingType,
  type OtBookingWrite,
  type OtCaseKind,
  type OtSettingsDto,
  type OtSurgeryDto,
} from './api';
import { FieldGrid, InlineNote, Panel } from './bits';
import { dash, formatClock, formatOtDate, minutesOf, otActionError, plusDays, sexLabel, todayIso } from './format';
import { MultiCheckList } from './MultiCheckList';
import { NameTokens } from './NameTokens';
import { OtSubNav } from './OtSubNav';
import { loadPatientOtFacts } from './patientFacts';
import { useOtLookups } from './useOtLookups';

interface Draft {
  resourceId: string;
  date: string;
  startTime: string;
  hours: string;
  mins: string;
  bookingType: OtBookingType;
  caseType: OtCaseKind;
  remarks: string;
  cancelRemarks: string;
  doctorId: string;
  patientId: string;
  patientNo: string;
  patientName: string;
  patientType: 'ip' | 'op';
  ageLabel: string;
  weight: string;
  language: string;
  sex: string;
  department: string;
  ward: string;
  bed: string;
  surgeryType: '' | 'major' | 'minor';
  surgeryId: string | null;
  frozenSection: boolean;
  teeRequired: 'yes' | 'no';
  indication: string;
  diagnosis: string;
  surgeonIds: string[];
  anaesthetistIds: string[];
  serviceNames: string[];
  employeeNames: string[];
}

function blankDraft(): Draft {
  return {
    resourceId: '',
    date: todayIso(),
    startTime: '',
    hours: '1',
    mins: '0',
    bookingType: 'planned',
    caseType: 'elective',
    remarks: '',
    cancelRemarks: '',
    doctorId: '',
    patientId: '',
    patientNo: '',
    patientName: '',
    patientType: 'op',
    ageLabel: '',
    weight: '',
    language: '',
    sex: '',
    department: '',
    ward: '',
    bed: '',
    surgeryType: '',
    surgeryId: null,
    frozenSection: false,
    teeRequired: 'no',
    indication: '',
    diagnosis: '',
    surgeonIds: [],
    anaesthetistIds: [],
    serviceNames: [],
    employeeNames: [],
  };
}

function durationOf(draft: Draft): number {
  return (Number(draft.hours) || 0) * 60 + (Number(draft.mins) || 0);
}

function toWrite(draft: Draft): OtBookingWrite {
  return {
    resourceId: draft.resourceId,
    date: draft.date,
    startTime: draft.startTime,
    durationMin: durationOf(draft),
    bookingType: draft.bookingType,
    caseType: draft.caseType,
    remarks: draft.remarks.trim(),
    doctorId: draft.doctorId,
    patientId: draft.patientId,
    patientType: draft.patientType,
    weight: draft.weight,
    language: draft.language,
    sex: draft.sex,
    department: draft.department,
    ward: draft.ward,
    bed: draft.bed,
    surgeryType: draft.surgeryType,
    surgeryId: draft.surgeryId,
    frozenSection: draft.frozenSection,
    teeRequired: draft.teeRequired,
    indication: draft.indication.trim(),
    diagnosis: draft.diagnosis,
    surgeonIds: draft.surgeonIds,
    anaesthetistIds: draft.anaesthetistIds,
    serviceNames: draft.serviceNames,
    employeeNames: draft.employeeNames,
  };
}

function draftFromBooking(row: OtBookingDto, prev: Draft): Draft {
  return {
    ...prev,
    resourceId: row.resourceId || prev.resourceId,
    date: row.date || prev.date,
    startTime: row.startTime,
    hours: String(Math.floor((row.durationMin || 0) / 60)),
    mins: String((row.durationMin || 0) % 60),
    bookingType: row.bookingType,
    caseType: row.caseType,
    remarks: row.remarks,
    cancelRemarks: row.cancelRemarks,
    doctorId: row.doctorId,
    patientId: row.patientId,
    patientNo: row.patientNo,
    patientName: row.patientName,
    patientType: row.patientType === 'ip' ? 'ip' : 'op',
    ageLabel: row.ageLabel,
    weight: row.weight,
    language: row.language,
    sex: sexLabel(row.sex),
    department: row.department,
    ward: row.ward,
    bed: row.bed,
    surgeryType: row.surgeryType,
    surgeryId: row.surgeryId,
    frozenSection: row.frozenSection,
    teeRequired: row.teeRequired,
    indication: row.indication,
    diagnosis: row.diagnosis,
    surgeonIds: row.surgeonIds,
    anaesthetistIds: row.anaesthetistIds,
    serviceNames: row.serviceNames,
    employeeNames: row.employeeNames,
  };
}

function validate(draft: Draft): string {
  if (!draft.resourceId) return 'Choose a theatre.';
  if (!draft.date) return 'Choose a date.';
  if (!draft.startTime) return 'Enter a start time.';
  if (durationOf(draft) <= 0) return 'Enter hours and minutes for the booking.';
  if (!draft.doctorId) return 'Choose a doctor.';
  if (!draft.patientId) return 'Choose a patient.';
  if (!draft.remarks.trim()) return 'Enter remarks.';
  if (!draft.indication.trim()) return 'Enter the indication.';
  return '';
}

function cancelled(status: string): boolean {
  return status.toLowerCase().includes('cancel');
}

export function BookingScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const lookups = useOtLookups();
  const requestIdParam = params.get('requestId') ?? '';
  const bookingIdParam = params.get('bookingId') ?? '';
  const [draft, setDraft] = useState<Draft>(() => ({
    ...blankDraft(),
    date: params.get('date') || todayIso(),
    resourceId: params.get('resourceId') ?? '',
  }));
  const [selected, setSelected] = useState<OtBookingDto | null>(null);
  const [bookings, setBookings] = useState<OtBookingDto[]>([]);
  const [dayError, setDayError] = useState('');
  const [dayLoading, setDayLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [doctorName, setDoctorName] = useState('');
  const [linkedRequestId, setLinkedRequestId] = useState(requestIdParam);
  const [requestHeader, setRequestHeader] = useState<{ requestNo: string; forDate: string } | null>(null);
  const [surgeries, setSurgeries] = useState<OtSurgeryDto[]>([]);
  const [surgeryError, setSurgeryError] = useState('');
  const [settings, setSettings] = useState<OtSettingsDto | null>(null);
  const [picker, setPicker] = useState<'doctors' | 'services' | 'employees' | null>(null);
  const [shiftConfirm, setShiftConfirm] = useState(false);
  const [shiftNow, setShiftNow] = useState(false);
  const baseRef = useRef<Draft>(draft);
  const appliedBooking = useRef(false);

  const resource = lookups.resources.find((item) => item.id === draft.resourceId) ?? null;
  const duration = durationOf(draft);
  const slotMin = resource && resource.slotDurationMin > 0 ? resource.slotDurationMin : 15;
  const slots = duration > 0 ? Math.max(1, Math.ceil(duration / slotMin)) : 0;
  const startMin = minutesOf(draft.startTime);
  const endLabel = startMin != null && duration > 0 ? formatClock(startMin + duration) : '';

  const patch = (partial: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...partial }));

  useEffect(() => {
    otSchedulingApi.settings().then(setSettings).catch(() => setSettings(null));
  }, []);

  useEffect(() => {
    if (draft.resourceId || lookups.resources.length === 0) return;
    const first = lookups.resources[0];
    if (!first) return;
    setDraft((prev) => (prev.resourceId ? prev : { ...prev, resourceId: first.id }));
  }, [lookups.resources, draft.resourceId]);

  useEffect(() => {
    if (!draft.surgeryType) {
      setSurgeries([]);
      return;
    }
    let cancelledLoad = false;
    otSchedulingApi
      .surgeries(draft.surgeryType)
      .then((rows) => {
        if (!cancelledLoad) {
          setSurgeries(rows);
          setSurgeryError('');
        }
      })
      .catch(() => {
        if (!cancelledLoad) {
          setSurgeries([]);
          setSurgeryError('Surgery list could not be loaded.');
        }
      });
    return () => {
      cancelledLoad = true;
    };
  }, [draft.surgeryType]);

  const loadDay = useCallback(async () => {
    if (!draft.resourceId || !draft.date) {
      setBookings([]);
      return;
    }
    setDayLoading(true);
    setDayError('');
    try {
      setBookings(await otSchedulingApi.dayBookings(draft.date, draft.resourceId));
    } catch (err) {
      setBookings([]);
      setDayError(otActionError(err));
    } finally {
      setDayLoading(false);
    }
  }, [draft.resourceId, draft.date]);

  useEffect(() => {
    void loadDay();
  }, [loadDay]);

  useEffect(() => {
    if (!requestIdParam) return;
    let cancelledLoad = false;
    setLinkedRequestId(requestIdParam);
    otSchedulingApi
      .request(requestIdParam)
      .then((row) => {
        if (cancelledLoad) return;
        setRequestHeader({ requestNo: row.requestNo || requestIdParam, forDate: row.expectedDate });
        setDoctorName(row.doctorName);
        setDraft((prev) => {
          const next: Draft = {
            ...prev,
            doctorId: row.doctorId || prev.doctorId,
            patientId: row.patientId,
            patientNo: row.patientNo,
            patientName: row.patientName,
            patientType: row.patientType === 'ip' ? 'ip' : 'op',
            bookingType: 'planned',
            date: row.expectedDate || prev.date,
            weight: row.weight,
            language: row.language,
            sex: sexLabel(row.sex),
            ward: row.ward,
            bed: row.bed,
            surgeryType: row.surgeryType,
            surgeryId: row.surgeryId,
            frozenSection: row.frozenSection,
            teeRequired: row.teeRequired,
            indication: row.indication,
            diagnosis: row.diagnosis,
            surgeonIds: row.surgeonIds,
            anaesthetistIds: row.anaesthetistIds,
            ageLabel: row.ageLabel,
          };
          baseRef.current = next;
          return next;
        });
      })
      .catch((err: unknown) => {
        if (!cancelledLoad) setFormError(otActionError(err));
      });
    return () => {
      cancelledLoad = true;
    };
  }, [requestIdParam]);

  const selectBooking = useCallback((row: OtBookingDto) => {
    setSelected(row);
    setDoctorName(row.doctorName);
    setFormError('');
    setDraft((prev) => {
      const next = draftFromBooking(row, prev);
      baseRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    if (appliedBooking.current || !bookingIdParam) return;
    const found = bookings.find((row) => row.id === bookingIdParam);
    if (!found) return;
    appliedBooking.current = true;
    selectBooking(found);
  }, [bookings, bookingIdParam, selectBooking]);

  const doctorOptions = useMemo(() => {
    const merged = new Map<string, string>();
    for (const doctor of [...lookups.surgeons, ...lookups.anaesthetists]) {
      merged.set(doctor.id, doctor.code ? `${doctor.code} · ${doctor.name}` : doctor.name);
    }
    if (draft.doctorId && !merged.has(draft.doctorId)) merged.set(draft.doctorId, doctorName || draft.doctorId);
    return [...merged.entries()].map(([value, label]) => ({ value, label }));
  }, [lookups.surgeons, lookups.anaesthetists, draft.doctorId, doctorName]);

  const applyPatient = async (patientId: string, seed?: { uhid?: string; fullName?: string; gender?: string; ageLabel?: string }) => {
    if (seed) {
      patch({
        patientId,
        patientNo: seed.uhid ?? '',
        patientName: seed.fullName ?? '',
        sex: sexLabel(seed.gender) || draft.sex,
        ageLabel: seed.ageLabel ?? draft.ageLabel,
      });
    }
    const facts = await loadPatientOtFacts(patientId);
    setDraft((prev) => {
      if (prev.patientId !== patientId) return prev;
      const type = facts.context?.patientType === 'ip' || facts.context?.ward ? 'ip' : facts.context?.patientType === 'op' ? 'op' : prev.patientType;
      return {
        ...prev,
        patientType: type,
        patientNo: facts.patient?.uhid || prev.patientNo,
        patientName: facts.patient?.fullName || prev.patientName,
        sex: sexLabel(facts.context?.sex || facts.patient?.gender || seed?.gender) || prev.sex,
        ward: facts.context?.ward || prev.ward,
        bed: facts.context?.bed || prev.bed,
        department: facts.context?.department || prev.department,
        ageLabel: facts.context?.ageLabel || facts.patient?.ageLabel || seed?.ageLabel || prev.ageLabel,
      };
    });
    if (facts.contextError && (facts.context?.patientType === 'ip' || facts.context?.ward)) setFormError(facts.contextError);
  };

  const onPatient = (patient: PatientSummaryDto) => void applyPatient(patient.id, { uhid: patient.uhid, fullName: patient.fullName, gender: patient.gender, ageLabel: patient.ageLabel });

  const newBooking = () => {
    setSelected(null);
    setLinkedRequestId('');
    setRequestHeader(null);
    setFormError('');
    setDraft((prev) => {
      const next = { ...blankDraft(), resourceId: prev.resourceId, date: prev.date };
      baseRef.current = next;
      return next;
    });
  };

  const save = async () => {
    const problem = validate(draft);
    if (problem) {
      setFormError(problem);
      return;
    }
    if (selected && cancelled(selected.status)) {
      setFormError('A cancelled booking cannot be modified.');
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      const body = toWrite(draft);
      const saved = selected ? await otSchedulingApi.modifyBooking(selected.id, body) : linkedRequestId ? await otSchedulingApi.bookRequest(linkedRequestId, body) : await otSchedulingApi.createBooking(body);
      toast.toast({ tone: 'success', title: selected ? `Updated appointment ${saved.apptNo || saved.id}` : `Booked appointment ${saved.apptNo || saved.id}` });
      selectBooking(saved);
      if (!selected) setLinkedRequestId('');
      await loadDay();
    } catch (err) {
      setFormError(otActionError(err));
    } finally {
      setBusy(false);
    }
  };

  const cancelBooking = async () => {
    if (!selected) {
      setFormError('Select a booking on the timeline or the list.');
      return;
    }
    if (!draft.cancelRemarks.trim()) {
      setFormError('Enter cancel remarks before cancelling this booking.');
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      await otSchedulingApi.cancelBooking(selected.id, draft.cancelRemarks.trim());
      toast.toast({ tone: 'success', title: 'Booking cancelled' });
      setSelected(null);
      await loadDay();
    } catch (err) {
      setFormError(otActionError(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmShift = async () => {
    if (!selected) return;
    if (!draft.resourceId || !draft.date || !draft.startTime) {
      setFormError('Set the new theatre, date and start time before shifting.');
      setShiftConfirm(false);
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      await otSchedulingApi.shift(selected.id, { resourceId: draft.resourceId, date: draft.date, startTime: draft.startTime });
      toast.toast({ tone: 'success', title: 'Appointment shifted' });
      setShiftConfirm(false);
      await loadDay();
    } catch (err) {
      setShiftConfirm(false);
      setFormError(otActionError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <style>{`
        .ot-book-grid { display: grid; grid-template-columns: 220px minmax(0, 1fr) 180px; gap: var(--hos-space-3); align-items: start; }
        @media (max-width: 960px) { .ot-book-grid { grid-template-columns: 1fr; } }
      `}</style>
      <OtSubNav />
      <PageHeader title="OT booking" description="Book a theatre directly, or from an OT request. Overlaps and the booking cutoff are refused by the server." />
      {requestHeader ? (
        <p style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          REQUEST NO :- {requestHeader.requestNo} / FOR DATE :- {formatOtDate(requestHeader.forDate)}
        </p>
      ) : null}
      <InlineNote tone="muted">{lookups.warning}</InlineNote>
      {settings ? (
        <InlineNote tone="info">
          After {settings.cutoffTime}, a booking needs {settings.minLeadDays} day lead.
          {settings.emergencyBypass ? ' Emergency case type can still be booked.' : ' Emergency case type follows the same cutoff.'}
        </InlineNote>
      ) : null}

      <div className="ot-book-grid">
        <Panel title="Theatre">
          <Field label="OT">
            <Combobox
              aria-label="OT"
              options={lookups.resources.map((item) => ({ value: item.id, label: item.name || item.code }))}
              value={draft.resourceId || undefined}
              placeholder="Search theatre"
              onValueChange={(value) => patch({ resourceId: value })}
            />
          </Field>
          <Field label="Date">
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <IconButton label="Previous day" size="sm" onClick={() => patch({ date: plusDays(draft.date, -1) })}>
                <ChevronLeft size={16} strokeWidth={1.5} />
              </IconButton>
              <DatePicker aria-label="Booking date" value={draft.date} onChange={(next) => next && patch({ date: next })} />
              <IconButton label="Next day" size="sm" onClick={() => patch({ date: plusDays(draft.date, 1) })}>
                <ChevronRight size={16} strokeWidth={1.5} />
              </IconButton>
            </div>
          </Field>
          <Field label="OT start time">
            <Input readOnly aria-label="OT start time" value={resource?.sessionStart || ''} placeholder="From the theatre master" />
          </Field>
          <Field label="OT end time">
            <Input readOnly aria-label="OT end time" value={resource?.sessionEnd || ''} placeholder="From the theatre master" />
          </Field>
        </Panel>

        <Panel title="Booking">
          <FieldGrid>
            <Field label="Doctor" required>
              <Combobox
                aria-label="Doctor"
                options={doctorOptions}
                value={draft.doctorId || undefined}
                placeholder="Search doctor"
                onValueChange={(value) => {
                  patch({ doctorId: value });
                  const match = doctorOptions.find((opt) => opt.value === value);
                  if (match) setDoctorName(match.label);
                }}
              />
            </Field>
            <Field label="Pat type">
              <RadioGroup
                aria-label="Patient type"
                value={draft.patientType}
                onValueChange={(value) => patch({ patientType: value === 'ip' ? 'ip' : 'op' })}
                options={[
                  { value: 'ip', label: 'In patient' },
                  { value: 'op', label: 'Out patient' },
                ]}
              />
            </Field>
            <div style={{ display: 'flex', alignItems: 'end' }}>
              <Button asChild variant="secondary" size="sm">
                <Link href="/app/patients/new">New patient</Link>
              </Button>
            </div>
            <Field label="Patient" required>
              <PatientPicker onValueChange={(patient) => void onPatient(patient)} />
              {draft.patientName ? (
                <p style={{ margin: '4px 0 0', fontSize: 'var(--hos-text-sm)' }}>
                  {draft.patientNo} {draft.patientName}
                </p>
              ) : null}
            </Field>
            <Field label="Start time" required>
              <Input type="time" aria-label="Start time" value={draft.startTime} onChange={(event) => patch({ startTime: event.target.value })} />
            </Field>
            <Field label="Hours">
              <Input type="number" min={0} max={23} aria-label="Hours" value={draft.hours} onChange={(event) => patch({ hours: event.target.value })} />
            </Field>
            <Field label="Mins">
              <Input type="number" min={0} max={59} aria-label="Mins" value={draft.mins} onChange={(event) => patch({ mins: event.target.value })} />
            </Field>
            <Field label="Appt no">
              <Input readOnly aria-label="Appointment number" value={selected?.apptNo ?? ''} placeholder="Assigned on save" />
            </Field>
            <Field label="No of slots">
              <Input readOnly aria-label="Number of slots" value={slots ? String(slots) : ''} />
            </Field>
            <Field label="Booking type">
              <Select
                aria-label="Booking type"
                value={draft.bookingType}
                onChange={(event) => patch({ bookingType: event.target.value as OtBookingType })}
              >
                <option value="select">Select</option>
                <option value="planned">Planned</option>
                <option value="emergency">Emergency</option>
              </Select>
            </Field>
            <Field label="Case type">
              <RadioGroup
                aria-label="Case type"
                value={draft.caseType}
                onValueChange={(value) => patch({ caseType: value === 'emergency' ? 'emergency' : 'elective' })}
                options={[
                  { value: 'elective', label: 'Elective' },
                  { value: 'emergency', label: 'Emergency' },
                ]}
              />
            </Field>
            <Field label="Remarks" required>
              <Textarea aria-label="Remarks" value={draft.remarks} maxLength={1000} onChange={(event) => patch({ remarks: event.target.value })} />
            </Field>
            <Field label="Cancel remarks" hint="Required only when cancelling a booking.">
              <Textarea aria-label="Cancel remarks" value={draft.cancelRemarks} maxLength={1000} onChange={(event) => patch({ cancelRemarks: event.target.value })} />
            </Field>
          </FieldGrid>
          {endLabel ? <p style={{ fontSize: 'var(--hos-text-sm)', color: 'var(--hos-fg-secondary)' }}>Ends {endLabel}</p> : null}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            <Button type="button" variant="secondary" onClick={() => setPicker('services')}>
              Operation services
            </Button>
            <Button type="button" variant="secondary" onClick={() => setPicker('doctors')}>
              Operation doctors
            </Button>
            <Button type="button" variant="secondary" onClick={() => setPicker('employees')}>
              Select employees
            </Button>
            <Button type="button" disabled={busy} onClick={() => void save()}>
              Save
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setFormError('');
                setDraft(baseRef.current);
              }}
            >
              Cancel
            </Button>
          </div>
        </Panel>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Button type="button" variant="secondary" onClick={newBooking}>
            New booking
          </Button>
          <Button type="button" variant="secondary" disabled={!selected || busy || (selected ? cancelled(selected.status) : false)} onClick={() => void save()}>
            Modify booking
          </Button>
          <Button type="button" variant="danger" disabled={!selected || busy} onClick={() => void cancelBooking()}>
            Cancel booking
          </Button>
          <Button type="button" variant="secondary" disabled={!selected || busy || (selected ? cancelled(selected.status) : false)} onClick={() => setShiftConfirm(true)}>
            Shift manual
          </Button>
          <Button type="button" variant="secondary" disabled={!selected || busy || (selected ? cancelled(selected.status) : false)} onClick={() => setShiftNow(true)}>
            Shift now
          </Button>
        </div>
      </div>

      <section style={{ marginTop: 'var(--hos-space-4)' }}>
        <h2 style={{ fontSize: 'var(--hos-text-xl)', fontWeight: 600, margin: '0 0 8px' }}>Timeline</h2>
        {dayLoading ? <p style={{ color: 'var(--hos-fg-muted)' }}>Loading bookings…</p> : null}
        <InlineNote>{dayError}</InlineNote>
        <DayTimeline bookings={bookings} selectedId={selected?.id ?? ''} onSelect={selectBooking} />
      </section>

      <section style={{ marginTop: 'var(--hos-space-4)' }}>
        <Panel title="OT list entry">
          <FieldGrid>
            <Field label="Patient type">
              <RadioGroup
                aria-label="Patient type"
                value={draft.patientType}
                onValueChange={(value) => patch({ patientType: value === 'ip' ? 'ip' : 'op' })}
                options={[
                  { value: 'ip', label: 'In patient' },
                  { value: 'op', label: 'Out patient' },
                ]}
              />
            </Field>
            <Field label="Number">
              <Input readOnly aria-label="Patient number" value={draft.patientNo} />
            </Field>
            <Field label="Name">
              <Input readOnly aria-label="Patient name" value={draft.patientName} />
            </Field>
            <div style={{ display: 'flex', alignItems: 'end' }}>
              <Button type="button" variant="secondary" disabled={!draft.patientId} onClick={() => draft.patientId && void applyPatient(draft.patientId)}>
                Load patient
              </Button>
            </div>
            <Field label="Age">
              <Input readOnly aria-label="Age" value={draft.ageLabel} />
            </Field>
            <Field label="Weight">
              <Input aria-label="Weight" value={draft.weight} maxLength={40} onChange={(event) => patch({ weight: event.target.value })} />
            </Field>
            <Field label="Language">
              <Input aria-label="Language" value={draft.language} maxLength={40} onChange={(event) => patch({ language: event.target.value })} />
            </Field>
            <Field label="Sex">
              <Input aria-label="Sex" value={draft.sex} maxLength={40} onChange={(event) => patch({ sex: event.target.value })} />
            </Field>
            <Field label="Department">
              <Input aria-label="Department" value={draft.department} maxLength={80} onChange={(event) => patch({ department: event.target.value })} />
            </Field>
            <Field label="Ward">
              <Input aria-label="Ward" value={draft.ward} maxLength={80} onChange={(event) => patch({ ward: event.target.value })} readOnly={draft.patientType !== 'ip'} />
            </Field>
            <Field label="Bed no">
              <Input aria-label="Bed no" value={draft.bed} readOnly={draft.patientType !== 'ip'} onChange={(event) => patch({ bed: event.target.value })} />
            </Field>
            <Field label="OT name">
              <Input readOnly aria-label="OT name" value={resource?.name || ''} />
            </Field>
            <Field label="Surgery date">
              <Input readOnly aria-label="Surgery date" value={formatOtDate(draft.date)} />
            </Field>
            <Field label="Surgery time">
              <Input readOnly aria-label="Surgery time" value={draft.startTime} />
            </Field>
            <Field label="Case type">
              <RadioGroup
                aria-label="Case type"
                value={draft.caseType}
                onValueChange={(value) => patch({ caseType: value === 'emergency' ? 'emergency' : 'elective' })}
                options={[
                  { value: 'elective', label: 'Elective' },
                  { value: 'emergency', label: 'Emergency' },
                ]}
              />
            </Field>
            <Field label="Type of surgery">
              <Select
                aria-label="Type of surgery"
                value={draft.surgeryType}
                onChange={(event) => {
                  const surgeryType = event.target.value === 'major' || event.target.value === 'minor' ? event.target.value : '';
                  patch({ surgeryType, surgeryId: null });
                }}
              >
                <option value="">Select type</option>
                <option value="major">Major</option>
                <option value="minor">Minor</option>
              </Select>
            </Field>
            <Field label="Surgery">
              <Select aria-label="Surgery" value={draft.surgeryId ?? ''} disabled={!draft.surgeryType} onChange={(event) => patch({ surgeryId: event.target.value || null })}>
                <option value="">{draft.surgeryType ? 'Select surgery' : 'Choose major or minor first'}</option>
                {surgeries.map((surgery) => (
                  <option key={surgery.id} value={surgery.id}>
                    {surgery.name}
                  </option>
                ))}
              </Select>
              <InlineNote>{surgeryError}</InlineNote>
            </Field>
            <div>
              <Checkbox checked={draft.frozenSection} label="Frozen section" onCheckedChange={(checked) => patch({ frozenSection: checked === true })} />
            </div>
            <Field label="Indication" required>
              <Textarea aria-label="Indication" value={draft.indication} maxLength={1000} onChange={(event) => patch({ indication: event.target.value })} />
            </Field>
            <Field label="Diagnosis">
              <Textarea aria-label="Diagnosis" value={draft.diagnosis} maxLength={1000} onChange={(event) => patch({ diagnosis: event.target.value })} />
            </Field>
            <Field label="TEE required">
              <RadioGroup
                aria-label="TEE required"
                value={draft.teeRequired}
                onValueChange={(value) => patch({ teeRequired: value === 'yes' ? 'yes' : 'no' })}
                options={[
                  { value: 'no', label: 'No' },
                  { value: 'yes', label: 'Yes' },
                ]}
              />
            </Field>
          </FieldGrid>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 12 }}>
            <MultiCheckList
              label="Surgeon"
              empty="No surgeons in the master."
              options={lookups.surgeons.map((doctor) => ({ id: doctor.id, label: doctor.name }))}
              value={draft.surgeonIds}
              onChange={(surgeonIds) => patch({ surgeonIds })}
            />
            <MultiCheckList
              label="Anaesthetist"
              empty="No anaesthetists in the master."
              options={lookups.anaesthetists.map((doctor) => ({ id: doctor.id, label: doctor.name }))}
              value={draft.anaesthetistIds}
              onChange={(anaesthetistIds) => patch({ anaesthetistIds })}
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <Button type="button" variant="secondary" disabled={!selected} onClick={() => selected && router.push(`/app/ot/bookings/${selected.id}/post-op`)}>
              Surgery details entry
            </Button>
          </div>
        </Panel>
      </section>

      <section style={{ marginTop: 'var(--hos-space-4)' }}>
        <h2 style={{ fontSize: 'var(--hos-text-xl)', fontWeight: 600, margin: '0 0 8px' }}>Bookings of the day</h2>
        <div className="hos-table-wrap">
          <table className="hos-table">
            <thead>
              <tr>
                {['Req no', 'Doctor', 'Doctor name', 'Start time', 'End time', 'Patient no', 'Patient name', 'IP/OP', 'Appt no', 'AnesTyp', 'AnesTypCd', 'Nurse name'].map((header) => (
                  <th key={header} scope="col">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bookings.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{ color: 'var(--hos-fg-muted)' }}>
                    No bookings for this theatre and date.
                  </td>
                </tr>
              ) : (
                bookings.map((row) => (
                  <tr key={row.id} style={{ background: selected?.id === row.id ? 'var(--hos-brand-50)' : undefined, cursor: 'pointer' }} onClick={() => selectBooking(row)}>
                    <td>{dash(row.requestNo)}</td>
                    <td>{dash(row.doctorCode)}</td>
                    <td>{dash(row.doctorName)}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{dash(row.startTime)}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{dash(row.endTime)}</td>
                    <td>{dash(row.patientNo)}</td>
                    <td>{dash(row.patientName)}</td>
                    <td>{row.patientType === 'ip' ? 'IP' : row.patientType === 'op' ? 'OP' : '—'}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{dash(row.apptNo)}</td>
                    <td>{dash(row.anesType)}</td>
                    <td>{dash(row.anesTypeCode)}</td>
                    <td>{dash(row.nurseName)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <InlineNote>{formError}</InlineNote>

      <Dialog open={picker === 'doctors'} onOpenChange={(open) => !open && setPicker(null)} title="Operation doctors" footer={<Button onClick={() => setPicker(null)}>Close</Button>}>
        <div style={{ display: 'grid', gap: 12 }}>
          <MultiCheckList
            label="Surgeons"
            empty="No surgeons in the master."
            options={lookups.surgeons.map((doctor) => ({ id: doctor.id, label: doctor.name }))}
            value={draft.surgeonIds}
            onChange={(surgeonIds) => patch({ surgeonIds })}
          />
          <MultiCheckList
            label="Anaesthetists"
            empty="No anaesthetists in the master."
            options={lookups.anaesthetists.map((doctor) => ({ id: doctor.id, label: doctor.name }))}
            value={draft.anaesthetistIds}
            onChange={(anaesthetistIds) => patch({ anaesthetistIds })}
          />
        </div>
      </Dialog>
      <Dialog open={picker === 'services'} onOpenChange={(open) => !open && setPicker(null)} title="Operation services" footer={<Button onClick={() => setPicker(null)}>Close</Button>}>
        <NameTokens label="Service" placeholder="Service name" values={draft.serviceNames} onChange={(serviceNames) => patch({ serviceNames })} />
      </Dialog>
      <Dialog open={picker === 'employees'} onOpenChange={(open) => !open && setPicker(null)} title="Select employees" footer={<Button onClick={() => setPicker(null)}>Close</Button>}>
        <NameTokens label="Employee" placeholder="Staff name" values={draft.employeeNames} onChange={(employeeNames) => patch({ employeeNames })} />
      </Dialog>

      <Dialog
        open={shiftConfirm}
        onOpenChange={setShiftConfirm}
        title="Are you sure want to shift appointment"
        description="The booking moves to the theatre, date and start time currently on this screen."
        footer={
          <>
            <Button variant="secondary" onClick={() => setShiftConfirm(false)}>
              Cancel
            </Button>
            <Button loading={busy} onClick={() => void confirmShift()}>
              OK
            </Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          {resource?.name || 'Theatre'} · {formatOtDate(draft.date)} · {draft.startTime || 'no start time'}
        </p>
      </Dialog>

      <ShiftNowDialog
        open={shiftNow}
        booking={selected}
        resources={lookups.resources.map((item) => ({ id: item.id, label: item.name || item.code }))}
        busy={busy}
        onClose={() => setShiftNow(false)}
        onShift={async (body) => {
          if (!selected) return;
          setBusy(true);
          setFormError('');
          try {
            await otSchedulingApi.shift(selected.id, { resourceId: body.resourceId, date: body.date, startTime: body.startTime });
            if (body.durationMin > 0 && body.durationMin !== selected.durationMin) {
              await otSchedulingApi.modifyBooking(selected.id, { ...toWrite({ ...draft, resourceId: body.resourceId, date: body.date, startTime: body.startTime, hours: String(Math.floor(body.durationMin / 60)), mins: String(body.durationMin % 60) }), durationMin: body.durationMin });
            }
            toast.toast({ tone: 'success', title: 'Appointment shifted' });
            setShiftNow(false);
            await loadDay();
          } catch (err) {
            setFormError(otActionError(err));
          } finally {
            setBusy(false);
          }
        }}
        onShiftNow={async (resourceId) => {
          if (!selected) return;
          setBusy(true);
          setFormError('');
          try {
            await otSchedulingApi.shiftNow(selected.id, { resourceId });
            toast.toast({ tone: 'success', title: 'Moved to the next free slot' });
            setShiftNow(false);
            await loadDay();
          } catch (err) {
            setFormError(otActionError(err));
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}

function DayTimeline({ bookings, selectedId, onSelect }: { bookings: OtBookingDto[]; selectedId: string; onSelect: (row: OtBookingDto) => void }) {
  const hours = Array.from({ length: 24 }, (_, index) => index);
  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--hos-border-default)', borderRadius: 'var(--hos-radius-lg)', background: 'var(--hos-bg-elevated)' }}>
      <div style={{ minWidth: 960 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24, minmax(40px, 1fr))', fontSize: 'var(--hos-text-xs)', color: 'var(--hos-fg-muted)', fontVariantNumeric: 'tabular-nums' }}>
          {hours.map((hour) => (
            <div key={hour} style={{ borderLeft: '1px solid var(--hos-border-default)', padding: '2px 4px' }}>
              {String(hour).padStart(2, '0')}
            </div>
          ))}
        </div>
        <div style={{ position: 'relative', height: 84 }}>
          {bookings.length === 0 ? <p style={{ margin: 0, padding: 12, color: 'var(--hos-fg-muted)' }}>Nothing booked on this theatre for the selected date.</p> : null}
          {bookings.map((row) => {
            const start = minutesOf(row.startTime) ?? 0;
            const endFromField = minutesOf(row.endTime);
            const end = endFromField != null && endFromField > start ? endFromField : start + (row.durationMin || 30);
            const left = (start / 1440) * 100;
            const width = Math.max(((Math.min(end, 1440) - start) / 1440) * 100, 3);
            const on = row.id === selectedId;
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => onSelect(row)}
                style={{
                  position: 'absolute',
                  left: `${left}%`,
                  width: `${width}%`,
                  top: 8,
                  height: 64,
                  overflow: 'hidden',
                  textAlign: 'left',
                  padding: 4,
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: on ? 'var(--hos-brand-100)' : 'var(--hos-brand-50)',
                  border: `1px solid ${on ? 'var(--hos-brand-600)' : 'var(--hos-brand-300)'}`,
                  fontSize: 'var(--hos-text-xs)',
                }}
              >
                <span style={{ display: 'block', fontWeight: 600 }}>{row.doctorName || 'Booking'}</span>
                <span>
                  {[row.patientNo, row.patientName].filter(Boolean).join(' ')}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ShiftNowDialog({
  open,
  booking,
  resources,
  busy,
  onClose,
  onShift,
  onShiftNow,
}: {
  open: boolean;
  booking: OtBookingDto | null;
  resources: { id: string; label: string }[];
  busy: boolean;
  onClose: () => void;
  onShift: (body: { resourceId: string; date: string; startTime: string; durationMin: number }) => Promise<void>;
  onShiftNow: (resourceId: string) => Promise<void>;
}) {
  const [resourceId, setResourceId] = useState('');
  const [date, setDate] = useState(todayIso());
  const [start, setStart] = useState('');
  const [hours, setHours] = useState('0');
  const [mins, setMins] = useState('0');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !booking) return;
    setResourceId(booking.resourceId);
    setDate(booking.date || todayIso());
    setStart(booking.startTime);
    setHours(String(Math.floor((booking.durationMin || 0) / 60)));
    setMins(String((booking.durationMin || 0) % 60));
    setError('');
  }, [open, booking]);

  const durationMin = (Number(hours) || 0) * 60 + (Number(mins) || 0);
  const startMinutes = minutesOf(start);
  const end = startMinutes != null && durationMin > 0 ? formatClock(startMinutes + durationMin) : '';

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Shift OT"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            disabled={busy || !resourceId}
            onClick={() => {
              if (!resourceId) {
                setError('Choose a theatre.');
                return;
              }
              void onShiftNow(resourceId);
            }}
          >
            Next free slot
          </Button>
          <Button
            loading={busy}
            onClick={() => {
              if (!resourceId || !date || !start) {
                setError('Choose a theatre, date and start time.');
                return;
              }
              void onShift({ resourceId, date, startTime: start, durationMin });
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <FieldGrid>
        <Field label="Resource">
          <Select aria-label="Resource" value={resourceId} onChange={(event) => setResourceId(event.target.value)}>
            <option value="">Select theatre</option>
            {resources.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date">
          <DatePicker aria-label="Shift date" value={date} onChange={(next) => next && setDate(next)} />
        </Field>
        <Field label="Start time">
          <Input type="time" aria-label="Start time" value={start} onChange={(event) => setStart(event.target.value)} />
        </Field>
        <Field label="End time">
          <Input readOnly aria-label="End time" value={end} />
        </Field>
        <Field label="Hours">
          <Input type="number" min={0} max={23} aria-label="Hours" value={hours} onChange={(event) => setHours(event.target.value)} />
        </Field>
        <Field label="Mins">
          <Input type="number" min={0} max={59} aria-label="Mins" value={mins} onChange={(event) => setMins(event.target.value)} />
        </Field>
      </FieldGrid>
      <InlineNote>{error}</InlineNote>
    </Dialog>
  );
}
