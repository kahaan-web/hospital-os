'use client';

import type { PatientCreateInput } from '@hos/shared';
import { fieldErrors, GENDERS, patientCreateSchema } from '@hos/shared';
import { Button, Field, Input, Select } from '@hos/ui';
import { useState } from 'react';

const empty: PatientCreateInput = {
  firstName: '',
  gender: 'male',
  mobile: '',
  city: '',
  stateCode: '',
};

export function PatientForm(props: { initial?: Partial<PatientCreateInput>; submitLabel: string; busy?: boolean; onSubmit: (data: PatientCreateInput) => void | Promise<void> }) {
  const [form, setForm] = useState<PatientCreateInput>({ ...empty, ...props.initial });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = async () => {
    const parsed = patientCreateSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    await props.onSubmit(parsed.data);
  };

  return (
    <form
      className="max-w-2xl space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" error={errors.firstName}>
          <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} autoFocus />
        </Field>
        <Field label="Last name" error={errors.lastName}>
          <Input value={form.lastName ?? ''} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
        </Field>
        <Field label="Gender" error={errors.gender}>
          <Select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value as PatientCreateInput['gender'] })}>
            {GENDERS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date of birth" error={errors.dob}>
          <Input type="date" value={form.dob ?? ''} onChange={(e) => setForm({ ...form, dob: e.target.value || null })} />
        </Field>
        <Field label="Mobile" error={errors.mobile}>
          <Input value={form.mobile ?? ''} onChange={(e) => setForm({ ...form, mobile: e.target.value })} placeholder="+91 90000 00000" />
        </Field>
        <Field label="City" error={errors.city}>
          <Input value={form.city ?? ''} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </Field>
        <Field label="State (code)" error={errors.stateCode}>
          <Input value={form.stateCode ?? ''} onChange={(e) => setForm({ ...form, stateCode: e.target.value })} maxLength={2} />
        </Field>
        <Field label="PIN" error={errors.pincode}>
          <Input value={form.pincode ?? ''} onChange={(e) => setForm({ ...form, pincode: e.target.value })} />
        </Field>
      </div>
      <Button type="submit" disabled={props.busy}>
        {props.submitLabel}
      </Button>
    </form>
  );
}
