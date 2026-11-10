'use client';

import type { Catalog, OnboardingState } from '@hos/shared';
import { addonSelectionSchema, fieldErrors } from '@hos/shared';
import { Button, ModuleTile, PageHeader, useToast } from '@hos/ui';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { OnboardingGate } from '@/features/onboarding/OnboardingGate';
import { OnboardingWizardShell } from '@/features/onboarding/OnboardingWizardShell';
import { QuoteSummary, useClientQuote } from '@/features/billing/QuoteSummary';
import { wt } from '@/i18n';
import { formatINR } from '@/lib/format';
import { ApiError, apiGet, apiPut } from '@/lib/api';

export default function AddonsPage() {
  const router = useRouter();
  const { toast: showToast } = useToast();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  useEffect(() => {
    apiGet<Catalog>('/catalog').then(setCatalog).catch(() => null);
  }, []);

  return (
    <OnboardingWizardShell currentHref="/onboarding/addons">
      <OnboardingGate allowedHrefs={['/onboarding/addons']} currentHref="/onboarding/addons">
        {(state) => (
          <AddonsForm
            state={state}
            catalog={catalog}
            onSaved={() => router.push('/onboarding/checkout')}
            showToast={showToast}
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
  showToast,
}: {
  state: OnboardingState;
  catalog: Catalog | null;
  onSaved: () => void;
  showToast: ReturnType<typeof useToast>['toast'];
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
  const preview = useClientQuote(catalog, cfg, state.locations[0]?.stateCode ?? '27');

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
      showToast({ tone: 'success', title: wt('addons.saved') });
      onSaved();
    } catch (e) {
      setErrors({ form: e instanceof ApiError ? e.message : 'Save failed' });
    } finally {
      setBusy(false);
    }
  }, [selected, onSaved, showToast]);

  return (
    <>
      <PageHeader title={wt('addons.title')} description={wt('addons.description')} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(14rem, 1fr))', gap: 'var(--hos-space-3)' }}>
        {addons.map((mod) => {
          const on = selected.includes(mod.id);
          const priceLine =
            mod.addonMonthlyPaise != null
              ? wt('addons.pricePerLocation', { price: formatINR(mod.addonMonthlyPaise) })
              : wt('wizard.samplePrice');
          const toggle = () => setSelected((ids) => (on ? ids.filter((x) => x !== mod.id) : [...ids, mod.id]));
          return (
            <ModuleTile
              key={mod.id}
              title={mod.name}
              description={
                <>
                  {mod.description}
                  <span style={{ display: 'block', marginTop: 'var(--hos-space-1)', color: 'var(--hos-fg-muted)' }}>{priceLine}</span>
                </>
              }
              state={on ? 'enabled' : 'locked'}
              ctaLabel={on ? wt('addons.remove') : wt('addons.add')}
              onCta={toggle}
              onOpen={toggle}
            />
          );
        })}
      </div>
      {addons.length === 0 ? <p style={{ color: 'var(--hos-fg-muted)' }}>{wt('addons.empty')}</p> : null}
      {preview ? (
        <div style={{ marginTop: 'var(--hos-space-6)', maxWidth: '20rem' }}>
          <QuoteSummary totals={preview.totals} label="Live price summary" />
        </div>
      ) : null}
      {errors.form ? <p style={{ color: 'var(--hos-fg-danger)' }}>{errors.form}</p> : null}
      <Button type="button" style={{ marginTop: 'var(--hos-space-4)' }} onClick={save} loading={busy}>
        {wt('addons.saveContinue')}
      </Button>
    </>
  );
}
