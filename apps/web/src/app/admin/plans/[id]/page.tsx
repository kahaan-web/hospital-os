'use client';

import type { CatalogPlan } from '@hos/shared';
import { planCreateSchema, planPriceSchema, planUpdateSchema, fieldErrors } from '@hos/shared';
import { Button, Field, Input, PageHeader, Select, Textarea, useToast } from '@hos/ui';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { ApiError, apiGet, apiPatch, apiPost, apiPut } from '@/lib/api';
import { formatINR } from '@/lib/format';

export default function AdminPlanEditPage() {
  const params = useParams();
  const id = String(params.id);
  const isCreate = id === 'create';
  const router = useRouter();
  const toast = useToast();
  const [plan, setPlan] = useState<CatalogPlan | null>(null);
  const [loading, setLoading] = useState(!isCreate);
  const [error, setError] = useState<unknown>(null);
  const [form, setForm] = useState({
    name: '',
    tagline: '',
    description: '',
    status: 'draft' as CatalogPlan['status'],
    monthlyPaise: 299900,
    annualPaise: 2999000,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (isCreate) return;
    setLoading(true);
    apiGet<CatalogPlan[]>('/admin/plans')
      .then((plans) => {
        const found = plans.find((p) => p.id === id);
        if (!found) throw new Error('Plan not found');
        setPlan(found);
        setForm({
          name: found.name,
          tagline: found.tagline,
          description: found.description,
          status: found.status,
          monthlyPaise: found.monthlyPaise,
          annualPaise: found.annualPaise,
        });
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [id, isCreate]);

  useEffect(() => {
    load();
  }, [load]);

  const saveMeta = async () => {
    const parsed = planUpdateSchema.safeParse({
      name: form.name,
      tagline: form.tagline,
      description: form.description,
      status: form.status,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setBusy(true);
    try {
      if (isCreate) {
        const key = form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-/, '').slice(0, 20) || 'plan';
        const createBody = planCreateSchema.safeParse({
          key,
          name: form.name,
          tagline: form.tagline,
          description: form.description,
          status: form.status,
          monthlyPaise: form.monthlyPaise,
          annualPaise: form.annualPaise,
        });
        if (!createBody.success) {
          setErrors(fieldErrors(createBody.error));
          return;
        }
        const created = await apiPost<CatalogPlan>('/admin/plans', createBody.data);
        router.replace(`/admin/plans/${created.id}`);
      } else {
        await apiPatch(`/admin/plans/${id}`, parsed.data);
        const priceParsed = planPriceSchema.safeParse({
          monthlyPaise: form.monthlyPaise,
          annualPaise: form.annualPaise,
        });
        if (priceParsed.success) {
          await apiPut(`/admin/plans/${id}/price`, priceParsed.data);
        }
        toast.toast({ tone: 'success', title: 'Plan saved' });
        load();
      }
    } catch (e) {
      setErrors({ form: e instanceof ApiError ? e.message : 'Save failed' });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PageLoading />;
  if (error) return <PageError error={error} onRetry={load} />;

  return (
    <>
      <PageHeader title={isCreate ? 'Create plan' : plan?.name ?? 'Edit plan'} description="Display copy and sample per-location prices." />
      <FormStack>
        <Field label="Name" error={errors.name}>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </Field>
        <Field label="Tagline" error={errors.tagline}>
          <Input value={form.tagline} onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))} />
        </Field>
        <Field label="Description" error={errors.description}>
          <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} />
        </Field>
        <Field label="Status">
          <Select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as CatalogPlan['status'] }))}>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </Select>
        </Field>
        <Field label="Monthly price (paise)" hint={formatINR(form.monthlyPaise)}>
          <Input type="number" value={form.monthlyPaise} onChange={(e) => setForm((f) => ({ ...f, monthlyPaise: Number(e.target.value) }))} />
        </Field>
        <Field label="Annual price (paise)" hint={formatINR(form.annualPaise)}>
          <Input type="number" value={form.annualPaise} onChange={(e) => setForm((f) => ({ ...f, annualPaise: Number(e.target.value) }))} />
        </Field>
        {errors.form ? <p style={{ color: 'var(--hos-fg-danger)' }}>{errors.form}</p> : null}
        <Button type="button" onClick={saveMeta} loading={busy}>
          Save plan
        </Button>
      </FormStack>
    </>
  );
}

function FormStack({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hos-space-3)', maxWidth: '32rem' }}>{children}</div>;
}
