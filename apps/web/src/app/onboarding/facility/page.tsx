'use client';

import type { OnboardingState } from '@hos/shared';
import { FACILITY_TYPE_LABELS, FACILITY_TYPES, SPECIALITIES, facilitySchema, fieldErrors } from '@hos/shared';
import { Button, Card, CardBody, Checkbox, Field, Input, PageHeader, Select, useToast } from '@hos/ui';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { OnboardingGate } from '@/features/onboarding/OnboardingGate';
import { OnboardingWizardShell } from '@/features/onboarding/OnboardingWizardShell';
import { ApiError, apiPut, apiRequest } from '@/lib/api';

export default function FacilityPage() {
  const router = useRouter();
  const toast = useToast();

  return (
    <OnboardingWizardShell currentHref="/onboarding/facility">
      <OnboardingGate allowedHrefs={['/onboarding/facility', '/onboarding/signup']}>
        {(state) => <FacilityForm state={state} onSaved={() => router.push('/onboarding/locations')} toast={toast} />}
      </OnboardingGate>
    </OnboardingWizardShell>
  );
}

function FacilityForm({
  state,
  onSaved,
  toast,
}: {
  state: OnboardingState;
  onSaved: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const t = state.tenant;
  const [form, setForm] = useState({
    facilityType: (t.facilityType ?? 'clinic') as (typeof FACILITY_TYPES)[number],
    legalName: t.legalName || '',
    displayName: t.displayName || '',
    gstin: t.gstin || '',
    registrationNo: t.registrationNo || '',
    bedCount: t.bedCount ?? 10,
    specialities: t.specialities.length ? t.specialities : ([] as string[]),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const save = useCallback(async () => {
    const parsed = facilitySchema.safeParse(form);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setBusy(true);
    try {
      await apiPut('/onboarding/facility', parsed.data);
      toast.toast({ tone: 'success', title: 'Facility saved' });
      onSaved();
    } catch (e) {
      setErrors(e instanceof ApiError ? { ...(e.fields ?? {}), form: e.message } : { form: 'Save failed' });
    } finally {
      setBusy(false);
    }
  }, [form, onSaved, toast]);

  return (
    <>
      <PageHeader title="Facility profile" description="Legal identity, GSTIN and bed capacity for your tier." />
      <Card style={{ maxWidth: '40rem' }}>
        <CardBody style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hos-space-4)' }}>
          <Field label="Facility type" error={errors.facilityType}>
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
          <Field label="Legal name" error={errors.legalName}>
            <Input value={form.legalName} onChange={(e) => setForm((f) => ({ ...f, legalName: e.target.value }))} />
          </Field>
          <Field label="Display name" error={errors.displayName}>
            <Input value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} />
          </Field>
          <Field label="GSTIN" error={errors.gstin} hint="Optional — leave blank if not registered">
            <Input value={form.gstin} onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value.toUpperCase() }))} />
          </Field>
          <Field label="Registration / licence no." error={errors.registrationNo}>
            <Input value={form.registrationNo} onChange={(e) => setForm((f) => ({ ...f, registrationNo: e.target.value }))} />
          </Field>
          <Field label="Bed count" error={errors.bedCount}>
            <Input
              type="number"
              value={form.bedCount}
              onChange={(e) => setForm((f) => ({ ...f, bedCount: Number(e.target.value) }))}
            />
          </Field>
          <Field label="Specialities" hint="Pick all that apply">
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
          <Field label="Logo" hint="PNG/JPG/SVG up to 1 MB (optional)">
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
                  toast.toast({ tone: 'error', title: 'Logo upload failed' });
                }
              }}
            />
          </Field>
          {errors.form ? <p role="alert" style={{ color: 'var(--hos-fg-danger)', margin: 0 }}>{errors.form}</p> : null}
          <Button type="button" onClick={save} loading={busy}>
            Continue to locations
          </Button>
        </CardBody>
      </Card>
    </>
  );
}
