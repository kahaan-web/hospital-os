'use client';

import { formatDateTime } from '@hos/shared';
import { Badge, Button, Field, PageHeader, Textarea, useToast } from '@hos/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { radApi, type RadOrderDetailDto } from '@/features/clinical/radiology/api';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { ApiError } from '@/lib/api';

export default function RadiologyOrderPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [order, setOrder] = useState<RadOrderDetailDto | null>(null);
  const [findings, setFindings] = useState('');
  const [impression, setImpression] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const apply = useCallback((next: RadOrderDetailDto) => {
    setOrder(next);
    setFindings(next.report?.findings ?? '');
    setImpression(next.report?.impression ?? '');
  }, []);

  const load = useCallback(() => {
    radApi.get(id).then(apply).catch(setError);
  }, [id, apply]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast.toast({ tone: 'success', title: done });
      load();
    } catch (err) {
      toast.toast({ tone: 'error', title: err instanceof ApiError ? err.message : 'Could not complete that step' });
    } finally {
      setBusy(false);
    }
  };

  if (error) return <PageError error={error} onRetry={load} />;
  if (!order) return <PageLoading label="Loading the order…" />;

  const signed = order.report?.status === 'final';
  const canReport = order.status === 'done';

  return (
    <>
      <PageHeader
        title={`${order.studyName} · ${order.number}`}
        description={`${order.patientName} · ${order.uhid}`}
        actions={<Badge tone={signed ? 'success' : 'neutral'}>{order.status === 'done' ? 'awaiting report' : order.status.replace('_', ' ')}</Badge>}
      />
      <p className="mb-4 text-sm">
        <Link href="/app/radiology" className="hos-link">
          Back to the worklist
        </Link>
      </p>
      <dl className="mb-6 grid max-w-xl grid-cols-[10rem_1fr] gap-y-1 text-sm">
        <dt>Priority</dt>
        <dd>{order.priority}</dd>
        <dt>Ordering doctor</dt>
        <dd>{order.orderingDoctorName || '—'}</dd>
        <dt>Clinical notes</dt>
        <dd>{order.clinicalNotes || '—'}</dd>
        <dt>Performed</dt>
        <dd>{order.performedAt ? formatDateTime(order.performedAt) : '—'}</dd>
      </dl>

      {order.status === 'ordered' ? (
        <Button type="button" disabled={busy} onClick={() => void run(() => radApi.start(order.id), 'Study started')}>
          Start study
        </Button>
      ) : null}
      {order.status === 'in_progress' ? (
        <Button type="button" disabled={busy} onClick={() => void run(() => radApi.done(order.id), 'Study marked done')}>
          Mark done
        </Button>
      ) : null}

      {canReport || signed ? (
        <form
          className="flex max-w-2xl flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => radApi.saveReport(order.id, { findings, impression }), 'Draft saved');
          }}
        >
          <Field label="Findings">
            <Textarea value={findings} onChange={(event) => setFindings(event.target.value)} rows={8} maxLength={8000} readOnly={signed} aria-label="Findings" />
          </Field>
          <Field label="Impression">
            <Textarea value={impression} onChange={(event) => setImpression(event.target.value)} rows={3} maxLength={2000} readOnly={signed} aria-label="Impression" />
          </Field>
          {signed ? (
            <p className="text-sm">Signed {order.report?.signedAt ? formatDateTime(order.report.signedAt) : ''}. A signed report cannot be edited.</p>
          ) : (
            <div className="flex gap-2">
              <Button type="submit" variant="secondary" disabled={busy}>
                Save draft
              </Button>
              <Button
                type="button"
                disabled={busy || !findings.trim() || !impression.trim()}
                onClick={() =>
                  void run(async () => {
                    await radApi.saveReport(order.id, { findings, impression });
                    await radApi.sign(order.id);
                  }, 'Report signed')
                }
              >
                Sign report
              </Button>
            </div>
          )}
        </form>
      ) : null}
    </>
  );
}
