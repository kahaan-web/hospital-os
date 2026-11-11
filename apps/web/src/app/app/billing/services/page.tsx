'use client';

import type { ServiceMasterDto } from '@hos/shared';
import { formatINR } from '@hos/shared';
import { Button, DataTable, Field, Input, MoneyInput, PageHeader, Select } from '@hos/ui';
import { useCallback, useEffect, useState } from 'react';
import { billingApi } from '@/features/clinical/billing/api';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { ApiError } from '@/lib/api';

const CATEGORIES = ['consultation', 'procedure', 'lab', 'radiology', 'bed', 'nursing', 'ot', 'package', 'misc'] as const;

export default function ServicesPage() {
  const [rows, setRows] = useState<ServiceMasterDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('misc');
  const [treatment, setTreatment] = useState<'exempt_healthcare' | 'taxable'>('exempt_healthcare');
  const [rate, setRate] = useState('0');
  const [price, setPrice] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    billingApi
      .services()
      .then((items) => {
        setRows(items);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && rows.length === 0) return <PageLoading />;
  if (error && rows.length === 0) return <PageError error={error} onRetry={load} />;

  return (
    <>
      <PageHeader title="Services and tariffs" description="GST rates are configuration. Confirm with your CA." />
      <form
        className="mb-6 grid max-w-xl gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setNotice(null);
          const gstRateBp = treatment === 'exempt_healthcare' ? 0 : Math.round(Number(rate) * 100);
          billingApi
            .createService({ code: code.toUpperCase(), name, category, gstTreatment: treatment, gstRateBp, hsnSac: '9993' })
            .then(async (service) => {
              if (price != null) {
                const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
                await billingApi.createTariff({ serviceId: service.id, pricePaise: price, effectiveFrom: day, payerClass: 'general' });
              }
              setNotice(`${service.code} saved.`);
              setCode('');
              setName('');
              setPrice(null);
              load();
            })
            .catch((err: unknown) => setNotice(err instanceof ApiError ? err.message : 'Could not save the service'))
            .finally(() => setBusy(false));
        }}
      >
        <Field label="Code" htmlFor="service-code">
          <Input id="service-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required minLength={2} maxLength={20} />
        </Field>
        <Field label="Name" htmlFor="service-name">
          <Input id="service-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
        </Field>
        <Field label="Category" htmlFor="service-category">
          <Select id="service-category" value={category} onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}>
            {CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="GST treatment" htmlFor="service-gst" hint="Exempt healthcare stays at 0%. Confirm any other rate with your CA.">
          <Select id="service-gst" value={treatment} onChange={(e) => setTreatment(e.target.value as 'exempt_healthcare' | 'taxable')}>
            <option value="exempt_healthcare">Exempt healthcare</option>
            <option value="taxable">Taxable</option>
          </Select>
        </Field>
        {treatment === 'taxable' ? (
          <Field label="GST %" htmlFor="service-rate">
            <Input id="service-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
          </Field>
        ) : null}
        <Field label="Price from today" htmlFor="service-price" hint="Optional. Leave blank to add the service without a tariff.">
          <MoneyInput id="service-price" valuePaise={price} onChangePaise={setPrice} />
        </Field>
        <Button type="submit" disabled={busy}>
          Save service
        </Button>
        {notice ? <p role="status">{notice}</p> : null}
      </form>
      <DataTable
        data={rows}
        getRowId={(row) => row.id}
        emptyMessage="No services yet."
        columns={[
          { id: 'code', header: 'Code', accessor: (row) => row.code },
          { id: 'name', header: 'Name', accessor: (row) => row.name },
          { id: 'category', header: 'Category', accessor: (row) => row.category },
          { id: 'gst', header: 'GST', accessor: (row) => (row.gstRateBp === 0 ? 'Exempt' : `${row.gstRateBp / 100}%`) },
          { id: 'price', header: 'Current price', accessor: (row) => {
            const latest = row.tariffs[row.tariffs.length - 1];
            return latest ? formatINR(latest.pricePaise) : '—';
          } },
          { id: 'active', header: 'Active', accessor: (row) => (row.active ? 'Yes' : 'No') },
        ]}
      />
    </>
  );
}
