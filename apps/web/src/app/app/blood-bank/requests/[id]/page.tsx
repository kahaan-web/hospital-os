'use client';

import { createTranslator, formatDate, formatDateTime } from '@hos/shared';
import { Badge, Button, DataTable, EmptyState, Field, Input, PageHeader } from '@hos/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { bloodBankApi, COMPONENT_LABEL, type BbRequestDetail } from '@/features/clinical/mvp/api';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { ApiError } from '@/lib/api';

const t = createTranslator('en');
const group = (abo: string, rh: string) => `${abo} ${rh === 'pos' ? '+' : '−'}`;

export default function BloodRequestPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<BbRequestDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [formError, setFormError] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    bloodBankApi.request(id).then(setDetail).catch(setError);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const issue = async (unitId: string) => {
    setBusy(true);
    setFormError('');
    try {
      await bloodBankApi.issue(id, { unitId, receivedBy: receivedBy.trim() });
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not issue the unit');
    } finally {
      setBusy(false);
    }
  };

  if (error && !detail) return <PageError error={error} onRetry={load} />;
  if (!detail) return <PageLoading label="Loading request…" />;
  const { request, patient, candidates } = detail;
  const open = request.status === 'open';

  return (
    <>
      <PageHeader
        title={`${COMPONENT_LABEL[request.component]} for ${patient?.name ?? 'patient'}`}
        description={`${patient?.uhid ?? ''} · patient group ${group(request.patientAbo, request.patientRh)} · ${request.urgency}`}
        actions={
          <Link href="/app/blood-bank" className="hos-link">
            {t('clinical.bloodBank.nav')}
          </Link>
        }
      />
      {request.indication ? <p className="mb-3 text-sm">{`Indication: ${request.indication}`}</p> : null}
      {!open ? (
        <p className="mb-4 text-sm">
          <Badge tone="success">{request.status}</Badge>
          {request.issuedAt ? ` ${formatDateTime(request.issuedAt)}, received by ${request.receivedBy}` : null}
        </p>
      ) : null}
      {formError ? (
        <p role="alert" className="mb-3 text-sm" style={{ color: 'var(--hos-fg-danger)' }}>
          {formError}
        </p>
      ) : null}
      {open ? (
        <>
          <div className="mb-4 max-w-sm">
            <Field label="Received by (nurse)" required hint="Name of the nurse collecting the unit.">
              <Input value={receivedBy} onChange={(event) => setReceivedBy(event.target.value)} required minLength={2} />
            </Field>
          </div>
          {candidates.length === 0 ? (
            <EmptyState title="No units of this component in stock" />
          ) : (
            <DataTable
              data={candidates}
              getRowId={(row) => row.id}
              pageSize={10}
              emptyMessage="No units"
              columns={[
                { id: 'unit', header: 'Unit no.', accessor: (row) => row.unitNo },
                { id: 'group', header: 'Group', accessor: (row) => group(row.abo, row.rh) },
                { id: 'expiry', header: 'Expires', accessor: (row) => row.expiresAt, render: (row) => formatDate(row.expiresAt) },
                { id: 'tti', header: 'TTI', accessor: (row) => (row.ttiCleared ? 'Cleared' : 'Not cleared') },
                {
                  id: 'fit',
                  header: 'Fit for this patient',
                  accessor: (row) => (row.issuable ? 'Yes' : 'No'),
                  render: (row) => <Badge tone={row.issuable ? 'success' : 'error'}>{row.issuable ? 'Compatible' : 'Blocked'}</Badge>,
                },
                {
                  id: 'issue',
                  header: '',
                  accessor: () => '',
                  render: (row) => (
                    <Button
                      size="sm"
                      disabled={!row.issuable || receivedBy.trim().length < 2}
                      loading={busy}
                      onClick={() => void issue(row.id)}
                      aria-label={`Issue unit ${row.unitNo}`}
                    >
                      Issue
                    </Button>
                  ),
                },
              ]}
            />
          )}
        </>
      ) : null}
    </>
  );
}
