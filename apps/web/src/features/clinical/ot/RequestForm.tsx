'use client';

import type { PatientSummaryDto } from '@hos/shared';
import { Button, Checkbox, Combobox, DatePicker, Field, Input, PageHeader, RadioGroup, Select, Textarea, useToast } from '@hos/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { PatientPicker } from '@/features/clinical/common/PatientPicker';
import { PageError, PageLoading } from '@/features/common/LoadState';
import {
  otSchedulingApi,
  type OtFutureItem,
  type OtRequestDto,
  type OtRequestWrite,
  type OtSurgeryDto,
} from './api';
import { FieldGrid, InlineNote, Panel } from './bits';
import { dash, formatOtAge, formatOtDate, otActionError, sexLabel, todayIso } from './format';
import { MultiCheckList } from './MultiCheckList';
import { loadPatientOtFacts } from './patientFacts';
import { useOtLookups } from './useOtLookups';

function blankRequest(): OtRequestWrite {
  return {
    patientId: '',
    doctorId: '',
    patientType: 'op',
    expectedDate: todayIso(),
    expectedTime: '',
    officePermission: false,
    officePermissionRemark: '',
    diagnosis: '',
    surgeryType: '',
    surgeryId: null,
    frozenSection: false,
    teeRequired: 'no',
    specialRemarkIds: [],
    weight: '',
    language: '',
    sex: '',
    indication: '',
    surgeonIds: [],
    anaesthetistIds: [],
    ward: null,
    bed: null,
  };
}

function fromRequest(row: OtRequestDto): OtRequestWrite {
  return {
    patientId: row.patientId,
    doctorId: row.doctorId,
    patientType: row.patientType === 'ip' ? 'ip' : 'op',
    expectedDate: row.expectedDate || todayIso(),
    expectedTime: row.expectedTime,
    officePermission: row.officePermission,
    officePermissionRemark: row.officePermissionRemark,
    diagnosis: row.diagnosis,
    surgeryType: row.surgeryType,
    surgeryId: row.surgeryId,
    frozenSection: row.frozenSection,
    teeRequired: row.teeRequired,
    specialRemarkIds: row.specialRemarkIds,
    weight: row.weight,
    language: row.language,
    sex: sexLabel(row.sex),
    indication: row.indication,
    surgeonIds: row.surgeonIds,
    anaesthetistIds: row.anaesthetistIds,
    ward: row.ward || null,
    bed: row.bed || null,
  };
}

