'use client';

import type { CatalogFeature, CatalogModule, CatalogPlan } from '@hos/shared';
import { Button, Checkbox, Spinner, useToast } from '@hos/ui';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, apiGet, apiPatch } from '@/lib/api';

export interface AdminMatrixDto {
  plans: CatalogPlan[];
  modules: CatalogModule[];
  features: CatalogFeature[];
  included: Record<string, string[]>;
}

function featureKey(planId: string, featureId: string): string {
  return `${planId}:${featureId}`;
}

export function MatrixEditor() {
  const toast = useToast();
  const [data, setData] = useState<AdminMatrixDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [baseline, setBaseline] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    apiGet<AdminMatrixDto>('/admin/matrix')
      .then((m) => {
        setData(m);
        const init = new Set<string>();
        for (const plan of m.plans) {
          for (const fid of m.included[plan.id] ?? []) {
            init.add(featureKey(plan.id, fid));
          }
        }
        setSelected(init);
        setBaseline(new Set(init));
      })
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Failed to load matrix'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = useMemo(() => {
    if (baseline.size !== selected.size) return true;
    for (const k of baseline) {
      if (!selected.has(k)) return true;
    }
    return false;
  }, [baseline, selected]);

  const toggle = useCallback((planId: string, featureId: string, on: boolean) => {
    const k = featureKey(planId, featureId);
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(k);
      else next.delete(k);
      return next;
    });
  }, []);

  const toggleModuleForPlan = useCallback(
    (planId: string, module: CatalogModule, on: boolean) => {
      for (const f of module.features) {
        toggle(planId, f.id, on);
      }
    },
    [toggle],
  );

  const moduleAllOn = useCallback(
    (planId: string, module: CatalogModule): boolean => {
      return module.features.every((f) => selected.has(featureKey(planId, f.id)));
    },
    [selected],
  );

  const save = useCallback(async () => {
    if (!data || !dirty) return;
    const changes: { planId: string; featureId: string; included: boolean }[] = [];
    const allKeys = new Set([...baseline, ...selected]);
    for (const key of allKeys) {
      const sep = key.indexOf(':');
      if (sep < 0) continue;
      const planId = key.slice(0, sep);
      const featureId = key.slice(sep + 1);
      const was = baseline.has(key);
      const now = selected.has(key);
      if (was !== now) {
        changes.push({ planId, featureId, included: now });
      }
    }
    if (changes.length === 0) return;
    setSaving(true);
    try {
      await apiPatch('/admin/matrix', { changes });
      toast.toast({ tone: 'success', title: 'Matrix saved', description: `${changes.length} cells updated.` });
      setBaseline(new Set(selected));
    } catch (e) {
      toast.toast({
        tone: 'error',
        title: 'Save failed',
        description: e instanceof ApiError ? e.message : 'Try again',
      });
    } finally {
      setSaving(false);
    }
  }, [data, dirty, baseline, selected, toast]);

  if (loading) {
    return (
      <div style={{ padding: 'var(--hos-space-6)', display: 'flex', gap: 'var(--hos-space-3)', alignItems: 'center' }}>
        <Spinner />
        <span>Loading plan × module matrix…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: 'var(--hos-space-6)' }}>
        <p style={{ color: 'var(--hos-fg-danger)' }}>{error ?? 'No data'}</p>
        <Button type="button" onClick={load}>
          Retry
        </Button>
      </div>
    );
  }

  const plans = [...data.plans].sort((a, b) => a.sortOrder - b.sortOrder);
  const modules = [...data.modules].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div style={{ position: 'relative' }}>
      {dirty ? (
        <div
          role="status"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--hos-space-4)',
            padding: 'var(--hos-space-3) var(--hos-space-4)',
            background: 'var(--hos-bg-surface)',
            borderBottom: '1px solid var(--hos-border)',
            marginBottom: 'var(--hos-space-4)',
          }}
        >
          <span style={{ fontSize: 'var(--hos-text-sm)', fontWeight: 500 }}>Unsaved matrix changes</span>
          <span style={{ display: 'flex', gap: 'var(--hos-space-2)' }}>
            <Button type="button" variant="secondary" disabled={saving} onClick={() => setSelected(new Set(baseline))}>
              Discard
            </Button>
            <Button type="button" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : 'Save matrix'}
            </Button>
          </span>
        </div>
      ) : null}

      <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 12rem)', border: '1px solid var(--hos-border)' }}>
        <table style={{ borderCollapse: 'collapse', width: 'max-content', minWidth: '100%', fontSize: 'var(--hos-text-sm)' }}>
          <thead style={{ position: 'sticky', top: dirty ? 48 : 0, zIndex: 10, background: 'var(--hos-bg-surface-muted)' }}>
            <tr>
              <th
                style={{
                  textAlign: 'left',
                  padding: 'var(--hos-space-2) var(--hos-space-3)',
                  borderBottom: '1px solid var(--hos-border)',
                  minWidth: '14rem',
                  position: 'sticky',
                  left: 0,
                  zIndex: 11,
                  background: 'var(--hos-bg-surface-muted)',
                }}
              >
                Module / feature
              </th>
              {plans.map((plan) => (
                <th
                  key={plan.id}
                  style={{
                    textAlign: 'center',
                    padding: 'var(--hos-space-2)',
                    borderBottom: '1px solid var(--hos-border)',
                    minWidth: '6.5rem',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{plan.name}</div>
                  <div style={{ fontWeight: 400, color: 'var(--hos-fg-muted)', fontSize: 'var(--hos-text-xs)' }}>
                    {plan.featureCount} features
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modules.map((mod) => (
              <Fragment key={mod.id}>
                <tr style={{ background: 'var(--hos-bg-canvas)' }}>
                  <td
                    colSpan={plans.length + 1}
                    style={{
                      padding: 'var(--hos-space-2) var(--hos-space-3)',
                      fontWeight: 600,
                      borderBottom: '1px solid var(--hos-border)',
                      position: 'sticky',
                      left: 0,
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--hos-space-4)', flexWrap: 'wrap' }}>
                      {mod.name}
                      <span style={{ fontWeight: 400, color: 'var(--hos-fg-muted)' }}>({mod.features.length})</span>
                      {plans.map((plan) => {
                        const all = moduleAllOn(plan.id, mod);
                        return (
                          <Button
                            key={plan.id}
                            type="button"
                            variant="ghost"
                            style={{ fontSize: 'var(--hos-text-xs)', padding: '2px 8px' }}
                            onClick={() => toggleModuleForPlan(plan.id, mod, !all)}
                          >
                            {all ? `Clear ${plan.name}` : `All ${plan.name}`}
                          </Button>
                        );
                      })}
                    </span>
                  </td>
                </tr>
                {mod.features.map((feat) => (
                  <tr key={feat.id}>
                    <td
                      style={{
                        padding: 'var(--hos-space-2) var(--hos-space-3)',
                        borderBottom: '1px solid var(--hos-border)',
                        position: 'sticky',
                        left: 0,
                        background: 'var(--hos-bg-surface)',
                        maxWidth: '20rem',
                      }}
                    >
                      <div>{feat.name}</div>
                      <div style={{ color: 'var(--hos-fg-muted)', fontSize: 'var(--hos-text-xs)' }}>{feat.type}</div>
                    </td>
                    {plans.map((plan) => {
                      const on = selected.has(featureKey(plan.id, feat.id));
                      return (
                        <td
                          key={plan.id}
                          style={{
                            textAlign: 'center',
                            padding: 'var(--hos-space-2)',
                            borderBottom: '1px solid var(--hos-border)',
                          }}
                        >
                          <Checkbox
                            checked={on}
                            onCheckedChange={(v) => toggle(plan.id, feat.id, v === true)}
                            aria-label={`${feat.name} in ${plan.name}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
