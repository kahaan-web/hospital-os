'use client';

import type { LabAccessionDetailDto, LabResultLineDto } from '@hos/shared';
import { formatDateTime } from '@hos/shared';
import { Badge, Button, Field, Input, PageHeader, Select } from '@hos/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { PrintPreview } from '@/features/clinical/common/PrintPreview';
import { LabNav } from '@/features/clinical/lab/LabNav';
import { labApi } from '@/features/clinical/lab/api';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { ApiError } from '@/lib/api';

function draftOf(line: LabResultLineDto): string {
  if (line.valueType === 'numeric') return line.valueNum == null ? '' : String(line.valueNum);
  return line.valueText ?? '';
}

export default function AccessionPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [row, setRow] = useState<LabAccessionDetailDto | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [amendReason, setAmendReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [html, setHtml] = useState('');
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(() => {
    setError(null);
    return labApi
      .accession(id)
      .then((detail) => {
        setRow(detail);
        setDrafts(Object.fromEntries(detail.lines.map((line) => [line.paramId, draftOf(line)])));
      })
      .catch(setError);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<LabAccessionDetailDto>) => {
    setBusy(true);
    setFormError('');
    try {
      const detail = await fn();
      setRow(detail);
      setDrafts(Object.fromEntries(detail.lines.map((line) => [line.paramId, draftOf(line)])));
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'That did not save');
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!row) return;
    const values = row.lines
      .map((line) => {
        const raw = (drafts[line.paramId] ?? '').trim();
        if (!raw) return null;
        if (line.valueType === 'numeric') return { paramId: line.paramId, valueNum: Number(raw), valueText: null };
        return { paramId: line.paramId, valueNum: null, valueText: raw };
      })
      .filter((value): value is NonNullable<typeof value> => value != null);
    if (values.length === 0) {
      setFormError('Enter at least one result');
      return;
    }
    void run(() => labApi.saveResults(id, values, row.immutable ? amendReason.trim() : undefined));
  };

  if (!row && !error) return <PageLoading label="Loading the accession…" />;
  if (error || !row) return <PageError error={error} onRetry={() => void load()} />;

  return (
    <>
      <PageHeader
        title={row.number}
        description={`${row.testName} · ${row.patientName} · ${row.uhid}`}
        actions={
          <Link href="/app/lab" className="hos-link">
            Back to worklist
          </Link>
        }
      />
      <LabNav />
      <p className="mb-4 text-sm" style={{ color: 'var(--hos-fg-muted)' }}>
        {row.sex}
        {row.ageLabel ? ` · ${row.ageLabel}` : ''} · {row.specimen}
        {row.collectedAt ? ` · collected ${formatDateTime(row.collectedAt)}` : ''}
        {' · '}
        <Badge tone={row.status === 'rejected' ? 'error' : row.status === 'verified' || row.status === 'reported' ? 'success' : 'info'}>{row.status}</Badge>
        {row.immutable ? ` · version ${row.version} is verified` : ` · version ${row.version}`}
      </p>
      {row.rejectReason ? (
        <p role="status" className="mb-4 text-sm" style={{ color: 'var(--hos-fg-danger)' }}>
          Rejected: {row.rejectReason}
        </p>
      ) : null}
      {formError ? (
        <p role="alert" className="mb-3 text-sm" style={{ color: 'var(--hos-fg-danger)' }}>
          {formError}
        </p>
      ) : null}
      <div className="mb-4 flex flex-wrap gap-2">
        {row.status === 'collected' || row.status === 'ordered' ? (
          <Button type="button" disabled={busy} onClick={() => void run(() => labApi.receive(id))}>
            Receive in lab
          </Button>
        ) : null}
        {row.status !== 'verified' && row.status !== 'reported' && row.status !== 'rejected' ? (
          <Button type="button" variant="secondary" disabled={busy} onClick={() => setRejecting((open) => !open)}>
            Reject sample
          </Button>
        ) : null}
      </div>
      {rejecting ? (
        <form
          className="mb-4 flex max-w-xl flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => labApi.reject(id, reason.trim()));
          }}
        >
          <Field label="Reason for rejection" required className="min-w-[16rem] flex-1">
            <Input value={reason} onChange={(event) => setReason(event.target.value)} required minLength={2} />
          </Field>
          <Button type="submit" variant="danger" disabled={busy}>
            Confirm rejection
          </Button>
        </form>
      ) : null}
      {row.lines.length === 0 ? (
        <p className="text-sm">This test has no parameter template yet. Add one under Test master before entering results.</p>
      ) : (
        <div className="max-w-3xl">
          {row.lines.map((line) => (
            <div key={line.paramId} className="mb-4 grid gap-2 border-b pb-4 md:grid-cols-[1fr_12rem]" style={{ borderColor: 'var(--hos-border)' }}>
              <Field
                label={line.name}
                hint={
                  <span>
                    {line.rangeLabel}
                    {line.criticalLow != null ? ` · Critical below ${line.criticalLow}` : ''}
                    {line.criticalHigh != null ? ` · Critical above ${line.criticalHigh}` : ''}
                    {line.unit ? ` · ${line.unit}` : ''}
                  </span>
                }
              >
                {line.valueType === 'coded' ? (
                  <Select
                    aria-label={line.name}
                    value={drafts[line.paramId] ?? ''}
                    onChange={(event) => setDrafts((current) => ({ ...current, [line.paramId]: event.target.value }))}
                  >
                    <option value="">Select</option>
                    {line.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    aria-label={line.name}
                    inputMode={line.valueType === 'numeric' ? 'decimal' : 'text'}
                    value={drafts[line.paramId] ?? ''}
                    onChange={(event) => setDrafts((current) => ({ ...current, [line.paramId]: event.target.value }))}
                  />
                )}
              </Field>
              <div className="self-center text-sm">
                {line.flag ? (
                  <span style={line.critical ? { color: 'var(--hos-fg-danger)', fontWeight: 600 } : undefined}>
                    <Badge tone={line.critical ? 'error' : line.flag === 'N' ? 'success' : 'warning'}>{line.flagLabel}</Badge>
                  </span>
                ) : (
                  <span style={{ color: 'var(--hos-fg-muted)' }}>Not entered</span>
                )}
              </div>
            </div>
          ))}
          {row.immutable ? (
            <Field label="Reason for amendment" hint="Verified values stay on file. This files the next version." required>
              <Input value={amendReason} onChange={(event) => setAmendReason(event.target.value)} minLength={2} />
            </Field>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" disabled={busy || row.status === 'rejected'} onClick={save}>
              Save results
            </Button>
            {row.status === 'resulted' && !row.immutable ? (
              <Button type="button" variant="secondary" disabled={busy} onClick={() => void run(() => labApi.verify(id))}>
                Verify results
              </Button>
            ) : null}
          </div>
          <p className="mt-2 text-sm" style={{ color: 'var(--hos-fg-muted)' }}>
            Verified results cannot be edited. An amendment becomes the next version and is audited.
          </p>
        </div>
      )}
      <div className="mt-8 max-w-3xl">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setDownloading(true);
            labApi
              .reportHtml(id)
              .then(setHtml)
              .catch((err: unknown) => setFormError(err instanceof ApiError ? err.message : 'Could not preview the report'))
              .finally(() => setDownloading(false));
          }}
        >
          Preview report
        </Button>
        {html ? (
          <div className="mt-3">
            <PrintPreview
              html={html}
              downloading={downloading}
              onDownload={() => {
                setDownloading(true);
                labApi
                  .reportPdf(id)
                  .then((blob) => {
                    const url = URL.createObjectURL(blob);
                    const anchor = document.createElement('a');
                    anchor.href = url;
                    anchor.download = `${row.number.replaceAll('/', '-')}.pdf`;
                    anchor.click();
                    URL.revokeObjectURL(url);
                  })
                  .catch((err: unknown) => setFormError(err instanceof ApiError ? err.message : 'Could not download the PDF'))
                  .finally(() => setDownloading(false));
              }}
            />
          </div>
        ) : null}
      </div>
    </>
  );
}