export function RequestForm({ mode, requestId }: { mode: 'new' | 'edit'; requestId?: string }) {
  const router = useRouter();
  const toast = useToast();
  const lookups = useOtLookups();
  const [form, setForm] = useState<OtRequestWrite>(blankRequest);
  const [snapshot, setSnapshot] = useState<OtRequestWrite>(blankRequest);
  const [patientLabel, setPatientLabel] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [ageText, setAgeText] = useState('');
  const [status, setStatus] = useState('');
  const [requestNo, setRequestNo] = useState('');
  const [future, setFuture] = useState<OtFutureItem[]>([]);
  const [futureError, setFutureError] = useState('');
  const [contextError, setContextError] = useState('');
  const [surgeries, setSurgeries] = useState<OtSurgeryDto[]>([]);
  const [surgeryError, setSurgeryError] = useState('');
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loading, setLoading] = useState(mode === 'edit');
  const [attempt, setAttempt] = useState(0);
  const [fieldError, setFieldError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode !== 'edit' || !requestId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    otSchedulingApi
      .request(requestId)
      .then(async (row) => {
        if (cancelled) return;
        const next = fromRequest(row);
        setForm(next);
        setSnapshot(next);
        setStatus(row.status);
        setRequestNo(row.requestNo);
        setDoctorName(row.doctorName);
        setPatientLabel([row.patientName, row.patientNo].filter(Boolean).join(' · '));
        setAgeText(formatOtAge({ years: row.ageYears, months: row.ageMonths, days: row.ageDays, label: row.ageLabel, dob: row.dob }));
        if (row.patientId) {
          const facts = await loadPatientOtFacts(row.patientId);
          if (cancelled) return;
          setFuture(facts.future);
          setFutureError(facts.futureError);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, requestId, attempt]);

  useEffect(() => {
    if (!form.surgeryType) {
      setSurgeries([]);
      setSurgeryError('');
      return;
    }
    let cancelled = false;
    otSchedulingApi
      .surgeries(form.surgeryType)
      .then((rows) => {
        if (!cancelled) {
          setSurgeries(rows);
          setSurgeryError('');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSurgeries([]);
          setSurgeryError('Surgery list could not be loaded.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [form.surgeryType]);

  const doctorOptions = useMemo(() => {
    const merged = new Map<string, string>();
    for (const doctor of [...lookups.surgeons, ...lookups.anaesthetists]) {
      merged.set(doctor.id, doctor.code ? `${doctor.code} · ${doctor.name}` : doctor.name);
    }
    if (form.doctorId && !merged.has(form.doctorId)) merged.set(form.doctorId, doctorName || form.doctorId);
    return [...merged.entries()].map(([value, label]) => ({ value, label }));
  }, [lookups.surgeons, lookups.anaesthetists, form.doctorId, doctorName]);

  const locked = mode === 'edit' && status !== '' && status !== 'requested';

  const onPatient = async (patient: PatientSummaryDto) => {
    setPatientLabel(`${patient.fullName} · ${patient.uhid}`);
    setForm((prev) => ({ ...prev, patientId: patient.id, sex: sexLabel(patient.gender) || prev.sex }));
    setAgeText(formatOtAge({ label: patient.ageLabel }));
    const facts = await loadPatientOtFacts(patient.id);
    setFuture(facts.future);
    setFutureError(facts.futureError);
    setContextError(facts.contextError);
    setForm((prev) => {
      if (prev.patientId !== patient.id) return prev;
      const type = facts.context?.patientType === 'ip' || facts.context?.ward ? 'ip' : facts.context?.patientType === 'op' ? 'op' : prev.patientType;
      return {
        ...prev,
        patientType: type,
        sex: sexLabel(facts.context?.sex || facts.patient?.gender || patient.gender) || prev.sex,
        ward: facts.context?.ward || null,
        bed: facts.context?.bed || null,
      };
    });
    setAgeText(
      formatOtAge({
        years: facts.context?.ageYears,
        months: facts.context?.ageMonths,
        days: facts.context?.ageDays,
        label: facts.context?.ageLabel || facts.patient?.ageLabel || patient.ageLabel,
        dob: facts.patient?.dob,
      }),
    );
  };

  const save = async () => {
    if (locked) return;
    if (!form.patientId) {
      setFieldError('Choose a patient.');
      return;
    }
    if (!form.doctorId) {
      setFieldError('Choose a doctor.');
      return;
    }
    if (!form.expectedDate) {
      setFieldError('Choose an expected date.');
      return;
    }
    setBusy(true);
    setFieldError('');
    try {
      const saved = mode === 'edit' && requestId ? await otSchedulingApi.updateRequest(requestId, form) : await otSchedulingApi.createRequest(form);
      toast.toast({ tone: 'success', title: mode === 'edit' ? `Updated request ${saved.requestNo}` : `Saved request ${saved.requestNo}` });
      router.push(`/app/ot/requests/${saved.id}`);
    } catch (err) {
      setFieldError(otActionError(err));
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    setForm(mode === 'edit' ? snapshot : blankRequest());
    setFieldError('');
    if (mode === 'new') {
      setPatientLabel('');
      setDoctorName('');
      setAgeText('');
      setFuture([]);
      setFutureError('');
      setContextError('');
    }
  };

  if (loading) return <PageLoading label="Loading the OT request…" />;
  if (loadError) return <PageError error={loadError} onRetry={() => setAttempt((value) => value + 1)} />;

  return (
    <>
      <PageHeader
        title={mode === 'edit' ? `Edit OT request${requestNo ? ` ${requestNo}` : ''}` : 'New OT request'}
        description="Patient, doctor, surgery and the details captured with the request."
      />
      {locked ? <InlineNote>Only a request that is still requested can be edited.</InlineNote> : null}
      <InlineNote tone="muted">{lookups.warning}</InlineNote>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hos-space-4)' }}
      >
        <Panel title={mode === 'edit' ? 'Edit OT request' : 'New OT request'}>
          <FieldGrid>
            <Field label="Patient no" required>
              <PatientPicker onValueChange={(patient) => void onPatient(patient)} disabled={locked} />
              {patientLabel ? <p style={{ margin: '4px 0 0', fontSize: 'var(--hos-text-sm)' }}>{patientLabel}</p> : null}
            </Field>
            <Field label="Doctor no" required>
              <Combobox
                aria-label="Doctor no"
                options={doctorOptions}
                value={form.doctorId || undefined}
                placeholder="Search doctor"
                disabled={locked}
                onValueChange={(value) => {
                  setForm((prev) => ({ ...prev, doctorId: value }));
                  const match = doctorOptions.find((opt) => opt.value === value);
                  if (match) setDoctorName(match.label);
                }}
              />
            </Field>
            <Field label="In patient or out patient">
              <RadioGroup
                aria-label="In patient or out patient"
                value={form.patientType}
                onValueChange={(value) => setForm((prev) => ({ ...prev, patientType: value === 'ip' ? 'ip' : 'op' }))}
                options={[
                  { value: 'ip', label: 'In patient', disabled: locked },
                  { value: 'op', label: 'Out patient', disabled: locked },
                ]}
              />
            </Field>
            {form.patientType === 'ip' ? (
              <>
                <Field label="Ward name">
                  <Input value={form.ward ?? ''} readOnly aria-label="Ward name" />
                </Field>
                <Field label="Bed no">
                  <Input value={form.bed ?? ''} readOnly aria-label="Bed no" />
                </Field>
              </>
            ) : null}
            <Field label="Expected date" required>
              <DatePicker
                aria-label="Expected date"
                value={form.expectedDate}
                disabled={locked}
                onChange={(next) => setForm((prev) => ({ ...prev, expectedDate: next ?? '' }))}
              />
            </Field>
            <Field label="Expected time">
              <Input
                type="time"
                value={form.expectedTime}
                disabled={locked}
                aria-label="Expected time"
                onChange={(event) => setForm((prev) => ({ ...prev, expectedTime: event.target.value }))}
              />
            </Field>
            <Field label="Age">
              <Input value={ageText === '—' ? '' : ageText} readOnly aria-label="Age" placeholder="Shown after a patient is chosen" />
            </Field>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'end' }}>
              <Checkbox
                checked={form.officePermission}
                disabled={locked}
                label="Office permission?"
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, officePermission: checked === true }))}
              />
              <Field label="Remark">
                <Input
                  value={form.officePermissionRemark}
                  disabled={locked}
                  aria-label="Office permission remark"
                  placeholder="Enter remark"
                  maxLength={240}
                  onChange={(event) => setForm((prev) => ({ ...prev, officePermissionRemark: event.target.value }))}
                />
              </Field>
            </div>
          </FieldGrid>
          {form.patientType === 'ip' ? <InlineNote tone="muted">{contextError}</InlineNote> : null}
        </Panel>

        <Panel title="Clinical details">
          <FieldGrid>
            <Field label="Diagnosis">
              <Textarea
                value={form.diagnosis}
                disabled={locked}
                aria-label="Diagnosis"
                maxLength={1000}
                onChange={(event) => setForm((prev) => ({ ...prev, diagnosis: event.target.value }))}
              />
            </Field>
            <Field label="Indication">
              <Textarea
                value={form.indication}
                disabled={locked}
                aria-label="Indication"
                maxLength={1000}
                onChange={(event) => setForm((prev) => ({ ...prev, indication: event.target.value }))}
              />
            </Field>
            <Field label="Type of surgery">
              <Select
                aria-label="Type of surgery"
                value={form.surgeryType}
                disabled={locked}
                onChange={(event) => {
                  const surgeryType = event.target.value === 'major' || event.target.value === 'minor' ? event.target.value : '';
                  setForm((prev) => ({ ...prev, surgeryType, surgeryId: null }));
                }}
              >
                <option value="">Select type</option>
                <option value="major">Major</option>
                <option value="minor">Minor</option>
              </Select>
            </Field>
            <Field label="Surgery name">
              <Select
                aria-label="Surgery name"
                value={form.surgeryId ?? ''}
                disabled={locked || !form.surgeryType}
                onChange={(event) => setForm((prev) => ({ ...prev, surgeryId: event.target.value || null }))}
              >
                <option value="">{form.surgeryType ? 'Select surgery' : 'Choose major or minor first'}</option>
                {surgeries.map((surgery) => (
                  <option key={surgery.id} value={surgery.id}>
                    {surgery.name}
                  </option>
                ))}
              </Select>
              <InlineNote>{surgeryError}</InlineNote>
            </Field>
            <Field label="Weight">
              <Input value={form.weight} disabled={locked} aria-label="Weight" maxLength={40} onChange={(event) => setForm((prev) => ({ ...prev, weight: event.target.value }))} />
            </Field>
            <Field label="Language">
              <Input
                value={form.language}
                disabled={locked}
                aria-label="Language"
                maxLength={40}
                onChange={(event) => setForm((prev) => ({ ...prev, language: event.target.value }))}
              />
            </Field>
            <Field label="Sex">
              <Input value={form.sex} disabled={locked} aria-label="Sex" maxLength={40} onChange={(event) => setForm((prev) => ({ ...prev, sex: event.target.value }))} />
            </Field>
            <div>
              <Checkbox
                checked={form.frozenSection}
                disabled={locked}
                label="Frozen section"
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, frozenSection: checked === true }))}
              />
              <Field label="TEE required">
                <RadioGroup
                  aria-label="TEE required"
                  value={form.teeRequired}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, teeRequired: value === 'yes' ? 'yes' : 'no' }))}
                  options={[
                    { value: 'no', label: 'No', disabled: locked },
                    { value: 'yes', label: 'Yes', disabled: locked },
                  ]}
                />
              </Field>
            </div>
          </FieldGrid>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--hos-space-3)', marginTop: 'var(--hos-space-3)' }}>
            <MultiCheckList
              label="Special remarks"
              options={lookups.remarks.map((remark) => ({ id: remark.id, label: remark.text }))}
              value={form.specialRemarkIds}
              empty={lookups.loading ? 'Loading remarks…' : 'No special remarks in the master.'}
              onChange={(specialRemarkIds) => {
                if (!locked) setForm((prev) => ({ ...prev, specialRemarkIds }));
              }}
            />
            <MultiCheckList
              label="Surgeons"
              options={lookups.surgeons.map((doctor) => ({ id: doctor.id, label: doctor.name }))}
              value={form.surgeonIds}
              empty={lookups.loading ? 'Loading surgeons…' : 'No surgeons in the master.'}
              onChange={(surgeonIds) => {
                if (!locked) setForm((prev) => ({ ...prev, surgeonIds }));
              }}
            />
            <MultiCheckList
              label="Anaesthetists"
              options={lookups.anaesthetists.map((doctor) => ({ id: doctor.id, label: doctor.name }))}
              value={form.anaesthetistIds}
              empty={lookups.loading ? 'Loading anaesthetists…' : 'No anaesthetists in the master.'}
              onChange={(anaesthetistIds) => {
                if (!locked) setForm((prev) => ({ ...prev, anaesthetistIds }));
              }}
            />
          </div>
        </Panel>

        <Panel title="Future OT list">
          <InlineNote tone="muted">{futureError}</InlineNote>
          <div className="hos-table-wrap">
            <table className="hos-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">IP no</th>
                  <th scope="col">Patient name</th>
                  <th scope="col">Doctor name</th>
                  <th scope="col">Status</th>
                  <th scope="col">Req/App no</th>
                </tr>
              </thead>
              <tbody>
                {future.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ color: 'var(--hos-fg-muted)' }}>
                      {form.patientId ? 'No future OT requests or bookings for this patient.' : 'Choose a patient to see future OT requests and bookings.'}
                    </td>
                  </tr>
                ) : (
                  future.map((item, index) => (
                    <tr key={`${item.refNo}-${item.date}-${index}`}>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{formatOtDate(item.date)}</td>
                      <td>{dash(item.ipNo)}</td>
                      <td>{dash(item.patientName)}</td>
                      <td>{dash(item.doctorName)}</td>
                      <td>{dash(item.status)}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{dash(item.refNo)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <InlineNote>{fieldError}</InlineNote>
        <div style={{ display: 'flex', gap: 'var(--hos-space-2)', flexWrap: 'wrap' }}>
          <Button type="submit" disabled={busy || locked}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
          <Button type="button" variant="secondary" onClick={clear} disabled={busy}>
            Clear
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.push('/app/ot')}>
            Exit
          </Button>
        </div>
      </form>
    </>
  );
}
