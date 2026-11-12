'use client';

import type { PatientAlertDto, PatientAlertInput } from '@hos/shared';
import { formatDateTime } from '@hos/shared';
import { Badge, Button, DataTable, Field, Input, PageHeader, Select } from '@hos/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { ApiError, apiGet, apiPost } from '@/lib/api';

const KIND_LABEL: Record<PatientAlertDto['kind'], string> = { allergy: 'Allergy', condition: 'Condition', alert: 'Alert' };

export default function PatientAllergiesPage() {
  const params = useParams<{ id: string }>();
  const [rows, setRows] = useState<PatientAlertDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [kind, setKind] = useState<PatientAlertInput['kind']>('allergy');
  const [text, setText] = useState('');
  const [severity, setSeverity] = useState<PatientAlertInput['severity']>('low');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<PatientAlertDto[]>(`/tenant/clinical/patients/${params.id}/alerts`)
      .then(setRows)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await apiPost(`/tenant/clinical/patients/${params.id}/alerts`, { kind, text, severity }, crypto.randomUUID());
      setText('');
      load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Could not save the entry');
    } finally {
      setBusy(false);
    }
  };

  if (loading && rows.length === 0 && !error) return <PageLoading />;
  if (error) return <PageError error={error} onRetry={load} />;

  return (
    <>
      <PageHeader
        title="Allergies and alerts"
        description="Recorded allergies, conditions and alerts. Allergies are checked when a medicine is prescribed."
        actions={
          <Link href={`/app/patients/${params.id}`} className="hos-link">
            Back to patient
          </Link>
        }
      />
      <DataTable
        data={rows}
        getRowId={(row) => row.id}
        emptyMessage="No allergies or alerts recorded."
        columns={[
          { id: 'kind', header: 'Type', accessor: (row) => KIND_LABEL[row.kind] },
          { id: 'text', header: 'Detail', accessor: (row) => row.text },
          {
            id: 'severity',
            header: 'Severity',
            accessor: (row) => row.severity,
            render: (row) => <Badge tone={row.severity === 'high' ? 'error' : 'neutral'}>{row.severity === 'high' ? 'High' : 'Low'}</Badge>,
          },
          { id: 'when', header: 'Recorded', accessor: (row) => formatDateTime(row.createdAt) },
          { id: 'state', header: 'Status', accessor: (row) => (row.inactiveAt ? 'Inactive' : 'Active') },
        ]}
      />
      <form onSubmit={add} className="mt-6 flex max-w-3xl flex-wrap items-end gap-3" aria-label="Add an allergy or alert">
        <Field label="Type" htmlFor="alert-kind">
          <Select id="alert-kind" value={kind} onChange={(e) => setKind(e.target.value as PatientAlertInput['kind'])}>
            <option value="allergy">Allergy</option>
            <option value="condition">Condition</option>
            <option value="alert">Alert</option>
          </Select>
        </Field>
        <Field label="Detail (for example Penicillin: rash)" htmlFor="alert-text">
          <Input id="alert-text" value={text} onChange={(e) => setText(e.target.value)} maxLength={240} />
        </Field>
        <Field label="Severity" htmlFor="alert-severity">
          <Select id="alert-severity" value={severity} onChange={(e) => setSeverity(e.target.value as PatientAlertInput['severity'])}>
            <option value="low">Low</option>
            <option value="high">High</option>
          </Select>
        </Field>
        <Button type="submit" loading={busy} disabled={text.trim().length < 2}>
          Add
        </Button>
      </form>
      {message ? (
        <p role="alert" className="mt-2 text-sm" style={{ color: 'var(--hos-fg-danger)' }}>
          {message}
        </p>
      ) : null}
    </>
  );
}
