// Entitlement engine (pure). Effective entitlements =
//   plan features  ∪  purchased add-on modules (all of the module's features)
//   then per-tenant overrides set by the App Admin (module-level first, feature-level last — most specific wins).

import type { ModuleStatus } from './catalog/modules';

export interface EntitlementModule {
  key: string;
  status: ModuleStatus;
  featureKeys: readonly string[];
}

export interface EntitlementOverride {
  target: 'module' | 'feature';
  /** Module key or feature key. */
  key: string;
  effect: 'grant' | 'revoke';
}

export interface EntitlementInput {
  modules: readonly EntitlementModule[];
  /** Feature keys included in the tenant's plan. */
  planFeatureKeys: readonly string[];
  /** Module keys bought as add-ons. */
  addonModuleKeys: readonly string[];
  overrides: readonly EntitlementOverride[];
}

export type ModuleAccess = 'enabled' | 'locked' | 'coming_soon' | 'hidden';
export type EntitlementSource = 'plan' | 'addon' | 'override';

export interface ModuleEntitlement {
  key: string;
  access: ModuleAccess;
  /** Entitled regardless of catalogue status (a coming-soon module can be pre-entitled). */
  entitled: boolean;
  source: EntitlementSource | null;
  featureCount: number;
  entitledFeatureCount: number;
}

export interface Entitlements {
  features: Set<string>;
  modules: Map<string, ModuleEntitlement>;
}

export function computeEntitlements(input: EntitlementInput): Entitlements {
  const featureSource = new Map<string, EntitlementSource>();
  const moduleGrant = new Map<string, EntitlementSource>();
  const moduleRevoked = new Set<string>();
  const moduleByKey = new Map(input.modules.map((m) => [m.key, m]));
  const knownFeatures = new Set(input.modules.flatMap((m) => m.featureKeys));

  for (const k of input.planFeatureKeys) if (knownFeatures.has(k)) featureSource.set(k, 'plan');

  for (const mk of input.addonModuleKeys) {
    const m = moduleByKey.get(mk);
    if (!m) continue;
    moduleGrant.set(mk, 'addon');
    for (const fk of m.featureKeys) if (!featureSource.has(fk)) featureSource.set(fk, 'addon');
  }

  for (const o of input.overrides.filter((x) => x.target === 'module')) {
    const m = moduleByKey.get(o.key);
    if (!m) continue;
    if (o.effect === 'grant') {
      moduleGrant.set(o.key, 'override');
      for (const fk of m.featureKeys) if (!featureSource.has(fk)) featureSource.set(fk, 'override');
    } else {
      moduleGrant.delete(o.key);
      moduleRevoked.add(o.key);
      for (const fk of m.featureKeys) featureSource.delete(fk);
    }
  }

  for (const o of input.overrides.filter((x) => x.target === 'feature')) {
    if (!knownFeatures.has(o.key)) continue;
    if (o.effect === 'grant') {
      if (!featureSource.has(o.key)) featureSource.set(o.key, 'override');
    } else featureSource.delete(o.key);
  }

  const modules = new Map<string, ModuleEntitlement>();
  for (const m of input.modules) {
    const entitledFeatures = m.featureKeys.filter((k) => featureSource.has(k));
    const explicit = moduleGrant.get(m.key) ?? null;
    const entitled = entitledFeatures.length > 0 || (explicit !== null && !moduleRevoked.has(m.key));
    let source: EntitlementSource | null = null;
    if (entitled) {
      const sources = new Set(entitledFeatures.map((k) => featureSource.get(k)));
      source = sources.has('plan') ? 'plan' : explicit ?? (sources.has('addon') ? 'addon' : 'override');
    }
    const access: ModuleAccess =
      m.status === 'hidden' ? 'hidden' : m.status === 'coming_soon' ? 'coming_soon' : entitled ? 'enabled' : 'locked';
    modules.set(m.key, {
      key: m.key,
      access,
      entitled,
      source,
      featureCount: m.featureKeys.length,
      entitledFeatureCount: entitledFeatures.length,
    });
  }

  return { features: new Set(featureSource.keys()), modules };
}

export function hasFeature(e: Entitlements, featureKey: string): boolean {
  return e.features.has(featureKey);
}

export function canUseModule(e: Entitlements, moduleKey: string): boolean {
  return e.modules.get(moduleKey)?.access === 'enabled';
}
