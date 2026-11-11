'use client';

import type { StatementOfAccountDto } from '@hos/shared';
import { formatINR } from '@hos/shared';
import { Button, PageHeader } from '@hos/ui';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { ipBillingApi } from '@/features/clinical/ipbilling/api';
import { ApiError } from '@/lib/api';

export default function IpEncounterBillingPage() {
  const params = useParams<{ encounterId: string }>();
  const encounterId = params.encounterId;
  const [statement, setStatement] = useState<StatementOfAccountDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    ipBillingApi
      .statement(encounterId)
      .then((data) => {
        setStatement(data);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [encounterId]);

  useEffect(() => {
    load();
  }, [load]);

  const prepareFinal = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const bill = await ipBillingApi.createBill(encounterId, { interim: false, applyDeposits: true, payClass: 'cash' });
      await ipBillingApi.finalise(bill.id);
      setMessage(`Final bill ${bill.number ?? bill.id.slice(0, 8)} prepared. Deposits applied where available.`);
      load();
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : 'Could not prepare the bill');
    } finally {
      setBusy(false);
    }
  };

  if (loading && !statement) return <PageLoading />;
  if (error && !statement) return <PageError error={error} onRetry={load} />;
  if (!statement) return null;

  return (
    <>
      <PageHeader
        title={statement.patientName}
        description={`${statement.uhid} · ${statement.encounterNumber} · Balance ${formatINR(statement.balancePaise)}`}
        actions={
          <Button onClick={prepareFinal} disabled={busy}>
            Prepare final bill
          </Button>
        }
      />
      {message ? (
        <p role="status" className="mb-4 text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
      <div className="hos-card overflow-x-auto">
        <table className="hos-table w-full text-sm">
          <thead>
            <tr>
              <th>When</th>
              <th>Type</th>
              <th>Description</th>
              <th className="text-right">Debit</th>
              <th className="text-right">Credit</th>
              <th className="text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {statement.lines.map((line, idx) => (
              <tr key={`${line.at}-${idx}`}>
                <td>{new Date(line.at).toLocaleString('en-IN')}</td>
                <td>{line.kind}</td>
                <td>{line.description}</td>
                <td className="text-right">{line.debitPaise ? formatINR(line.debitPaise) : '—'}</td>
                <td className="text-right">{line.creditPaise ? formatINR(line.creditPaise) : '—'}</td>
                <td className="text-right">{formatINR(line.balancePaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
