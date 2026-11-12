'use client';

import { formatDateTime, formatINR } from '@hos/shared';
import { Badge, Button, Field, Input, MoneyInput, PageHeader } from '@hos/ui';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { InsuranceNav } from '@/features/clinical/insurance/InsuranceNav';
import { insuranceApi, statusTone, type InsuranceRequestRow } from '@/features/clinical/insurance/api';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { ApiError } from '@/lib/api';

export default function InsuranceRequestPage() {
  const params = useParams<{ id: string }>();
  const [row, setRow] = useState<InsuranceRequestRow | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [approvedPaise, setApprovedPaise] = useState<number | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(() => {
    insuranceApi
      .request(params.id)
      .then((next) => {
        setRow(next);
        setApprovedPaise((current) => current ?? next.estimatedPaise);
        setError(null);
      })
      .catch(setError);
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn: () => Promise<InsuranceRequestRow>) => {
    setBusy(true);
    setActionError('');
    try {
      setRow(await fn());
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not record the decision');
    } finally {
      setBusy(false);
    }
  };

  if (error) return <PageError error={error} onRetry={load} />;
  if (!row) return <PageLoading label="Loading request…" />;

  return (
    <>
      <PageHeader
        title={`${row.kind === 'preauth' ? 'Pre-authorisation' : 'Claim'} · ${row.patientName}`}
        description={`${row.payerName}${row.policyNo ? ` · Policy ${row.policyNo}` : ''}`}
        actions={<Badge tone={statusTone(row.status)}>{row.status}</Badge>}
      />
      <InsuranceNav />
      <dl className="mb-6 grid max-w-3xl gap-x-6 gap-y-3 text-sm md:grid-cols-2">
        <div>
          <dt className="font-medium">UHID</dt>
          <dd>{row.uhid || '—'}</dd>
        </div>
        <div>
          <dt className="font-medium">Estimated cost</dt>
          <dd>{formatINR(row.estimatedPaise)}</dd>
        </div>
        <div className="md:col-span-2">
          <dt className="font-medium">Diagnosis and planned procedure</dt>
          <dd>{row.diagnosis || '—'}</dd>
        </div>
        <div>
          <dt className="font-medium">Approved amount</dt>
          <dd>{row.approvedPaise == null ? '—' : formatINR(row.approvedPaise)}</dd>
        </div>
        <div>
          <dt className="font-medium">Decided</dt>
          <dd>{row.decidedAt ? formatDateTime(row.decidedAt) : '—'}</dd>
        </div>
        {row.rejectReason ? (
          <div className="md:col-span-2">
            <dt className="font-medium">Rejection reason</dt>
            <dd>{row.rejectReason}</dd>
          </div>
        ) : null}
      </dl>
      {actionError ? (
        <p role="alert" className="mb-3 text-sm" style={{ color: 'var(--hos-fg-danger)' }}>
          {actionError}
        </p>
      ) : null}
      {row.status === 'submitted' ? (
        <div className="grid max-w-3xl gap-6 md:grid-cols-2">
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (approvedPaise != null) void act(() => insuranceApi.approve(row.id, approvedPaise));
            }}
          >
            <Field label="Approved amount (₹)" required>
              <MoneyInput valuePaise={approvedPaise} onChangePaise={setApprovedPaise} required />
            </Field>
            <div>
              <Button type="submit" disabled={busy || !approvedPaise}>
                Approve
              </Button>
            </div>
          </form>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void act(() => insuranceApi.reject(row.id, reason.trim()));
            }}
          >
            <Field label="Rejection reason" required>
              <Input value={reason} onChange={(event) => setReason(event.target.value)} required minLength={3} />
            </Field>
            <div>
              <Button type="submit" variant="secondary" disabled={busy || reason.trim().length < 3}>
                Reject
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
