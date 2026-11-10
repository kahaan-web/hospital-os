'use client';

import type { AdminTenantDetailDto, Catalog, OverrideDto } from '@hos/shared';
import { overrideSchema, suspendSchema, fieldErrors } from '@hos/shared';
import { Badge, Button, DataTable, Dialog, Field, Input, PageHeader, Select, Textarea, useToast } from '@hos/ui';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { ApiError, apiDelete, apiGet, apiPost } from '@/lib/api';
import { formatINR, isoToDDMMYYYY } from '@/lib/format';

export default function AdminTenantDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const { toast: showToast } = useToast();
  const [detail, setDetail] = useState<AdminTenantDetailDto | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [override, setOverride] = useState({
    target: 'module' as 'module' | 'feature',
    moduleId: '',
    featureId: '',
    effect: 'grant' as 'grant' | 'revoke',
    reason: '',
  });
  const [suspendReason, setSuspendReason] = useState('');
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<AdminTenantDetailDto>(`/admin/tenants/${id}`)
      .then(setDetail)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
    apiGet<Catalog>('/catalog').then(setCatalog).catch(() => null);
  }, [load]);

  const addOverride = async () => {
    const parsed = overrideSchema.safeParse({
      target: override.target,
      moduleId: override.target === 'module' ? override.moduleId || undefined : undefined,
      featureId: override.target === 'feature' ? override.featureId || undefined : undefined,
      effect: override.effect,
      reason: override.reason,
    });
    if (!parsed.success) {
      showToast({ tone: 'error', title: 'Check override fields', description: fieldErrors(parsed.error).reason });
      return;
    }
    try {
      await apiPost<OverrideDto>(`/admin/tenants/${id}/overrides`, parsed.data);
      showToast({ tone: 'success', title: 'Override saved' });
      load();
    } catch (e) {
      showToast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Failed' });
    }
  };

  const suspend = async () => {
    const parsed = suspendSchema.safeParse({ reason: suspendReason });
    if (!parsed.success) {
      showToast({ tone: 'error', title: fieldErrors(parsed.error).reason ?? 'Give a suspend reason' });
      return;
    }
    setActionBusy(true);
    try {
      await apiPost(`/admin/tenants/${id}/suspend`, parsed.data);
      showToast({ tone: 'success', title: 'Tenant suspended' });
      setSuspendOpen(false);
      setSuspendReason('');
      load();
    } catch (e) {
      showToast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Suspend failed' });
    } finally {
      setActionBusy(false);
    }
  };

  const reactivate = async () => {
    setActionBusy(true);
    try {
      await apiPost(`/admin/tenants/${id}/reactivate`);
      showToast({ tone: 'success', title: 'Tenant reactivated' });
      load();
    } catch (e) {
      showToast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Reactivate failed' });
    } finally {
      setActionBusy(false);
    }
  };

  const removeOverride = async (overrideId: string) => {
    try {
      await apiDelete(`/admin/tenants/${id}/overrides/${overrideId}`);
      load();
    } catch (e) {
      showToast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not remove override' });
    }
  };

  if (loading) return <PageLoading />;
  if (error) return <PageError error={error} onRetry={load} />;
  if (!detail) return null;

  const t = detail.tenant;
  const features =
    catalog?.modules.flatMap((m) => m.features.map((f) => ({ ...f, moduleName: m.name }))) ?? [];

  return (
    <>
      <PageHeader
        title={t.displayName}
        description={`${t.legalName} · ${t.status}`}
        actions={<Badge tone={t.status === 'suspended' ? 'error' : t.status === 'active' ? 'success' : 'info'}>{t.status}</Badge>}
      />
      {detail.subscription ? (
        <p style={{ fontSize: 'var(--hos-text-sm)' }}>
          Plan {detail.subscription.planName} · {detail.subscription.locationCount} location(s)
        </p>
      ) : null}

      <section style={{ marginTop: 'var(--hos-space-6)' }}>
        <h2 style={{ fontWeight: 600 }}>Overrides</h2>
        <Stack>
          <Field label="Target type">
            <Select
              value={override.target}
              onChange={(e) =>
                setOverride((o) => ({
                  ...o,
                  target: e.target.value as 'module' | 'feature',
                  moduleId: '',
                  featureId: '',
                }))
              }
            >
              <option value="module">Module</option>
              <option value="feature">Feature</option>
            </Select>
          </Field>
          {override.target === 'module' ? (
            <Field label="Module">
              <Select value={override.moduleId} onChange={(e) => setOverride((o) => ({ ...o, moduleId: e.target.value }))}>
                <option value="">Choose module</option>
                {detail.modules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="Feature">
              <Select value={override.featureId} onChange={(e) => setOverride((o) => ({ ...o, featureId: e.target.value }))}>
                <option value="">Choose feature</option>
                {features.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.moduleName}: {f.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Effect">
            <Select
              value={override.effect}
              onChange={(e) => setOverride((o) => ({ ...o, effect: e.target.value as 'grant' | 'revoke' }))}
            >
              <option value="grant">Grant</option>
              <option value="revoke">Revoke</option>
            </Select>
          </Field>
          <Field label="Reason">
            <Textarea value={override.reason} onChange={(e) => setOverride((o) => ({ ...o, reason: e.target.value }))} rows={2} />
          </Field>
          <Button type="button" onClick={addOverride}>
            Apply override
          </Button>
        </Stack>
        <DataTable
          data={detail.overrides}
          getRowId={(o) => o.id}
          columns={[
            { id: 'label', header: 'Target', accessor: (o) => o.label },
            { id: 'effect', header: 'Effect', accessor: (o) => o.effect },
            { id: 'reason', header: 'Reason', accessor: (o) => o.reason },
            {
              id: 'actions',
              header: '',
              accessor: () => '',
              render: (o) => (
                <Button type="button" variant="ghost" size="sm" onClick={() => removeOverride(o.id)}>
                  Remove
                </Button>
              ),
            },
          ]}
        />
      </section>

      <section style={{ marginTop: 'var(--hos-space-6)' }}>
        <h2 style={{ fontWeight: 600 }}>Suspend / reactivate</h2>
        <Stack>
          {t.status === 'active' || t.status === 'onboarding' ? (
            <>
              <Field label="Suspend reason" hint="Recorded in the audit log">
                <Input value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} />
              </Field>
              <Button type="button" variant="danger" onClick={() => setSuspendOpen(true)}>
                Suspend tenant
              </Button>
            </>
          ) : null}
          {t.status === 'suspended' ? (
            <Button type="button" variant="secondary" disabled={actionBusy} onClick={reactivate}>
              Reactivate tenant
            </Button>
          ) : null}
        </Stack>
      </section>

      <section style={{ marginTop: 'var(--hos-space-6)' }}>
        <h2 style={{ fontWeight: 600 }}>Invoices</h2>
        <DataTable
          data={detail.invoices}
          getRowId={(i) => i.id}
          columns={[
            { id: 'num', header: 'Number', accessor: (i) => i.number },
            { id: 'total', header: 'Total', accessor: (i) => formatINR(i.totalPaise) },
            { id: 'status', header: 'Status', accessor: (i) => i.status },
          ]}
        />
      </section>

      <section style={{ marginTop: 'var(--hos-space-6)' }}>
        <h2 style={{ fontWeight: 600 }}>Payments</h2>
        <DataTable
          data={detail.payments}
          getRowId={(p) => p.id}
          columns={[
            { id: 'order', header: 'Order', accessor: (p) => p.orderId },
            { id: 'method', header: 'Method', accessor: (p) => p.methodLabel },
            { id: 'amount', header: 'Amount', accessor: (p) => formatINR(p.amountPaise) },
            { id: 'status', header: 'Status', accessor: (p) => p.status },
            { id: 'date', header: 'Date', accessor: (p) => isoToDDMMYYYY(p.createdAt) },
          ]}
          emptyMessage="No payments recorded"
        />
      </section>

      <Dialog
        open={suspendOpen}
        onOpenChange={setSuspendOpen}
        title="Suspend tenant?"
        description="Staff will lose access until you reactivate. This is audited."
      >
        <p style={{ fontSize: 'var(--hos-text-sm)', margin: '0 0 var(--hos-space-4)' }}>
          Reason: <strong>{suspendReason || '—'}</strong>
        </p>
        <div style={{ display: 'flex', gap: 'var(--hos-space-2)', justifyContent: 'flex-end' }}>
          <Button type="button" variant="secondary" onClick={() => setSuspendOpen(false)}>
            Cancel
          </Button>
          <Button type="button" variant="danger" loading={actionBusy} onClick={suspend}>
            Confirm suspend
          </Button>
        </div>
      </Dialog>
    </>
  );
}

function Stack({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hos-space-3)', maxWidth: '28rem', margin: 'var(--hos-space-3) 0' }}>
      {children}
    </div>
  );
}
