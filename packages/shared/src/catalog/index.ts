import { ANDROID_FEATURES, MODULE_DEFS, PLATFORM_FEATURES, type ModuleDef } from './modules';
import { SHEET_ROWS, type SheetRow } from './sheet-features.generated';

export * from './modules';
export { SHEET_ROWS, type SheetRow } from './sheet-features.generated';

export type FeatureType = 'function' | 'report' | 'interface' | 'app_feature';
export type FeatureSource = 'sheet' | 'doc' | 'platform';
export type TierKey = 'basic' | 'medium' | 'premium';
export const TIER_KEYS: readonly TierKey[] = ['basic', 'medium', 'premium'];

export interface FeatureDef {
  /** Entitlement key: `<moduleKey>.<slug>`. Every sheet function/report is one entitlement. */
  key: string;
  moduleKey: string;
  name: string;
  sourceName: string;
  type: FeatureType;
  source: FeatureSource;
  sheetModule: string | null;
  sheetStatus: SheetRow['status'];
  sheetRow: number | null;
  /** Default tier inclusion (Sheet1). Android/doc features default to no tier until the App Admin decides. */
  tiers: Record<TierKey, boolean>;
  sortOrder: number;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function featureKey(moduleKey: string, name: string): string {
  return `${moduleKey}.${slugify(name)}`;
}

function moduleForSheetRow(row: SheetRow): ModuleDef {
  const candidates = MODULE_DEFS.filter((m) => m.sheetModule === row.sheetModule);
  const first = candidates[0];
  if (!first) throw new Error(`No catalogue module maps sheet module "${row.sheetModule}" (row ${row.row})`);
  if (candidates.length === 1) return first;
  const match = candidates.find((m) => m.sheetNames?.includes(row.name));
  if (!match) throw new Error(`Sheet row ${row.row} "${row.name}" is not assigned to a module`);
  return match;
}

function buildFeatures(): FeatureDef[] {
  const out: FeatureDef[] = [];
  const perModule = new Map<string, number>();
  const next = (moduleKey: string) => {
    const n = (perModule.get(moduleKey) ?? 0) + 1;
    perModule.set(moduleKey, n);
    return n;
  };

  for (const row of SHEET_ROWS) {
    const mod = moduleForSheetRow(row);
    out.push({
      key: featureKey(mod.key, row.name),
      moduleKey: mod.key,
      name: row.name,
      sourceName: row.name,
      type: row.type,
      source: 'sheet',
      sheetModule: row.sheetModule,
      sheetStatus: row.status,
      sheetRow: row.row,
      tiers: { basic: row.basic, medium: row.medium, premium: row.premium },
      sortOrder: next(mod.key),
    });
  }
  for (const [moduleKey, feats] of Object.entries(PLATFORM_FEATURES)) {
    for (const f of feats) {
      out.push({
        key: featureKey(moduleKey, f.name),
        moduleKey,
        name: f.name,
        sourceName: f.name,
        type: f.type,
        source: 'platform',
        sheetModule: null,
        sheetStatus: null,
        sheetRow: null,
        tiers: { basic: true, medium: true, premium: true },
        sortOrder: next(moduleKey),
      });
    }
  }
  for (const [moduleKey, feats] of Object.entries(ANDROID_FEATURES)) {
    for (const f of feats) {
      out.push({
        key: featureKey(moduleKey, f.name),
        moduleKey,
        name: f.name,
        sourceName: f.sourceName,
        type: 'app_feature',
        source: 'doc',
        sheetModule: null,
        sheetStatus: null,
        sheetRow: null,
        tiers: { basic: false, medium: false, premium: false },
        sortOrder: next(moduleKey),
      });
    }
  }
  const keys = new Set<string>();
  for (const f of out) {
    if (keys.has(f.key)) throw new Error(`Duplicate entitlement key ${f.key}`);
    keys.add(f.key);
  }
  return out;
}

export const FEATURE_DEFS: readonly FeatureDef[] = buildFeatures();

export const SHEET_FEATURE_DEFS: readonly FeatureDef[] = FEATURE_DEFS.filter((f) => f.source === 'sheet');

export function moduleDef(key: string): ModuleDef | undefined {
  return MODULE_DEFS.find((m) => m.key === key);
}

/** Default plans seeded from the tier sheet. Prices are placeholders — set by the App Admin. */
export const DEFAULT_PLANS: readonly {
  key: TierKey;
  name: string;
  tagline: string;
  description: string;
  highlight: boolean;
  badge: string | null;
  monthlyRupees: number;
}[] = [
  {
    key: 'basic',
    name: 'Basic',
    tagline: 'Run the front desk',
    description: 'Registration, appointments, OPD and IPD billing, admissions and pharmacy for a single busy counter.',
    highlight: false,
    badge: null,
    monthlyRupees: 2999,
  },
  {
    key: 'medium',
    name: 'Medium',
    tagline: 'Add the lab and richer records',
    description: 'Everything in Basic, plus the laboratory, patient documents, photo IDs, mailers and purchase orders.',
    highlight: true,
    badge: 'Most popular',
    monthlyRupees: 5999,
  },
  {
    key: 'premium',
    name: 'Premium',
    tagline: 'The complete clinical suite',
    description: 'Everything in Medium, plus Nurse Station, CPOE, Doctor Accounting, MLC, barcodes and lab interfaces.',
    highlight: false,
    badge: null,
    monthlyRupees: 9999,
  },
];

/** Annual billing charges this many months for twelve ("2 months free on annual"). */
export const ANNUAL_MONTHS_CHARGED = 10;
