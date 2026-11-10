'use client';

import type { OnboardingState } from '@hos/shared';
import { FACILITY_TYPE_LABELS, FACILITY_TYPES, SPECIALITIES, checkGstin, facilitySchema, fieldErrors } from '@hos/shared';
import { wt } from '@/i18n';
import { Button, Card, CardBody, Checkbox, Field, Input, PageHeader, Select, useToast } from '@hos/ui';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { OnboardingGate } from '@/features/onboarding/OnboardingGate';
import { OnboardingWizardShell } from '@/features/onboarding/OnboardingWizardShell';
import { ApiError, apiPut, apiRequest } from '@/lib/api';
import { withoutField } from '@/lib/form-errors';

export default function FacilityPage() {
  const router = useRouter();
  const { toast: showToast } = useToast();

  return (
    <OnboardingWizardShell currentHref="/onboarding/facility">
      <OnboardingGate allowedHrefs={['/onboarding/facility', '/onboarding/signup']} currentHref="/onboarding/facility">
        {(state) => <FacilityForm state={state} onSaved={() => router.push('/onboarding/locations')} showToast={showToast} />}
      </OnboardingGate>
    </OnboardingWizardShell>
  );
}

function FacilityForm({
  state,
  onSaved,
  showToast,
}: {
  state: OnboardingState;
  onSaved: () => void;
  showToast: ReturnType<typeof useToast>['toast'];
}) {
  const t = state.tenant;
  const [form, setForm] = useState({
    facilityType: (t.facilityType ?? 'clinic') as (typeof FACILITY_TYPES)[number],
    legalName: t.legalName || '',
    displayName: t.displayName || '',
    gstin: t.gstin || '',
    registrationNo: t.registrationNo || '',
    specialities: t.specialities.length ? t.specialities : ([] as string[]),
  });
  const [bedCountInput, setBedCountInput] = useState(t.bedCount != null ? String(t.bedCount) : '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [gstinWarn, setGstinWarn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const normaliseGstinOnBlur = useCallback(() => {
    const n = form.gstin.replace(/\s+/g, '').toUpperCase();
    setForm((f) => ({ ...f, gstin: n }));
    if (!n) {
      setErrors((e) => withoutField(e, 'gstin'));
      setGstinWarn(null);
      return;
    }
    const check = checkGstin(n);
    if (!check.valid) {
      setGstinWarn(null);
      setErrors((e) => ({ ...e, gstin: check.error ?? 'GSTIN must be 15 characters, like 27ABCDE1234F1Z5' }));
    } else {
      setErrors((e) => withoutField(e, 'gstin'));
      setGstinWarn(check.checksumValid ? null : wt('facility.gstinChecksumWarn'));
    }
  }, [form.gstin]);

  const save = useCallback(async () => {
    const bedRaw = bedCountInput.trim();
    let bedCount: number | null = null;
    if (bedRaw !== '') {
      const n = Number(bedRaw);
      if (!Number.isInteger(n) || n < 0) {
        setErrors((e) => ({ ...e, bedCount: wt('facility.bedCountInvalid') }));
        return;
      }
      bedCount = n;
    }
    const payload = { ...form, bedCount };
    const parsed = facilitySchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setBusy(true);
    try {
      await apiPut('/onboarding/facility', parsed.data);
      showToast({ tone: 'success', title: wt('facility.saved') });
      onSaved();
    } catch (e) {
      setErrors(
        e instanceof ApiError
          ? { ...(e.fields ?? {}), form: e.message }
          : { form: wt('common.saveFailed') },
      );
    } finally {
      setBusy(false);
    }
  }, [form, bedCountInput, onSaved, showToast]);

  const gstinHint = [wt('facility.gstinHint'), gstinWarn].filter(Boolean).join(' ');

  return (
    <>
      <PageHeader title={wt('facility.title')} description={wt('facility.description')} />
      <Card style={{ maxWidth: '40rem' }}>
        <CardBody style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hos-space-4)' }}>
          <Field label={wt('facility.facilityType')} error={errors.facilityType}>
            <Select
              value={form.facilityType}
              onChange={(e) => setForm((f) => ({ ...f, facilityType: e.target.value as typeof form.facilityType }))}
            >
              {FACILITY_TYPES.map((ft) => (
                <option key={ft} value={ft}>
                  {FACILITY_TYPE_LABELS[ft]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={wt('facility.legalName')} error={errors.legalName}>
            <Input value={form.legalName} onChange={(e) => setForm((f) => ({ ...f, legalName: e.target.value }))} />
          </Field>
          <Field label={wt('facility.displayName')} error={errors.displayName}>
            <Input value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} />
          </Field>
          <Field label="GSTIN" error={errors.gstin} hint={gstinHint}>
            <Input
              value={form.gstin}
              onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value }))}
              onBlur={normaliseGstinOnBlur}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <Field label={wt('facility.registrationNo')} error={errors.registrationNo}>
            <Input value={form.registrationNo} onChange={(e) => setForm((f) => ({ ...f, registrationNo: e.target.value }))} />
          </Field>
          <Field label={wt('facility.bedCount')} error={errors.bedCount} hint={wt('facility.bedCountHint')}>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={bedCountInput}
              onChange={(e) => setBedCountInput(e.target.value)}
            />
          </Field>
          <Field label={wt('facility.specialities')} hint={wt('facility.specialitiesHint')}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hos-space-2)', maxHeight: '12rem', overflow: 'auto' }}>
              {SPECIALITIES.map((s) => (
                <Checkbox
                  key={s}
                  label={s}
                  checked={form.specialities.includes(s)}
                  onCheckedChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      specialities: v === true ? [...f.specialities, s] : f.specialities.filter((x) => x !== s),
                    }))
                  }
                />
              ))}
            </div>
          </Field>
          <Field label={wt('facility.logo')} hint={wt('facility.logoHint')}>
            <Input
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const fd = new FormData();
                fd.append('file', file);
                try {
                  await apiRequest('/onboarding/logo', { method: 'POST', formData: fd });
                } catch {
                  showToast({ tone: 'error', title: wt('facility.logoUploadFailed') });
                }
              }}
            />
          </Field>
          {errors.form ? <p role="alert" style={{ color: 'var(--hos-fg-danger)', margin: 0 }}>{errors.form}</p> : null}
          <Button type="button" onClick={save} loading={busy}>
            {wt('facility.saveContinue')}
          </Button>
        </CardBody>
      </Card>
    </>
  );
}
