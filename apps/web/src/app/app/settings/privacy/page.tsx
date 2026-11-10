'use client';

import type { ConsentDto, DprDto } from '@hos/shared';
import { DPR_TYPES, dprCreateSchema, fieldErrors } from '@hos/shared';
import { Button, DataTable, Field, Input, PageHeader, Select, Textarea, useToast } from '@hos/ui';
import { useCallback, useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { listItems, type Paged } from '@/lib/lists';
import { ApiError, apiGet, apiPost } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

export default function PrivacySettingsPage() {
  const toast = useToast();
  const [requests, setRequests] = useState<DprDto[]>([]);
  const [consents, setConsents] = useState<ConsentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [form, setForm] = useState({
    type: 'access' as (typeof DPR_TYPES)[number],
    principalName: '',
    principalContact: '',
    reference: '',
    details: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiGet<DprDto[] | Paged<DprDto>>('/tenant/privacy/requests'),
      apiGet<ConsentDto[]>('/tenant/consents'),
    ])
      .then(([dpr, con]) => {
        setRequests(listItems(dpr));
        setConsents(con);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    const parsed = dprCreateSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    try {
      await apiPost('/tenant/privacy/requests', parsed.data);
      toast.toast({ tone: 'success', title: 'Request logged' });
      setForm({ type: 'access', principalName: '', principalContact: '', reference: '', details: '' });
      load();
    } catch (e) {
      toast.toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not save' });
    }
  };

  if (loading) return <PageLoading />;
  if (error) return <PageError error={error} onRetry={load} />;

  return (
    <>
      <PageHeader title="Privacy (DPDP)" description="Data principal requests and consent records." />
      <section>
        <h2 style={{ fontSize: 'var(--hos-text-base)', fontWeight: 600 }}>New data principal request</h2>
        <div style={{ display: 'grid', gap: 'var(--hos-space-3)', maxWidth: '32rem', marginTop: 'var(--hos-space-3)' }}>
          <Field label="Type">
            <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as typeof form.type }))}>
              {DPR_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Principal name" error={errors.principalName}>
            <Input value={form.principalName} onChange={(e) => setForm((f) => ({ ...f, principalName: e.target.value }))} />
          </Field>
          <Field label="Contact" error={errors.principalContact}>
            <Input value={form.principalContact} onChange={(e) => setForm((f) => ({ ...f, principalContact: e.target.value }))} />
          </Field>
          <Field label="Reference" error={errors.reference}>
            <Input value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} />
          </Field>
          <Field label="Details" error={errors.details}>
            <Textarea value={form.details} onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))} rows={4} />
          </Field>
          <Button type="button" onClick={create}>
            Submit request
          </Button>
        </div>
      </section>
      <section style={{ marginTop: 'var(--hos-space-8)' }}>
        <h2 style={{ fontSize: 'var(--hos-text-base)', fontWeight: 600 }}>Open requests</h2>
        <DataTable
          data={requests}
          getRowId={(r) => r.id}
          columns={[
            { id: 'type', header: 'Type', accessor: (r) => r.type },
            { id: 'status', header: 'Status', accessor: (r) => r.status },
            { id: 'principal', header: 'Principal', accessor: (r) => r.principalName },
            { id: 'created', header: 'Created', accessor: (r) => formatDateTime(r.createdAt) },
          ]}
        />
      </section>
      <section style={{ marginTop: 'var(--hos-space-8)' }}>
        <h2 style={{ fontSize: 'var(--hos-text-base)', fontWeight: 600 }}>Consents</h2>
        <DataTable
          data={consents}
          getRowId={(c) => c.id}
          columns={[
            { id: 'user', header: 'User', accessor: (c) => c.userName },
            { id: 'version', header: 'Notice', accessor: (c) => c.noticeVersion },
            { id: 'purposes', header: 'Purposes', accessor: (c) => c.purposes.join(', ') },
            { id: 'granted', header: 'Granted', accessor: (c) => formatDateTime(c.grantedAt) },
          ]}
        />
      </section>
    </>
  );
}
