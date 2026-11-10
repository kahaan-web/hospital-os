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
    stateCode: 'MH',
    pincode: '400078',
    phone: '9876500001',
    departments: [...DEFAULT_DEPARTMENTS],
  },
  {
    name: 'Indore centre',
    addressLine1: '88 AB Road',
    addressLine2: 'Near Palasia',
    city: 'Indore',
    stateCode: 'MP',
    pincode: '452001',
    phone: '9876500002',
    departments: [...DEFAULT_DEPARTMENTS],
  },
  {
    name: 'Jaipur centre',
    addressLine1: '22 MI Road',
    addressLine2: '',
    city: 'Jaipur',
    stateCode: 'RJ',
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
  stateCode: 'MH',
  pincode: '',
  phone: '',
  departments: ['OPD', 'Reception'],
});

export default function LocationsPage() {
  const router = useRouter();
  const toast = useToast();
  return (
    <OnboardingWizardShell currentHref="/onboarding/locations">
      <OnboardingGate allowedHrefs={['/onboarding/locations']}>
        {(state) => (
          <LocationsForm
            initial={state.locations.length ? mapLocations(state) : [emptyLocation()]}
            onSaved={() => router.push('/onboarding/plan')}
            toast={toast}
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
  toast,
}: {
  initial: LocationInput[];
  onSaved: () => void;
  toast: ReturnType<typeof useToast>;
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
      toast.toast({ tone: 'success', title: 'Locations saved' });
      onSaved();
    } catch (e) {
      setErrors(e instanceof ApiError ? { ...(e.fields ?? {}), form: e.message } : { form: 'Save failed' });
    } finally {
      setBusy(false);
    }
  }, [locations, onSaved, toast]);

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
              <Field label="Location name" error={errors[`locations.${idx}.name`]}>
                <Input
                  value={loc.name}
                  onChange={(e) =>
                    setLocations((list) => list.map((l, i) => (i === idx ? { ...l, name: e.target.value } : l)))
                  }
                />
              </Field>
              <Field label="Address line 1">
                <Input
                  value={loc.addressLine1}
                  onChange={(e) =>
                    setLocations((list) => list.map((l, i) => (i === idx ? { ...l, addressLine1: e.target.value } : l)))
                  }
                />
              </Field>
              <Field label="City">
                <Input
                  value={loc.city}
                  onChange={(e) =>
                    setLocations((list) => list.map((l, i) => (i === idx ? { ...l, city: e.target.value } : l)))
                  }
                />
              </Field>
              <Field label="State">
                <Select
                  value={loc.stateCode}
                  onChange={(e) =>
                    setLocations((list) => list.map((l, i) => (i === idx ? { ...l, stateCode: e.target.value } : l)))
                  }
                >
                  {INDIAN_STATES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="PIN code">
                <Input
                  value={loc.pincode}
                  onChange={(e) =>
                    setLocations((list) => list.map((l, i) => (i === idx ? { ...l, pincode: e.target.value } : l)))
                  }
                />
              </Field>
            </CardBody>
          </Card>
        ))}
        <Button type="button" variant="secondary" onClick={() => setLocations((l) => [...l, emptyLocation()])}>
          Add another location
        </Button>
        {errors.form ? <p role="alert" style={{ color: 'var(--hos-fg-danger)' }}>{errors.form}</p> : null}
        <Button type="button" onClick={save} loading={busy}>
          Continue to plan
        </Button>
      </div>
    </>
  );
}
