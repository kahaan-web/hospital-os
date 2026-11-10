'use client';

import type { AdminTenantDetailDto, OverrideDto } from '@hos/shared';
import { overrideSchema, suspendSchema, fieldErrors } from '@hos/shared';
import { Badge, Button, DataTable, Field, Input, PageHeader, Select, Textarea, useToast } from '@hos/ui';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { ApiError, apiDelete, apiGet, apiPost } from '@/lib/api';
import { formatINR } from '@/lib/format';

export default function AdminTenantDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const toast = useToast();
  const [detail, setDetail] = useState<AdminTenantDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [override, setOverride] = useState({
    target: 'module' as 'module' | 'feature',
    moduleId: '',
    effect: 'grant' as 'grant' | 'revoke',
    reason: '',
  });
  const [suspendReason, setSuspendReason] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    apiGet<AdminTenantDetailDto>(`/admin/tenants/${id}`)
      .then(setDetail)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const addOverride = async () => {
    const parsed = overrideSchema.safeParse({
      ...override,
      moduleId: override.moduleId || undefined,
    });
    if (!parsed.success) {
      toast.toast({ tone: 'error', title: fieldErrors(parsed.error).reason ?? 'Check override fields' });
      return;
    }
    try {
      await apiPost<OverrideDto>(`/admin/tenants/${id}/overrides`, parsed.data);
      toast.toast({ tone: 'success', title: 'Override saved' });
      load();
    } catch (e) {
      toast.toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Failed' });
    }
  };

  const suspend = async () => {
    const parsed = suspendSchema.safeParse({ reason: suspendReason });
    if (!parsed.success) return;
    await apiPost(`/admin/tenants/${id}/suspend`, parsed.data);
    load();
  };

  const reactivate = async () => {
    await apiPost(`/admin/tenants/${id}/reactivate`);
    load();
  };

  if (loading) return <PageLoading />;
  if (error) return <PageError error={error} onRetry={load} />;
  if (!detail) return null;

  const t = detail.tenant;

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
                <Button type="button" variant="ghost" size="sm" onClick={() => apiDelete(`/admin/tenants/${id}/overrides/${o.id}`).then(load)}>
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
          <Field label="Reason">
            <Input value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} />
          </Field>
          <span style={{ display: 'flex', gap: 'var(--hos-space-2)' }}>
            <Button type="button" variant="danger" onClick={suspend}>
              Suspend tenant
            </Button>
            <Button type="button" variant="secondary" onClick={reactivate}>
              Reactivate
            </Button>
          </span>
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
