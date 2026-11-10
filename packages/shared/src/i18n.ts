// Hindi-ready i18n: every locale implements the English dictionary's shape; missing keys fall back to English.
// Phase A ships English only. Add `hi` strings here and the UI (web and, later, Android) picks them up.

import { clinicalEn } from './clinical/i18n';

export const en = {
  app: { name: 'Hospital OS', tagline: 'The calm operating system for nursing homes, clinics and hospitals' },
  common: {
    save: 'Save',
    saveAndContinue: 'Save and continue',
    continue: 'Continue',
    back: 'Back',
    cancel: 'Cancel',
    close: 'Close',
    retry: 'Try again',
    edit: 'Edit',
    remove: 'Remove',
    add: 'Add',
    search: 'Search',
    loading: 'Loading…',
    signIn: 'Sign in',
    signOut: 'Sign out',
    optional: 'optional',
    perLocationMonth: 'per location / month',
    perLocationYear: 'per location / year',
    placeholderPrice: 'Placeholder price — set by App Admin',
    comingSoon: 'Coming soon',
    locked: 'Locked',
    enabled: 'Enabled',
    upgrade: 'Upgrade',
    buyAddon: 'Buy add-on',
  },
  nav: {
    dashboard: 'Dashboard',
    modules: 'Modules',
    settings: 'Settings',
    billing: 'Plan & billing',
    users: 'Users',
    locations: 'Locations',
    security: 'Security',
    privacy: 'Privacy & consent',
    audit: 'Audit trail',
    skipToContent: 'Skip to main content',
    commandPalette: 'Search or jump to…',
    allLocations: 'All locations',
    switchLocation: 'Switch location',
  },
  admin: {
    title: 'App Admin',
    overview: 'Overview',
    plans: 'Plans & tiers',
    matrix: 'Feature matrix',
    modules: 'Module catalogue',
    tenants: 'Tenants',
    audit: 'Audit trail',
    settings: 'Billing settings',
  },
  wizard: {
    steps: {
      signup: 'Sign up',
      facility: 'Facility',
      locations: 'Locations',
      plan: 'Plan',
      addons: 'Add-ons',
      payment: 'Review & pay',
      invoice: 'Tax invoice',
      provisioning: 'Set up',
    },
    resume: 'Your progress is saved. You can close this window and continue later.',
  },
  access: {
    enabled: 'Enabled',
    locked: 'Not in your plan',
    coming_soon: 'Coming soon',
    hidden: 'Hidden',
  },
  clinical: clinicalEn,
} as const;

type DeepPartial<T> = { [K in keyof T]?: T[K] extends string ? string : DeepPartial<T[K]> };

export type Dictionary = typeof en;
export type Locale = 'en' | 'hi';

/** Hindi dictionary (structure ready, strings to be supplied by a translator). */
export const hi: DeepPartial<Dictionary> = {};

export const LOCALES: Record<Locale, { label: string; dict: DeepPartial<Dictionary>; dir: 'ltr' }> = {
  en: { label: 'English', dict: en, dir: 'ltr' },
  hi: { label: 'हिन्दी', dict: hi, dir: 'ltr' },
};

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<Dictionary>;

function lookup(dict: unknown, key: string): string | undefined {
  let cur: unknown = dict;
  for (const part of key.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

/** Returns a translator; `{name}` placeholders are replaced from `params`. */
export function createTranslator(locale: Locale = 'en') {
  const dict = LOCALES[locale]?.dict ?? en;
  return function t(key: MessageKey, params?: Record<string, string | number>): string {
    const template = lookup(dict, key) ?? lookup(en, key) ?? key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
  };
}
