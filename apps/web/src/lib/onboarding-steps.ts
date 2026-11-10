import type { OnboardingStep } from '@hos/shared';
import { wt } from '@/i18n';

/** Wizard UI routes (step 1 is signup; API step starts at facility after OTP). */
export const WIZARD_ROUTES = [
  { key: 'signup', label: wt('wizard.steps.signup'), href: '/onboarding/signup' },
  { key: 'facility', label: wt('wizard.steps.facility'), href: '/onboarding/facility' },
  { key: 'locations', label: wt('wizard.steps.locations'), href: '/onboarding/locations' },
  { key: 'plan', label: wt('wizard.steps.plan'), href: '/onboarding/plan' },
  { key: 'addons', label: wt('wizard.steps.addons'), href: '/onboarding/addons' },
  { key: 'checkout', label: wt('wizard.steps.checkout'), href: '/onboarding/checkout' },
  { key: 'invoice', label: wt('wizard.steps.invoice'), href: '/onboarding/invoice' },
  { key: 'provisioning', label: wt('wizard.steps.provisioning'), href: '/onboarding/provisioning' },
] as const;

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
  const i = WIZARD_ROUTES.findIndex((s) => s.href === href);
  return i < 0 ? Number.MAX_SAFE_INTEGER : i;
}

export function wizardBackHref(currentHref: string): string | null {
  const idx = wizardHrefIndex(currentHref);
  if (idx <= 0) return null;
  return WIZARD_ROUTES[idx - 1]?.href ?? null;
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
