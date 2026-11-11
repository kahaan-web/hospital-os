'use client';

import type { PatientSummaryDto, PharmacyItemDto, PharmacySaleDto } from '@hos/shared';
import { formatINR } from '@hos/shared';
import { Button, Field, Input, PageHeader, Select } from '@hos/ui';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { PatientPicker } from '@/features/clinical/common/PatientPicker';
import { PrintPreview } from '@/features/clinical/common/PrintPreview';
import { pharmacyApi } from '@/features/clinical/pharmacy/api';
import { GstNote, PharmacyNav } from '@/features/clinical/pharmacy/PharmacyNav';

function SaleForm() {
  const params = useSearchParams();
  const [items, setItems] = useState<PharmacyItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [kind, setKind] = useState<'op' | 'outside'>(params.get('patientId') ? 'op' : 'outside');
  const [patient, setPatient] = useState<PatientSummaryDto | null>(null);
  const [walkinName, setWalkinName] = useState('');
  const [mode, setMode] = useState<'cash' | 'upi' | 'card' | 'cheque' | 'neft'>('cash');
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState(params.get('qty') || '1');
  const [sale, setSale] = useState<PharmacySaleDto | null>(null);
  const [html, setHtml] = useState('');

  useEffect(() => {
    pharmacyApi
      .items()
      .then((rows) => {
        const active = rows.filter((row) => row.active);
        setItems(active);
        const generic = (params.get('generic') ?? '').toUpperCase();
        const match = active.find((row) => row.genericCode.toUpperCase() === generic);
        setItemId(match?.id ?? active[0]?.id ?? '');
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [params]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const created = await pharmacyApi.sale({
        kind,
        mode,
        patientId: kind === 'op' ? patient?.id : undefined,
        encounterId: kind === 'op' ? params.get('encounterId') ?? undefined : undefined,
        walkinName: kind === 'outside' ? walkinName : undefined,
        lines: [{ itemId, qty: Number(qty), orderItemId: params.get('orderItemId') ?? undefined }],
      });
      setSale(created);
      setHtml(await pharmacyApi.printHtml(created.id));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not complete the sale');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <PageLoading label="Loading items" />;
  if (error) return <PageError error={error} />;

  return (
    <>
      <PharmacyNav />
      <PageHeader title="Counter sale" description="OP issues and outside sales. MRP includes GST." />
      <form onSubmit={submit} style={{ display: 'grid', gap: '0.75rem', maxWidth: '36rem' }}>
        <Field label="Kind" htmlFor="sale-kind">
          <Select id="sale-kind" value={kind} onChange={(e) => setKind(e.target.value as 'op' | 'outside')}>
            <option value="op">OP patient</option>
            <option value="outside">Outside sale</option>
          </Select>
        </Field>
        {kind === 'op' ? (
          <Field label="Patient">
            <PatientPicker onValueChange={setPatient} />
            {patient ? <p>{patient.fullName} · {patient.uhid}</p> : null}
          </Field>
        ) : (
          <Field label="Buyer name" htmlFor="walkin">
            <Input id="walkin" value={walkinName} onChange={(e) => setWalkinName(e.target.value)} required maxLength={80} />
          </Field>
        )}
        <Field label="Payment" htmlFor="mode">
          <Select id="mode" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="card">Card</option>
            <option value="cheque">Cheque</option>
            <option value="neft">NEFT</option>
          </Select>
        </Field>
        <Field label="Item" htmlFor="item">
          <Select id="item" value={itemId} onChange={(e) => setItemId(e.target.value)} required>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.brand} · {item.strength} · {item.genericCode}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Quantity" htmlFor="qty">
          <Input id="qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} required />
        </Field>
        <Button type="submit" loading={busy} disabled={!itemId}>
          Take payment and dispense
        </Button>
        {message ? <p role="alert">{message}</p> : null}
      </form>
      <GstNote />
      {sale ? (
        <section style={{ marginTop: '1.5rem' }}>
          <h2>{sale.number}</h2>
          <p>
            Taxable {formatINR(sale.taxablePaise)} · Tax {formatINR(sale.taxPaise)} · Total {formatINR(sale.totalPaise)}
          </p>
          {html ? <PrintPreview html={html} onDownload={() => window.open(pharmacyApi.printPdfUrl(sale.id), '_blank', 'noopener')} /> : null}
        </section>
      ) : null}
    </>
  );
}

export default function NewSalePage() {
  return (
    <Suspense fallback={<PageLoading label="Loading the sale" />}>
      <SaleForm />
    </Suspense>
  );
}
