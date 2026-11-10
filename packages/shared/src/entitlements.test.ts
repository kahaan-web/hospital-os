import { describe, expect, it } from 'vitest';
import { canUseModule, computeEntitlements, hasFeature, type EntitlementInput, type EntitlementModule } from './entitlements';

const modules: readonly EntitlementModule[] = [
  { key: 'opd', status: 'available', featureKeys: ['opd.visit', 'opd.register'] },
  { key: 'lab', status: 'available', featureKeys: ['lab.sample', 'lab.result'] },
  { key: 'cpoe', status: 'coming_soon', featureKeys: ['cpoe.orders'] },
  { key: 'ot', status: 'hidden', featureKeys: ['ot.slots'] },
  { key: 'blank', status: 'available', featureKeys: [] },
];

function run(partial: Partial<EntitlementInput> & Pick<EntitlementInput, 'planFeatureKeys'>) {
  return computeEntitlements({
    modules,
    addonModuleKeys: partial.addonModuleKeys ?? [],
    overrides: partial.overrides ?? [],
    planFeatureKeys: partial.planFeatureKeys,
  });
}

describe('computeEntitlements', () => {
  it('enables only the plan features and locks everything else', () => {
    const e = run({ planFeatureKeys: ['opd.visit', 'not-a-real-feature'] });
    expect([...e.features]).toEqual(['opd.visit']);
    expect(hasFeature(e, 'opd.visit')).toBe(true);
    expect(hasFeature(e, 'opd.register')).toBe(false);

    const opd = e.modules.get('opd');
    expect(opd).toMatchObject({
      access: 'enabled',
      entitled: true,
      source: 'plan',
      featureCount: 2,
      entitledFeatureCount: 1,
    });
    expect(canUseModule(e, 'opd')).toBe(true);
    expect(e.modules.get('lab')).toMatchObject({ access: 'locked', entitled: false, source: null });
    expect(canUseModule(e, 'lab')).toBe(false);
  });

  it('adds every feature of a purchased add-on without replacing a plan source', () => {
    const e = run({ planFeatureKeys: ['opd.visit', 'lab.sample'], addonModuleKeys: ['lab', 'missing-module'] });
    expect(e.features).toEqual(new Set(['opd.visit', 'lab.sample', 'lab.result']));
    expect(e.modules.get('lab')).toMatchObject({ access: 'enabled', entitled: true, source: 'plan', entitledFeatureCount: 2 });
    expect(e.modules.get('opd')?.source).toBe('plan');
  });

  it('grants and revokes whole modules, then lets a feature override win', () => {
    const granted = run({
      planFeatureKeys: [],
      overrides: [{ target: 'module', key: 'lab', effect: 'grant' }],
    });
    expect([...granted.features].sort()).toEqual(['lab.result', 'lab.sample']);
    expect(granted.modules.get('lab')).toMatchObject({ access: 'enabled', entitled: true, source: 'override' });

    const revoked = run({
      planFeatureKeys: ['opd.visit', 'opd.register', 'lab.sample'],
      addonModuleKeys: ['lab'],
      overrides: [{ target: 'module', key: 'opd', effect: 'revoke' }],
    });
    expect(revoked.features.has('opd.visit')).toBe(false);
    expect(revoked.features.has('opd.register')).toBe(false);
    expect(revoked.modules.get('opd')).toMatchObject({ access: 'locked', entitled: false, source: null });
    expect(revoked.modules.get('lab')?.access).toBe('enabled');

    const featureWins = run({
      planFeatureKeys: ['opd.visit', 'opd.register'],
      overrides: [
        { target: 'module', key: 'opd', effect: 'revoke' },
        { target: 'feature', key: 'opd.register', effect: 'grant' },
        { target: 'feature', key: 'does-not-exist', effect: 'grant' },
      ],
    });
    expect([...featureWins.features]).toEqual(['opd.register']);
    expect(featureWins.modules.get('opd')).toMatchObject({
      access: 'enabled',
      entitled: true,
      source: 'override',
      entitledFeatureCount: 1,
    });
  });

  it('revokes a single plan feature and ignores unknown modules', () => {
    const e = run({
      planFeatureKeys: ['opd.visit', 'opd.register'],
      overrides: [
        { target: 'feature', key: 'opd.visit', effect: 'revoke' },
        { target: 'module', key: 'nope', effect: 'grant' },
      ],
    });
    expect([...e.features]).toEqual(['opd.register']);
    expect(e.modules.get('opd')).toMatchObject({ source: 'plan', entitledFeatureCount: 1, access: 'enabled' });
  });

  it('keeps coming-soon and hidden modules out of the shell even when they are entitled', () => {
    const e = run({
      planFeatureKeys: ['cpoe.orders', 'ot.slots'],
      overrides: [{ target: 'module', key: 'blank', effect: 'grant' }],
    });
    expect(e.modules.get('cpoe')).toMatchObject({ access: 'coming_soon', entitled: true, source: 'plan' });
    expect(e.modules.get('ot')).toMatchObject({ access: 'hidden', entitled: true, source: 'plan' });
    expect(e.modules.get('blank')).toMatchObject({
      access: 'enabled',
      entitled: true,
      source: 'override',
      featureCount: 0,
      entitledFeatureCount: 0,
    });
    expect(canUseModule(e, 'cpoe')).toBe(false);
    expect(canUseModule(e, 'ot')).toBe(false);
    expect(canUseModule(e, 'blank')).toBe(true);
    expect(hasFeature(e, 'cpoe.orders')).toBe(true);
  });

  it('treats an add-on grant of an empty module as entitled', () => {
    const e = run({ planFeatureKeys: [], addonModuleKeys: ['blank'] });
    expect(e.modules.get('blank')).toMatchObject({ entitled: true, source: 'addon', access: 'enabled' });
    expect(e.features.size).toBe(0);
  });
});
