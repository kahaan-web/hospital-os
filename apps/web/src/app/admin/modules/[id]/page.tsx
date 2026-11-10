'use client';

import type { CatalogModule } from '@hos/shared';
import { moduleUpdateSchema, fieldErrors } from '@hos/shared';
import { Button, Field, Input, PageHeader, Select, Switch, Textarea, useToast } from '@hos/ui';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { ApiError, apiGet, apiPatch } from '@/lib/api';

export default function AdminModuleEditPage() {
  const params = useParams();
  const id = String(params.id);
  const toast = useToast();
  const [mod, setMod] = useState<CatalogModule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    setLoading(true);
    apiGet<CatalogModule[]>('/admin/modules')
      .then((list) => {
        const found = list.find((m) => m.id === id);
        if (!found) throw new Error('Module not found');
        setMod(found);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!mod) return;
    const body = {
      name: mod.name,
      description: mod.description,
      status: mod.status,
      addonPurchasable: mod.addonPurchasable,
      gstRateBp: mod.gstRateBp,
      sacCode: mod.sacCode,
      addonMonthlyPaise: mod.addonMonthlyPaise,
      addonAnnualPaise: mod.addonAnnualPaise,
    };
    const parsed = moduleUpdateSchema.safeParse(body);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setBusy(true);
    try {
      await apiPatch(`/admin/modules/${id}`, parsed.data);
      load();
      toast.toast({ tone: 'success', title: 'Module updated' });
    } catch (e) {
      setErrors({ form: e instanceof ApiError ? e.message : 'Save failed' });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PageLoading />;
  if (error) return <PageError error={error} onRetry={load} />;
  if (!mod) return null;

  return (
    <>
      <PageHeader title={mod.name} description={`${mod.code} · ${mod.kind}`} />
      <Stack>
        <Field label="Display name">
          <Input value={mod.name} onChange={(e) => setMod((m) => (m ? { ...m, name: e.target.value } : m))} />
        </Field>
        <Field label="Description">
          <Textarea
            value={mod.description}
            onChange={(e) => setMod((m) => (m ? { ...m, description: e.target.value } : m))}
            rows={3}
          />
        </Field>
        <Field label="Status">
          <Select
            value={mod.status}
            onChange={(e) => setMod((m) => (m ? { ...m, status: e.target.value as CatalogModule['status'] } : m))}
          >
            <option value="available">Available</option>
            <option value="coming_soon">Coming soon</option>
            <option value="hidden">Hidden</option>
          </Select>
        </Field>
        <Switch
          label="Add-on purchasable"
          checked={mod.addonPurchasable}
          onCheckedChange={(v) => setMod((m) => (m ? { ...m, addonPurchasable: v } : m))}
        />
        <Field label="GST rate (basis points)">
          <Input
            type="number"
            value={mod.gstRateBp}
            onChange={(e) => setMod((m) => (m ? { ...m, gstRateBp: Number(e.target.value) } : m))}
          />
        </Field>
        <Field label="SAC code">
          <Input value={mod.sacCode} onChange={(e) => setMod((m) => (m ? { ...m, sacCode: e.target.value } : m))} />
        </Field>
        <Field label="Add-on monthly (paise)">
          <Input
            type="number"
            value={mod.addonMonthlyPaise ?? ''}
            onChange={(e) =>
              setMod((m) => (m ? { ...m, addonMonthlyPaise: e.target.value ? Number(e.target.value) : null } : m))
            }
          />
        </Field>
        <Field label="Add-on annual (paise)">
          <Input
            type="number"
            value={mod.addonAnnualPaise ?? ''}
            onChange={(e) =>
              setMod((m) => (m ? { ...m, addonAnnualPaise: e.target.value ? Number(e.target.value) : null } : m))
            }
          />
        </Field>
        {errors.form ? <p style={{ color: 'var(--hos-fg-danger)' }}>{errors.form}</p> : null}
        <Button type="button" onClick={save} loading={busy}>
          Save module
        </Button>
      </Stack>
    </>
  );
}

function Stack({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hos-space-3)', maxWidth: '32rem' }}>{children}</div>;
}
