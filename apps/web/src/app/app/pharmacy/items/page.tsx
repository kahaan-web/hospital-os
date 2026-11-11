'use client';

import type { PharmacySchedule } from '@hos/shared';
import { PHARMACY_SCHEDULES } from '@hos/shared';
import { Button, DataTable, Field, Input, PageHeader, Select } from '@hos/ui';
import { useCallback, useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { pharmacyApi } from '@/features/clinical/pharmacy/api';
import { GstNote, PharmacyNav } from '@/features/clinical/pharmacy/PharmacyNav';

export default function ItemsPage() {
  const [items, setItems] = useState<Awaited<ReturnType<typeof pharmacyApi.items>>>([]);
  const [suppliers, setSuppliers] = useState<Awaited<ReturnType<typeof pharmacyApi.suppliers>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [brand, setBrand] = useState('');
  const [genericCode, setGenericCode] = useState('');
  const [form, setForm] = useState('tablet');
  const [strength, setStrength] = useState('');
  const [hsn, setHsn] = useState('30049099');
  const [gst, setGst] = useState('12');
  const [schedule, setSchedule] = useState<PharmacySchedule>('OTC');
  const [supplierName, setSupplierName] = useState('');
  const [supplierCity, setSupplierCity] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([pharmacyApi.items(), pharmacyApi.suppliers()])
      .then(([itemRows, supplierRows]) => {
        setItems(itemRows);
        setSuppliers(supplierRows);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await pharmacyApi.createItem({
        brand,
        genericCode,
        form,
        strength,
        hsn,
        gstRateBp: Math.round(Number(gst) * 100),
        reorderLevel: 0,
        schedule,
      });
      setBrand('');
      setGenericCode('');
      setMessage('Item saved.');
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not save the item');
    } finally {
      setBusy(false);
    }
  }

  async function addSupplier(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await pharmacyApi.createSupplier({ name: supplierName, city: supplierCity, phone: '', gstin: '' });
      setSupplierName('');
      setSupplierCity('');
      setMessage('Supplier saved.');
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not save the supplier');
    } finally {
      setBusy(false);
    }
  }

  if (loading && items.length === 0) return <PageLoading label="Loading items" />;
  if (error) return <PageError error={error} onRetry={load} />;

  return (
    <>
      <PharmacyNav />
      <PageHeader title="Item master" description="Generic, brand, HSN and the GST rate used when the MRP is split." />
      <DataTable
        data={items}
        getRowId={(row) => row.id}
        emptyMessage="No items yet."
        columns={[
          { id: 'brand', header: 'Brand', accessor: (row) => row.brand },
          { id: 'generic', header: 'Generic', accessor: (row) => row.genericCode },
          { id: 'form', header: 'Form', accessor: (row) => `${row.form} ${row.strength}`.trim() },
          { id: 'hsn', header: 'HSN', accessor: (row) => row.hsn },
          { id: 'gst', header: 'GST', accessor: (row) => `${row.gstRateBp / 100}%` },
          { id: 'schedule', header: 'Schedule', accessor: (row) => row.schedule },
        ]}
      />
      <form onSubmit={addItem} style={{ display: 'grid', gap: '0.75rem', maxWidth: '36rem', marginTop: '1.5rem' }}>
        <h2>New item</h2>
        <Field label="Brand" htmlFor="brand">
          <Input id="brand" value={brand} onChange={(e) => setBrand(e.target.value)} required />
        </Field>
        <Field label="Generic code" htmlFor="generic">
          <Input id="generic" value={genericCode} onChange={(e) => setGenericCode(e.target.value)} required />
        </Field>
        <Field label="Form" htmlFor="form">
          <Input id="form" value={form} onChange={(e) => setForm(e.target.value)} required />
        </Field>
        <Field label="Strength" htmlFor="strength">
          <Input id="strength" value={strength} onChange={(e) => setStrength(e.target.value)} />
        </Field>
        <Field label="HSN" htmlFor="hsn">
          <Input id="hsn" value={hsn} onChange={(e) => setHsn(e.target.value)} required minLength={4} maxLength={8} />
        </Field>
        <Field label="GST %" htmlFor="gst" hint="Basis points are stored. 12 means 12%.">
          <Input id="gst" inputMode="decimal" value={gst} onChange={(e) => setGst(e.target.value)} required />
        </Field>
        <Field label="Schedule" htmlFor="schedule">
          <Select id="schedule" value={schedule} onChange={(e) => setSchedule(e.target.value as PharmacySchedule)}>
            {PHARMACY_SCHEDULES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" loading={busy}>
          Save item
        </Button>
      </form>
      <DataTable
        data={suppliers}
        getRowId={(row) => row.id}
        emptyMessage="No suppliers yet."
        columns={[
          { id: 'name', header: 'Supplier', accessor: (row) => row.name },
          { id: 'city', header: 'City', accessor: (row) => row.city || '—' },
          { id: 'phone', header: 'Phone', accessor: (row) => row.phone || '—' },
        ]}
      />
      <form onSubmit={addSupplier} style={{ display: 'grid', gap: '0.75rem', maxWidth: '36rem', marginTop: '1.5rem' }}>
        <h2>New supplier</h2>
        <Field label="Name" htmlFor="supplier-name">
          <Input id="supplier-name" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} required minLength={2} />
        </Field>
        <Field label="City" htmlFor="supplier-city">
          <Input id="supplier-city" value={supplierCity} onChange={(e) => setSupplierCity(e.target.value)} />
        </Field>
        <Button type="submit" variant="secondary" loading={busy}>
          Save supplier
        </Button>
        {message ? <p role="status">{message}</p> : null}
      </form>
      <GstNote />
    </>
  );
}
