'use client';

import type { Catalog, OnboardingState } from '@hos/shared';
import { planSelectionSchema, fieldErrors, type BillingCycle } from '@hos/shared';
import { Button, PageHeader, PlanCard, Switch, Field, Input, useToast } from '@hos/ui';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { OnboardingGate } from '@/features/onboarding/OnboardingGate';
import { OnboardingWizardShell } from '@/features/onboarding/OnboardingWizardShell';
import { QuoteSummary, useClientQuote } from '@/features/billing/QuoteSummary';
import { wt } from '@/i18n';
import { ApiError, apiGet, apiPut } from '@/lib/api';

export default function PlanPage() {
  const router = useRouter();
  const { toast: showToast } = useToast();
  const [catalog, setCatalog] = useState<Catalog | null>(null);

  useEffect(() => {
    apiGet<Catalog>('/catalog').then(setCatalog).catch(() => setCatalog(null));
  }, []);

  return (
    <OnboardingWizardShell currentHref="/onboarding/plan">
      <OnboardingGate allowedHrefs={['/onboarding/plan']} currentHref="/onboarding/plan">
        {(state) => (
          <PlanForm
            state={state}
            catalog={catalog}
            onSaved={() => router.push('/onboarding/addons')}
            showToast={showToast}
          />
        )}
      </OnboardingGate>
    </OnboardingWizardShell>
  );
}

function PlanForm({
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
  const [planId, setPlanId] = useState(state.draft.planId ?? catalog?.plans[0]?.id ?? '');
  const [cycle, setCycle] = useState<BillingCycle>(state.draft.cycle);
  const [locationCount, setLocationCount] = useState(
    state.draft.locationCount || Math.max(1, state.locations.length),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const placeState = state.locations[0]?.stateCode ?? '27';
  const preview = useClientQuote(
    catalog,
    planId
      ? { planId, cycle, locationCount, addonModuleIds: state.draft.addonModuleIds }
      : null,
    placeState,
  );

  const save = useCallback(async () => {
    const parsed = planSelectionSchema.safeParse({ planId, cycle, locationCount });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setBusy(true);
    try {
      await apiPut('/onboarding/plan', parsed.data);
      showToast({ tone: 'success', title: wt('plan.saved') });
      onSaved();
    } catch (e) {
      setErrors(e instanceof ApiError ? { form: e.message } : { form: 'Save failed' });
    } finally {
      setBusy(false);
    }
  }, [planId, cycle, locationCount, onSaved, showToast]);

  const plans = catalog?.plans.filter((p) => p.status === 'active').sort((a, b) => a.sortOrder - b.sortOrder) ?? [];

  return (
    <>
      <PageHeader title={wt('plan.title')} description={wt('plan.description')} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--hos-space-3)', marginBottom: 'var(--hos-space-4)' }}>
        <Switch checked={cycle === 'annual'} onCheckedChange={(v) => setCycle(v ? 'annual' : 'monthly')} label="Annual billing (2 months free)" />
      </div>
      <Field label="Billable locations" error={errors.locationCount} hint="Usually matches branches you added">
        <Input
          type="number"
          min={1}
          value={locationCount}
          onChange={(e) => setLocationCount(Number(e.target.value))}
          style={{ maxWidth: '8rem' }}
        />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))', gap: 'var(--hos-space-4)', marginTop: 'var(--hos-space-4)' }}>
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            name={plan.name}
            description={plan.tagline}
            monthlyPaise={plan.monthlyPaise}
            annualPaise={plan.annualPaise}
            selected={planId === plan.id}
            badge={plan.pricePlaceholder ? wt('plan.samplePriceBadge') : plan.badge}
            highlight={plan.highlight}
            onSelect={() => setPlanId(plan.id)}
            featureSummary={`${catalog?.matrix[plan.id]?.length ?? plan.featureCount} entitlements`}
          />
        ))}
      </div>
      {preview ? (
        <div style={{ marginTop: 'var(--hos-space-6)', maxWidth: '20rem' }}>
          <QuoteSummary totals={preview.totals} />
        </div>
      ) : null}
      {errors.form ? <p style={{ color: 'var(--hos-fg-danger)' }}>{errors.form}</p> : null}
      <Button type="button" style={{ marginTop: 'var(--hos-space-4)' }} onClick={save} loading={busy} disabled={!planId}>
        {wt('plan.saveContinue')}
      </Button>
    </>
  );
}
