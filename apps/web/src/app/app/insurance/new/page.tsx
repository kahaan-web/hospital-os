'use client';

import { Button, Field, Input, MoneyInput, PageHeader, Select, Textarea } from '@hos/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { InsuranceNav } from '@/features/clinical/insurance/InsuranceNav';
import { insuranceApi, type PayerRow } from '@/features/clinical/insurance/api';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { ApiError } from '@/lib/api';

export default function NewInsuranceRequestPage() {
  const router = useRouter();
  const [payers, setPayers] = useState<PayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [payerId, setPayerId] = useState('');
  const [kind, setKind] = useState<'preauth' | 'claim'>('preauth');
  const [patientName, setPatientName] = useState('');
  const [uhid, setUhid] = useState('');
  const [policyNo, setPolicyNo] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [estimatePaise, setEstimatePaise] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    insuranceApi
      .payers()
      .then((rows) => setPayers(rows.filter((p) => p.active)))
      .catch(setLoadError)
      .finally(() => setLoading(false));
  }, []);

  const submit = async () => {
    setBusy(true);
    setFormError('');
    try {
      const created = await insuranceApi.createRequest({
        payerId,
        kind,
        patientName: patientName.trim(),
        uhid: uhid.trim(),
        policyNo: policyNo.trim(),
        diagnosis: diagnosis.trim(),
        estimatedPaise: estimatePaise ?? 0,
      });
      router.push(`/app/insurance/${created.id}`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save the request');
      setBusy(false);
    }
  };

  if (loading) return <PageLoading label="Loading payers…" />;
  if (loadError) return <PageError error={loadError} onRetry={() => router.refresh()} />;

  return (
    <>
      <PageHeader title="New request" description="Record a pre-authorisation or claim. It starts as submitted, awaiting the payer's decision." />
      <InsuranceNav />
      {formError ? (
        <p role="alert" className="mb-3 text-sm" style={{ color: 'var(--hos-fg-danger)' }}>
          {formError}
        </p>
      ) : null}
      <form
        className="grid max-w-3xl gap-3 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field label="Payer" required hint={payers.length === 0 ? 'Add a payer first.' : undefined}>
          <Select value={payerId} onChange={(event) => setPayerId(event.target.value)} required>
            <option value="">Select a payer</option>
            {payers.map((payer) => (
              <option key={payer.id} value={payer.id}>
                {payer.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Request type" required>
          <Select value={kind} onChange={(event) => setKind(event.target.value as 'preauth' | 'claim')}>
            <option value="preauth">Pre-authorisation</option>
            <option value="claim">Claim</option>
          </Select>
        </Field>
        <Field label="Patient name" required>
          <Input value={patientName} onChange={(event) => setPatientName(event.target.value)} required minLength={2} />
        </Field>
        <Field label="UHID">
          <Input value={uhid} onChange={(event) => setUhid(event.target.value)} />
        </Field>
        <Field label="Policy number">
          <Input value={policyNo} onChange={(event) => setPolicyNo(event.target.value)} />
        </Field>
        <Field label="Estimated cost (₹)" required>
          <MoneyInput valuePaise={estimatePaise} onChangePaise={setEstimatePaise} required />
        </Field>
        <div className="md:col-span-2">
          <Field label="Diagnosis and planned procedure">
            <Textarea value={diagnosis} onChange={(event) => setDiagnosis(event.target.value)} rows={3} />
          </Field>
        </div>
        <div>
          <Button type="submit" disabled={busy || !payerId || estimatePaise == null}>
            Save request
          </Button>
        </div>
      </form>
    </>
  );
}
