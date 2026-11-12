'use client';

import { createTranslator, formatDateTime, formatNumberIN } from '@hos/shared';
import { Badge, Button, DataTable, EmptyState, Field, Input, PageHeader, Select, Textarea } from '@hos/ui';
import { useCallback, useEffect, useState } from 'react';
import { marketingApi, type Campaign } from '@/features/clinical/mvp/api';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { ApiError } from '@/lib/api';

const t = createTranslator('en');

export default function MarketingPage() {
  const [rows, setRows] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [channel, setChannel] = useState('sms');
  const [segmentNote, setSegmentNote] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState('0');

  const load = useCallback(() => {
    marketingApi
      .list()
      .then((items) => {
        setRows(items);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    setBusy(true);
    setFormError('');
    try {
      const created = await marketingApi.create({ name, channel, segmentNote, message, audienceCount: Number(audience) || 0 });
      setRows((current) => [created, ...current]);
      setName('');
      setSegmentNote('');
      setMessage('');
      setAudience('0');
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save the campaign');
    } finally {
      setBusy(false);
    }
  };

  const markSent = async (id: string) => {
    setFormError('');
    try {
      const updated = await marketingApi.markSent(id);
      setRows((current) => current.map((row) => (row.id === id ? updated : row)));
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not mark the campaign as sent');
    }
  };

  if (loading && rows.length === 0 && !error) return <PageLoading label="Loading campaigns…" />;
  if (error && rows.length === 0) return <PageError error={error} onRetry={load} />;

  return (
    <>
      <PageHeader title={t('clinical.marketing.title')} description={t('clinical.marketing.subtitle')} />
      {formError ? (
        <p role="alert" className="mb-3 text-sm" style={{ color: 'var(--hos-fg-danger)' }}>
          {formError}
        </p>
      ) : null}
      <form
        className="mb-6 grid max-w-3xl gap-3 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <Field label="Campaign name" required>
          <Input value={name} onChange={(event) => setName(event.target.value)} required minLength={3} maxLength={120} />
        </Field>
        <Field label="Channel" required>
          <Select aria-label="Channel" value={channel} onChange={(event) => setChannel(event.target.value)}>
            <option value="sms">SMS</option>
            <option value="email">Email</option>
            <option value="whatsapp">WhatsApp</option>
          </Select>
        </Field>
        <Field label="Audience note" hint="Describe the segment. Only patients with marketing consent are counted.">
          <Input value={segmentNote} onChange={(event) => setSegmentNote(event.target.value)} maxLength={300} />
        </Field>
        <Field label="Audience size">
          <Input type="number" min={0} value={audience} onChange={(event) => setAudience(event.target.value)} />
        </Field>
        <div className="md:col-span-2">
          <Field label="Message" required hint="Include an opt-out instruction, for example: Reply STOP to opt out.">
            <Textarea value={message} onChange={(event) => setMessage(event.target.value)} required minLength={5} maxLength={600} rows={3} />
          </Field>
        </div>
        <div>
          <Button type="submit" loading={busy}>
            Save draft
          </Button>
        </div>
      </form>
      {rows.length === 0 ? (
        <EmptyState title="No campaigns yet" description="Save a draft above, then mark it as sent." />
      ) : (
        <DataTable
          data={rows}
          getRowId={(row) => row.id}
          pageSize={25}
          emptyMessage="No campaigns"
          columns={[
            { id: 'name', header: 'Campaign', accessor: (row) => row.name },
            { id: 'channel', header: 'Channel', accessor: (row) => row.channel.toUpperCase() },
            { id: 'audience', header: 'Audience', accessor: (row) => formatNumberIN(row.audienceCount) },
            {
              id: 'sent',
              header: 'Sent / suppressed',
              accessor: (row) => (row.status === 'sent' ? `${formatNumberIN(row.sentCount)} / ${formatNumberIN(row.suppressedCount)}` : '—'),
            },
            {
              id: 'status',
              header: 'Status',
              accessor: (row) => row.status,
              render: (row) => (
                <Badge tone={row.status === 'sent' ? 'success' : 'neutral'}>
                  {row.status === 'sent' ? `Sent (mock) ${formatDateTime(row.sentAt)}` : row.status === 'draft' ? 'Draft' : 'Cancelled'}
                </Badge>
              ),
            },
            {
              id: 'action',
              header: '',
              accessor: () => '',
              render: (row) =>
                row.status === 'draft' ? (
                  <Button size="sm" variant="secondary" onClick={() => void markSent(row.id)} aria-label={`Mark ${row.name} as sent`}>
                    Mark sent
                  </Button>
                ) : null,
            },
          ]}
        />
      )}
    </>
  );
}
