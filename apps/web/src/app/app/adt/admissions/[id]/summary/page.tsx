'use client';

import { createTranslator, type DischargeSummarySections } from '@hos/shared';
import { Button, Field, PageHeader, Textarea } from '@hos/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { adtApi } from '@/features/clinical/adt/api';
import { AdtLinks } from '@/features/clinical/adt/links';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { ApiError } from '@/lib/api';

const t = createTranslator('en');

const EMPTY: DischargeSummarySections = {
  diagnosis: '',
  course: '',
  treatment: '',
  condition: '',
  advice: '',
  followUp: '',
};

export default function SummaryPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [sections, setSections] = useState<DischargeSummarySections>(EMPTY);
  const [status, setStatus] = useState<'draft' | 'final' | 'missing'>('missing');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [html, setHtml] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setDenied(false);
    adtApi
      .summary(id)
      .then((row) => {
        setSections(row.sections);
        setStatus(row.status);
        setError(null);
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 404) {
          setSections(EMPTY);
          setStatus('missing');
          setError(null);
          return;
        }
        if (e instanceof ApiError && e.code === 'not_entitled') {
          setDenied(true);
          setError(null);
          return;
        }
        setError(e);
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const setField = (key: keyof DischargeSummarySections, value: string) => {
    setSections((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    setBusy(true);
    setMessage('');
    try {
      const row = await adtApi.saveSummary(id, sections);
      setStatus(row.status);
      setMessage('Draft saved');
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const finalise = async () => {
    setBusy(true);
    setMessage('');
    try {
      const row = await adtApi.finaliseSummary(id);
      setStatus(row.status);
      setSections(row.sections);
      setMessage('Summary finalised');
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : 'Could not finalise');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PageLoading label="Loading the discharge summary" />;
  if (error) return <PageError error={error} onRetry={load} />;

  return (
    <>
      <AdtLinks current="/app/adt/admissions/[id]/summary" />
      <PageHeader
        title={t('clinical.adt.summary')}
        description={
          denied ? t('clinical.adt.notEntitled') : status === 'final' ? t('clinical.adt.summaryFinal') : status === 'draft' ? t('clinical.adt.draft') : t('clinical.adt.summaryMissing')
        }
        actions={
          <Link href={`/app/adt/admissions/${id}`} className="hos-link">
            {t('clinical.adt.admission')}
          </Link>
        }
      />
      {denied ? null : (
        <form
          className="flex max-w-2xl flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          {(
            [
              ['diagnosis', t('clinical.adt.diagnosis')],
              ['course', t('clinical.adt.course')],
              ['treatment', t('clinical.adt.treatmentGiven')],
              ['condition', t('clinical.adt.condition')],
              ['advice', t('clinical.adt.advice')],
              ['followUp', t('clinical.adt.followUp')],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              <Textarea value={sections[key]} disabled={status === 'final'} onChange={(event) => setField(key, event.target.value)} aria-label={label} />
            </Field>
          ))}
          {message ? (
            <p className="text-sm" role="status">
              {message}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" variant="secondary" disabled={busy || status === 'final'}>
              {t('clinical.adt.saveSummary')}
            </Button>
            <Button type="button" disabled={busy || status === 'final'} onClick={() => void finalise()}>
              {t('clinical.adt.finalise')}
            </Button>
          </div>
          {status !== 'missing' ? (
            <div>
              <Button type="button" variant="secondary" onClick={() => void adtApi.preview(id, 'summary').then(setHtml)}>
                Show preview
              </Button>
              {html ? (
                <iframe title="Discharge summary preview" srcDoc={html} style={{ display: 'block', width: '100%', minHeight: 480, marginTop: 8, border: '1px solid var(--hos-border)', background: '#fff' }} />
              ) : null}
            </div>
          ) : null}
        </form>
      )}
    </>
  );
}
