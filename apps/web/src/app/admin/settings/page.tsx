'use client';

import type { PlatformSettingsDto } from '@hos/shared';
import { INDIAN_STATES, platformSettingsSchema, fieldErrors } from '@hos/shared';
import { Button, Field, Input, PageHeader, Select, Textarea, useToast } from '@hos/ui';
import { useCallback, useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { ApiError, apiGet, apiPut } from '@/lib/api';

export default function AdminSettingsPage() {
  const toast = useToast();
  const [form, setForm] = useState<PlatformSettingsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<PlatformSettingsDto>('/admin/settings')
      .then(setForm)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!form) return;
    const parsed = platformSettingsSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setBusy(true);
    try {
      const updated = await apiPut<PlatformSettingsDto>('/admin/settings', parsed.data);
      setForm(updated);
      toast.toast({ tone: 'success', title: 'Platform settings saved' });
    } catch (e) {
      setErrors({ form: e instanceof ApiError ? e.message : 'Save failed' });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PageLoading />;
  if (error) return <PageError error={error} onRetry={load} />;
  if (!form) return null;

  return (
    <>
      <PageHeader title="Platform settings" description="Invoice supplier identity and default GST/SAC." />
      <Stack>
        <Field label="Supplier legal name">
          <Input
            value={form.supplierLegalName}
            onChange={(e) => setForm((f) => (f ? { ...f, supplierLegalName: e.target.value } : f))}
          />
        </Field>
        <Field label="Trade name">
          <Input
            value={form.supplierTradeName}
            onChange={(e) => setForm((f) => (f ? { ...f, supplierTradeName: e.target.value } : f))}
          />
        </Field>
        <Field label="GSTIN">
          <Input value={form.supplierGstin} onChange={(e) => setForm((f) => (f ? { ...f, supplierGstin: e.target.value } : f))} />
        </Field>
        <Field label="State">
          <Select
            value={form.supplierStateCode}
            onChange={(e) => setForm((f) => (f ? { ...f, supplierStateCode: e.target.value } : f))}
          >
            {INDIAN_STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Address">
          <Textarea
            value={form.supplierAddress}
            onChange={(e) => setForm((f) => (f ? { ...f, supplierAddress: e.target.value } : f))}
            rows={3}
          />
        </Field>
        <Field label="Default SAC">
          <Input value={form.defaultSacCode} onChange={(e) => setForm((f) => (f ? { ...f, defaultSacCode: e.target.value } : f))} />
        </Field>
        <Field label="Default GST (basis points)">
          <Input
            type="number"
            value={form.defaultGstRateBp}
            onChange={(e) => setForm((f) => (f ? { ...f, defaultGstRateBp: Number(e.target.value) } : f))}
          />
        </Field>
        <Field label="Invoice prefix">
          <Input value={form.invoicePrefix} onChange={(e) => setForm((f) => (f ? { ...f, invoicePrefix: e.target.value } : f))} />
        </Field>
        {errors.form ? <p style={{ color: 'var(--hos-fg-danger)' }}>{errors.form}</p> : null}
        <Button type="button" onClick={save} loading={busy}>
          Save settings
        </Button>
      </Stack>
    </>
  );
}

function Stack({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hos-space-3)', maxWidth: '32rem' }}>{children}</div>;
}
