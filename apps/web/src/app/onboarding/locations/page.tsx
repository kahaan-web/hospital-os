'use client';

import type { LocationInput, OnboardingState } from '@hos/shared';
import { DEFAULT_DEPARTMENTS, INDIAN_STATES, fieldErrors, locationsSchema } from '@hos/shared';
import { Button, Card, CardBody, Field, Input, PageHeader, Select, useToast } from '@hos/ui';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { OnboardingGate } from '@/features/onboarding/OnboardingGate';
import { OnboardingWizardShell } from '@/features/onboarding/OnboardingWizardShell';
import { ApiError, apiPut } from '@/lib/api';

const DEMO_LOCATIONS: LocationInput[] = [
  {
    name: 'Mumbai centre',
    addressLine1: '14 Lal Bahadur Shastri Marg',
    addressLine2: 'Bhandup West',
    city: 'Mumbai',
    stateCode: '27',
    pincode: '400078',
    phone: '9876500001',
    departments: [...DEFAULT_DEPARTMENTS],
  },
  {
    name: 'Indore centre',
    addressLine1: '88 AB Road',
    addressLine2: 'Near Palasia',
    city: 'Indore',
    stateCode: '23',
    pincode: '452001',
    phone: '9876500002',
    departments: [...DEFAULT_DEPARTMENTS],
  },
  {
    name: 'Jaipur centre',
    addressLine1: '22 MI Road',
    addressLine2: '',
    city: 'Jaipur',
    stateCode: '08',
    pincode: '302001',
    phone: '9876500003',
    departments: [...DEFAULT_DEPARTMENTS],
  },
];

const emptyLocation = (): LocationInput => ({
  name: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  stateCode: '27',
  pincode: '',
  phone: '',
  departments: ['OPD', 'Reception'],
});

export default function LocationsPage() {
  const router = useRouter();
  const { toast: showToast } = useToast();
  return (
    <OnboardingWizardShell currentHref="/onboarding/locations">
      <OnboardingGate allowedHrefs={['/onboarding/locations']} currentHref="/onboarding/locations">
        {(state) => (
          <LocationsForm
            initial={state.locations.length ? mapLocations(state) : [emptyLocation()]}
            onSaved={() => router.push('/onboarding/plan')}
            showToast={showToast}
          />
        )}
      </OnboardingGate>
    </OnboardingWizardShell>
  );
}

function mapLocations(state: OnboardingState): LocationInput[] {
  return state.locations.map((l) => ({
    id: l.id,
    name: l.name,
    addressLine1: l.addressLine1,
    addressLine2: l.addressLine2,
    city: l.city,
    stateCode: l.stateCode,
    pincode: l.pincode,
    phone: l.phone,
    departments: l.departments,
  }));
}

function LocationsForm({
  initial,
  onSaved,
  showToast,
}: {
  initial: LocationInput[];
  onSaved: () => void;
  showToast: ReturnType<typeof useToast>['toast'];
}) {
  const [locations, setLocations] = useState<LocationInput[]>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const save = useCallback(async () => {
    const parsed = locationsSchema.safeParse({ locations });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setBusy(true);
    try {
      await apiPut('/onboarding/locations', parsed.data);
      showToast({ tone: 'success', title: 'Locations saved' });
      onSaved();
    } catch (e) {
      setErrors(e instanceof ApiError ? { ...(e.fields ?? {}), form: e.message } : { form: 'Save failed' });
    } finally {
      setBusy(false);
    }
  }, [locations, onSaved, showToast]);

  const updateLocation = (idx: number, patch: Partial<LocationInput>) => {
    setLocations((list) => list.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  return (
    <>
      <PageHeader
        title="Locations"
        description="Add every branch that will share this subscription. State drives GST on invoices."
        actions={
          <Button type="button" variant="secondary" onClick={() => setLocations(DEMO_LOCATIONS)}>
            Prefill Mumbai, Indore, Jaipur
          </Button>
        }
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hos-space-4)', maxWidth: '48rem' }}>
        {locations.map((loc, idx) => (
          <Card key={idx}>
            <CardBody style={{ display: 'grid', gap: 'var(--hos-space-3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--hos-space-2)' }}>
                <span style={{ fontWeight: 600, fontSize: 'var(--hos-text-sm)' }}>Location {idx + 1}</span>
                {locations.length > 1 ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setLocations((list) => list.filter((_, i) => i !== idx))}>
                    Remove
                  </Button>
                ) : null}
              </div>
              <Field label="Location name" error={errors[`locations.${idx}.name`]}>
                <Input value={loc.name} onChange={(e) => updateLocation(idx, { name: e.target.value })} invalid={!!errors[`locations.${idx}.name`]} />
              </Field>
              <Field label="Address line 1" error={errors[`locations.${idx}.addressLine1`]}>
                <Input
                  value={loc.addressLine1}
                  onChange={(e) => updateLocation(idx, { addressLine1: e.target.value })}
                  invalid={!!errors[`locations.${idx}.addressLine1`]}
                />
              </Field>
              <Field label="Address line 2" error={errors[`locations.${idx}.addressLine2`]}>
                <Input value={loc.addressLine2 ?? ''} onChange={(e) => updateLocation(idx, { addressLine2: e.target.value })} />
              </Field>
              <Field label="City" error={errors[`locations.${idx}.city`]}>
                <Input
                  value={loc.city}
                  onChange={(e) => updateLocation(idx, { city: e.target.value })}
                  invalid={!!errors[`locations.${idx}.city`]}
                />
              </Field>
              <Field label="State" error={errors[`locations.${idx}.stateCode`]}>
                <Select
                  value={loc.stateCode}
                  onChange={(e) => updateLocation(idx, { stateCode: e.target.value })}
                  aria-invalid={!!errors[`locations.${idx}.stateCode`]}
                >
                  {INDIAN_STATES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="PIN code" error={errors[`locations.${idx}.pincode`]}>
                <Input
                  value={loc.pincode}
                  onChange={(e) => updateLocation(idx, { pincode: e.target.value })}
                  invalid={!!errors[`locations.${idx}.pincode`]}
                />
              </Field>
              <Field label="Phone" error={errors[`locations.${idx}.phone`]}>
                <Input value={loc.phone ?? ''} onChange={(e) => updateLocation(idx, { phone: e.target.value })} />
              </Field>
              <Field
                label="Departments"
                hint="Comma-separated list"
                error={errors[`locations.${idx}.departments`]}
              >
                <Input
                  value={loc.departments.join(', ')}
                  onChange={(e) =>
                    updateLocation(idx, {
                      departments: e.target.value
                        .split(',')
                        .map((d) => d.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </Field>
            </CardBody>
          </Card>
        ))}
        <Button type="button" variant="secondary" onClick={() => setLocations((l) => [...l, emptyLocation()])}>
          Add another location
        </Button>
        {errors.form ? (
          <p role="alert" style={{ color: 'var(--hos-fg-danger)' }}>
            {errors.form}
          </p>
        ) : null}
        <Button type="button" onClick={save} loading={busy}>
          Continue to plan
        </Button>
      </div>
    </>
  );
}
