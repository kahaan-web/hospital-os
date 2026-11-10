import type { OnboardingStep } from '@hos/shared';
import { wt, type WebMessageKey } from '@/i18n';

const WIZARD_ROUTE_DEFS = [
  { key: 'signup', labelKey: 'wizard.steps.signup' as WebMessageKey, href: '/onboarding/signup' },
  { key: 'facility', labelKey: 'wizard.steps.facility' as WebMessageKey, href: '/onboarding/facility' },
  { key: 'locations', labelKey: 'wizard.steps.locations' as WebMessageKey, href: '/onboarding/locations' },
  { key: 'plan', labelKey: 'wizard.steps.plan' as WebMessageKey, href: '/onboarding/plan' },
  { key: 'addons', labelKey: 'wizard.steps.addons' as WebMessageKey, href: '/onboarding/addons' },
  { key: 'checkout', labelKey: 'wizard.steps.checkout' as WebMessageKey, href: '/onboarding/checkout' },
  { key: 'invoice', labelKey: 'wizard.steps.invoice' as WebMessageKey, href: '/onboarding/invoice' },
  { key: 'provisioning', labelKey: 'wizard.steps.provisioning' as WebMessageKey, href: '/onboarding/provisioning' },
] as const;

/** Wizard UI routes (labels resolved at render time for future locales). */
export function getWizardRoutes() {
  return WIZARD_ROUTE_DEFS.map((s) => ({ ...s, label: wt(s.labelKey) }));
}

const STEP_ORDER: OnboardingStep[] = [
  'facility',
  'locations',
  'plan',
  'addons',
  'payment',
  'invoice',
  'provisioning',
  'done',
];

export function apiStepIndex(step: OnboardingStep): number {
  return STEP_ORDER.indexOf(step);
}

export function wizardStepFromApi(step: OnboardingStep, paid: boolean): number {
  if (step === 'done') return 7;
  const idx = apiStepIndex(step);
  if (step === 'payment' && paid) return 6;
  if (step === 'payment' && !paid) return 5;
  // API steps map: facility=1, locations=2, plan=3, addons=4, payment=5, invoice=6, provisioning=7
  const map: Record<OnboardingStep, number> = {
    facility: 1,
    locations: 2,
    plan: 3,
    addons: 4,
    payment: 5,
    invoice: 6,
    provisioning: 7,
    done: 7,
  };
  return map[step] ?? idx + 1;
}

export function wizardHrefIndex(href: string): number {
  const i = WIZARD_ROUTE_DEFS.findIndex((s) => s.href === href);
  return i < 0 ? Number.MAX_SAFE_INTEGER : i;
}

export function wizardBackHref(currentHref: string): string | null {
  const idx = wizardHrefIndex(currentHref);
  if (idx <= 0) return null;
  return WIZARD_ROUTE_DEFS[idx - 1]?.href ?? null;
}

export function routeForApiStep(step: OnboardingStep, paid: boolean): string {
  if (step === 'done') return '/app';
  if (step === 'facility') return '/onboarding/facility';
  if (step === 'locations') return '/onboarding/locations';
  if (step === 'plan') return '/onboarding/plan';
  if (step === 'addons') return '/onboarding/addons';
  if (step === 'payment') return paid ? '/onboarding/invoice' : '/onboarding/checkout';
  if (step === 'invoice') return '/onboarding/invoice';
  if (step === 'provisioning') return '/onboarding/provisioning';
  return '/onboarding/signup';
}
