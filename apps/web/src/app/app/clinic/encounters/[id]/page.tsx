'use client';

import type { CasePaperInput, PatientAlertDto, PatientSummaryDto } from '@hos/shared';
import { Button, Input, PageHeader, Textarea } from '@hos/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { PatientBanner } from '@/features/clinical/common/PatientBanner';
import { doctorApi } from '@/features/clinical/doctor/api';
import { OrderEntryPanel } from '@/features/clinical/orders/OrderEntryPanel';
import { PrescriptionEditor } from '@/features/clinical/orders/PrescriptionEditor';

export default function ClinicEncounterPage() {
  const params = useParams<{ id: string }>();
  const encounterId = params.id;
  const [form, setForm] = useState<CasePaperInput>({
    chiefComplaint: '',
    history: '',
    examination: '',
    diagnoses: [],
    advice: '',
  });
  const [bannerPatient, setBannerPatient] = useState<PatientSummaryDto | null>(null);
  const [bannerAlerts, setBannerAlerts] = useState<PatientAlertDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    doctorApi
      .casePaper(encounterId)
      .then((paper) => {
        setForm({
          chiefComplaint: paper.chiefComplaint,
          history: paper.history,
          examination: paper.examination,
          diagnoses: paper.diagnoses,
          advice: paper.advice,
        });
        setBannerPatient(paper.patient);
        setBannerAlerts(paper.alerts);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [encounterId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <PageLoading />;
  if (error) return <PageError error={error} onRetry={load} />;

  const savePaper = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await doctorApi.saveCasePaper(encounterId, form);
      setMessage('Case paper saved.');
      load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Case paper"
        description={bannerPatient?.fullName ?? ''}
        actions={
          <Link href="/app/clinic">
            <Button type="button" variant="secondary">
              Back to queue
            </Button>
          </Link>
        }
      />
      {bannerPatient ? <PatientBanner patient={bannerPatient} alerts={bannerAlerts} /> : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <Textarea
            value={form.chiefComplaint ?? ''}
            onChange={(e) => setForm({ ...form, chiefComplaint: e.target.value })}
            rows={3}
            aria-label="Chief complaint"
            placeholder="Chief complaint"
          />
          <Textarea value={form.history ?? ''} onChange={(e) => setForm({ ...form, history: e.target.value })} rows={4} aria-label="History" placeholder="History" />
          <Textarea
            value={form.examination ?? ''}
            onChange={(e) => setForm({ ...form, examination: e.target.value })}
            rows={4}
            aria-label="Examination"
            placeholder="Examination"
          />
          <Input
            value={form.diagnoses?.[0]?.code ?? ''}
            onChange={(e) =>
              setForm({
                ...form,
                diagnoses: [{ code: e.target.value, codeDisplay: form.diagnoses?.[0]?.codeDisplay ?? e.target.value }],
              })
            }
            aria-label="ICD-10 code"
            placeholder="ICD-10 code"
          />
          <Input
            value={form.diagnoses?.[0]?.codeDisplay ?? ''}
            onChange={(e) =>
              setForm({
                ...form,
                diagnoses: [{ code: form.diagnoses?.[0]?.code ?? '', codeDisplay: e.target.value }],
              })
            }
            aria-label="Diagnosis"
            placeholder="Diagnosis text"
          />
          <Textarea value={form.advice ?? ''} onChange={(e) => setForm({ ...form, advice: e.target.value })} rows={3} aria-label="Advice" placeholder="Advice" />
          <Button type="button" onClick={() => void savePaper()} disabled={saving}>
            Save case paper
          </Button>
          {message ? <p className="text-sm text-[var(--hos-muted)]">{message}</p> : null}
          <div className="flex gap-3 text-sm">
            <a className="hos-link" href={doctorApi.printUrl(encounterId, 'case-paper', 'pdf')}>
              Case paper PDF
            </a>
            <a className="hos-link" href={doctorApi.printUrl(encounterId, 'case-paper', 'html')} target="_blank" rel="noreferrer">
              HTML preview
            </a>
          </div>
        </section>
        <section className="space-y-6">
          <div>
            <h2 className="mb-2 text-sm font-semibold">Prescription</h2>
            <PrescriptionEditor
              busy={saving}
              onSubmit={async (body) => {
                setSaving(true);
                try {
                  await doctorApi.prescribe(encounterId, body);
                  setMessage('Prescription saved.');
                } finally {
                  setSaving(false);
                }
              }}
            />
            <div className="flex gap-3 text-sm">
              <a className="hos-link" href={doctorApi.printUrl(encounterId, 'prescription', 'pdf')}>
                Prescription PDF
              </a>
            </div>
          </div>
          <OrderEntryPanel encounterId={encounterId} onPlaced={load} />
        </section>
      </div>
    </>
  );
}
