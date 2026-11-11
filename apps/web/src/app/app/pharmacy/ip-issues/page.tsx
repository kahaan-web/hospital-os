'use client';

import type { PharmacyInpatientDto, PharmacyIpIssueDto, PharmacyItemDto } from '@hos/shared';
import { formatINR } from '@hos/shared';
import { Button, DataTable, Field, Input, PageHeader, Select } from '@hos/ui';
import { useCallback, useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { pharmacyApi } from '@/features/clinical/pharmacy/api';
import { GstNote, PharmacyNav } from '@/features/clinical/pharmacy/PharmacyNav';

export default function IpIssuesPage() {
  const [items, setItems] = useState<PharmacyItemDto[]>([]);
  const [stays, setStays] = useState<PharmacyInpatientDto[]>([]);
  const [issues, setIssues] = useState<PharmacyIpIssueDto[]>([]);
  const [encounterId, setEncounterId] = useState('');
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState('1');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([pharmacyApi.items(), pharmacyApi.inpatients(), pharmacyApi.ipIssues()])
      .then(([itemRows, stayRows, issueRows]) => {
        const active = itemRows.filter((row) => row.active);
        setItems(active);
        setItemId((current) => current || active[0]?.id || '');
        setStays(stayRows);
        setEncounterId((current) => current || stayRows[0]?.encounterId || '');
        setIssues(issueRows);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function issue(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const created = await pharmacyApi.issue({ encounterId, lines: [{ itemId, qty: Number(qty) }] });
      setMessage(`Issued ${created.number}. The ward charge is exempt.`);
      setIssues((rows) => [created, ...rows]);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not issue');
    } finally {
      setBusy(false);
    }
  }

  async function sendBack(row: PharmacyIpIssueDto) {
    const line = row.lines.find((entry) => entry.qty > entry.returnedQty);
    if (!line) return;
    const why = reason.trim() || 'Returned to pharmacy';
    setBusy(true);
    setMessage('');
    try {
      const updated = await pharmacyApi.returnIssue(row.id, { reason: why, lines: [{ lineId: line.id, qty: line.qty - line.returnedQty }] });
      setIssues((rows) => rows.map((entry) => (entry.id === updated.id ? updated : entry)));
      setMessage(`Returned ${updated.number} and reversed the charge.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not return');
    } finally {
      setBusy(false);
    }
  }

  if (loading && stays.length === 0 && issues.length === 0) return <PageLoading label="Loading admissions" />;
  if (error) return <PageError error={error} onRetry={load} />;

  return (
    <>
      <PharmacyNav />
      <PageHeader title="IP issues" description="Issue stock to an open admission. The charge is healthcare-exempt." />
      <form onSubmit={issue} style={{ display: 'grid', gap: '0.75rem', maxWidth: '36rem', marginBottom: '1.5rem' }}>
        <Field label="Admission" htmlFor="stay">
          <Select id="stay" value={encounterId} onChange={(e) => setEncounterId(e.target.value)} required>
            {stays.map((stay) => (
              <option key={stay.encounterId} value={stay.encounterId}>
                {stay.patientName} · {stay.uhid} · {stay.bedLabel || stay.number}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Item" htmlFor="ip-item">
          <Select id="ip-item" value={itemId} onChange={(e) => setItemId(e.target.value)} required>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.brand} · {item.strength}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Quantity" htmlFor="ip-qty">
          <Input id="ip-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} required />
        </Field>
        <Button type="submit" loading={busy} disabled={!encounterId || !itemId}>
          Issue to ward
        </Button>
      </form>
      <Field label="Return reason" htmlFor="return-reason">
        <Input id="return-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Not given" />
      </Field>
      {message ? <p role="status">{message}</p> : null}
      <DataTable
        data={issues}
        getRowId={(row) => row.id}
        emptyMessage="No issues from this location yet."
        columns={[
          { id: 'number', header: 'Number', accessor: (row) => row.number },
          { id: 'lines', header: 'Lines', accessor: (row) => row.lines.map((line) => `${line.brand} × ${line.qty - line.returnedQty}`).join(', ') },
          { id: 'value', header: 'MRP', accessor: (row) => formatINR(row.lines.reduce((sum, line) => sum + line.mrpPaise * line.qty, 0)) },
          {
            id: 'return',
            header: '',
            accessor: () => '',
            render: (row) =>
              row.lines.some((line) => line.qty > line.returnedQty) ? (
                <Button type="button" variant="secondary" onClick={() => sendBack(row)} disabled={busy}>
                  Return remaining
                </Button>
              ) : (
                'Returned'
              ),
          },
        ]}
      />
      <GstNote />
    </>
  );
}
