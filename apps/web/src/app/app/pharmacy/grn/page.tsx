'use client';

import type { PharmacyItemDto, PharmacySupplierDto } from '@hos/shared';
import { formatINR } from '@hos/shared';
import { Button, Field, Input, MoneyInput, PageHeader, Select } from '@hos/ui';
import { useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { pharmacyApi } from '@/features/clinical/pharmacy/api';
import { GstNote, PharmacyNav } from '@/features/clinical/pharmacy/PharmacyNav';

export default function GrnPage() {
  const [items, setItems] = useState<PharmacyItemDto[]>([]);
  const [suppliers, setSuppliers] = useState<PharmacySupplierDto[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [itemId, setItemId] = useState('');
  const [batchNo, setBatchNo] = useState('');
  const [expiry, setExpiry] = useState('2027-08-31');
  const [qty, setQty] = useState('1');
  const [mrp, setMrp] = useState<number | null>(11200);
  const [rate, setRate] = useState<number | null>(8000);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    Promise.all([pharmacyApi.items(), pharmacyApi.suppliers()])
      .then(([itemRows, supplierRows]) => {
        setItems(itemRows.filter((row) => row.active));
        setSuppliers(supplierRows.filter((row) => row.active));
        setItemId(itemRows[0]?.id ?? '');
        setSupplierId(supplierRows[0]?.id ?? '');
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mrp == null || rate == null) return;
    setBusy(true);
    setMessage('');
    try {
      const created = await pharmacyApi.receive({
        supplierId,
        lines: [{ itemId, batchNo, expiry, qty: Number(qty), mrpPaise: mrp, purchaseRatePaise: rate }],
      });
      setMessage(`Received ${created.number} · ${formatINR(created.totalPaise)} including purchase GST.`);
      setBatchNo('');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not receive stock');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <PageLoading label="Loading masters" />;
  if (error) return <PageError error={error} />;

  return (
    <>
      <PharmacyNav />
      <PageHeader title="Goods receipt" description="Purchase rate is exclusive of GST. A batch keeps the first MRP and expiry." />
      <form onSubmit={submit} style={{ display: 'grid', gap: '0.75rem', maxWidth: '36rem' }}>
        <Field label="Supplier" htmlFor="supplier">
          <Select id="supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
            {suppliers.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Item" htmlFor="grn-item">
          <Select id="grn-item" value={itemId} onChange={(e) => setItemId(e.target.value)} required>
            {items.map((row) => (
              <option key={row.id} value={row.id}>
                {row.brand} · {row.strength}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Batch" htmlFor="batch">
          <Input id="batch" value={batchNo} onChange={(e) => setBatchNo(e.target.value)} required maxLength={40} />
        </Field>
        <Field label="Expiry" htmlFor="expiry">
          <Input id="expiry" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} required />
        </Field>
        <Field label="Quantity" htmlFor="grn-qty">
          <Input id="grn-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} required />
        </Field>
        <Field label="MRP" htmlFor="mrp">
          <MoneyInput id="mrp" valuePaise={mrp} onChangePaise={setMrp} required />
        </Field>
        <Field label="Purchase rate (excl. GST)" htmlFor="rate">
          <MoneyInput id="rate" valuePaise={rate} onChangePaise={setRate} required />
        </Field>
        <Button type="submit" loading={busy} disabled={!supplierId || !itemId}>
          Receive
        </Button>
        {message ? <p role="status">{message}</p> : null}
      </form>
      <GstNote />
    </>
  );
}
