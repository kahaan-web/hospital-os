'use client';

import type { Catalog, OnboardingState } from '@hos/shared';
import { addonSelectionSchema, fieldErrors } from '@hos/shared';
import { Button, ModuleTile, PageHeader, useToast } from '@hos/ui';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { OnboardingGate } from '@/features/onboarding/OnboardingGate';
import { OnboardingWizardShell } from '@/features/onboarding/OnboardingWizardShell';
import { QuoteSummary, useClientQuote } from '@/features/billing/QuoteSummary';
import { ApiError, apiGet, apiPut } from '@/lib/api';

export default function AddonsPage() {
  const router = useRouter();
  const toast = useToast();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  useEffect(() => {
    apiGet<Catalog>('/catalog').then(setCatalog).catch(() => null);
  }, []);

  return (
    <OnboardingWizardShell currentHref="/onboarding/addons">
      <OnboardingGate allowedHrefs={['/onboarding/addons']}>
        {(state) => (
          <AddonsForm
            state={state}
            catalog={catalog}
            onSaved={() => router.push('/onboarding/checkout')}
            toast={toast}
          />
        )}
      </OnboardingGate>
    </OnboardingWizardShell>
  );
}

function AddonsForm({
  state,
  catalog,
  onSaved,
  toast,
}: {
  state: OnboardingState;
  catalog: Catalog | null;
  onSaved: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [selected, setSelected] = useState<string[]>(state.draft.addonModuleIds);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const planId = state.draft.planId ?? '';
  const cfg = planId
    ? {
        planId,
        cycle: state.draft.cycle,
        locationCount: state.draft.locationCount,
        addonModuleIds: selected,
      }
    : null;
  const preview = useClientQuote(catalog, cfg, state.locations[0]?.stateCode ?? 'MH');

  const planFeatures = planId && catalog ? new Set(catalog.matrix[planId] ?? []) : new Set<string>();
  const addons =
    catalog?.modules.filter(
      (m) => m.addonPurchasable && m.status === 'available' && m.features.every((f) => !planFeatures.has(f.id)),
    ) ?? [];

  const save = useCallback(async () => {
    const parsed = addonSelectionSchema.safeParse({ moduleIds: selected });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setBusy(true);
    try {
      await apiPut('/onboarding/addons', parsed.data);
      toast.toast({ tone: 'success', title: 'Add-ons saved' });
      onSaved();
    } catch (e) {
      setErrors({ form: e instanceof ApiError ? e.message : 'Save failed' });
    } finally {
      setBusy(false);
    }
  }, [selected, onSaved, toast]);

  return (
    <>
      <PageHeader title="Add-on modules" description="Buy modules not in your tier. Prices are sample values per location." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(14rem, 1fr))', gap: 'var(--hos-space-3)' }}>
        {addons.map((mod) => {
          const on = selected.includes(mod.id);
          return (
            <ModuleTile
              key={mod.id}
              title={mod.name}
              description={mod.description}
              state={on ? 'enabled' : 'locked'}
              onOpen={() =>
                setSelected((ids) => (on ? ids.filter((x) => x !== mod.id) : [...ids, mod.id]))
              }
            />
          );
        })}
      </div>
      {addons.length === 0 ? <p style={{ color: 'var(--hos-fg-muted)' }}>No purchasable add-ons for this plan.</p> : null}
      {preview ? (
        <div style={{ marginTop: 'var(--hos-space-6)', maxWidth: '20rem' }}>
          <QuoteSummary totals={preview.totals} label="Live price summary" />
        </div>
      ) : null}
      {errors.form ? <p style={{ color: 'var(--hos-fg-danger)' }}>{errors.form}</p> : null}
      <Button type="button" style={{ marginTop: 'var(--hos-space-4)' }} onClick={save} loading={busy}>
        Review and pay
      </Button>
    </>
  );
}
