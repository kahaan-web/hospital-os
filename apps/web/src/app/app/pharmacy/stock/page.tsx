'use client';

import type { PharmacyStockRowDto, PharmacySupplierDto } from '@hos/shared';
import { formatDate, formatINR } from '@hos/shared';
import { Badge, Button, DataTable, Field, Input, PageHeader, Select } from '@hos/ui';
import { useCallback, useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { pharmacyApi } from '@/features/clinical/pharmacy/api';
import { GstNote, PharmacyNav } from '@/features/clinical/pharmacy/PharmacyNav';

export default function StockPage() {
  const [rows, setRows] = useState<PharmacyStockRowDto[]>([]);
  const [suppliers, setSuppliers] = useState<PharmacySupplierDto[]>([]);
  const [batchId, setBatchId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [delta, setDelta] = useState('-1');
  const [reason, setReason] = useState('');
  const [returnQty, setReturnQty] = useState('1');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([pharmacyApi.stock(), pharmacyApi.suppliers()])
      .then(([stock, supplierRows]) => {
        setRows(stock);
        setSuppliers(supplierRows.filter((row) => row.active));
        setBatchId((current) => current || stock[0]?.batchId || '');
        setSupplierId((current) => current || supplierRows[0]?.id || '');
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function adjust(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const created = await pharmacyApi.adjust({ reason, lines: [{ batchId, qtyDelta: Number(delta) }] });
      setMessage(`Adjustment ${created.number} posted.`);
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not adjust stock');
    } finally {
      setBusy(false);
    }
  }

  async function sendBack(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const created = await pharmacyApi.supplierReturn({ supplierId, reason: reason || 'Returned to supplier', lines: [{ batchId, qty: Number(returnQty) }] });
      setMessage(`Supplier return ${created.number} posted.`);
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not return stock');
    } finally {
      setBusy(false);
    }
  }

  if (loading && rows.length === 0) return <PageLoading label="Loading stock" />;
  if (error) return <PageError error={error} onRetry={load} />;

  return (
    <>
      <PharmacyNav />
      <PageHeader title="Stock" description="On-hand quantity equals the sum of stock moves." />
      <DataTable
        data={rows}
        getRowId={(row) => row.stockId}
        emptyMessage="No stock at this location. Receive a goods receipt first."
        columns={[
          { id: 'item', header: 'Item', accessor: (row) => `${row.brand} · ${row.strength}` },
          { id: 'batch', header: 'Batch', accessor: (row) => row.batchNo },
          { id: 'expiry', header: 'Expiry', accessor: (row) => formatDate(row.expiry) },
          { id: 'mrp', header: 'MRP', accessor: (row) => formatINR(row.mrpPaise) },
          { id: 'qty', header: 'Qty', accessor: (row) => String(row.qty) },
          {
            id: 'status',
            header: 'Status',
            accessor: (row) => (row.expired ? 'Expired' : row.low ? 'Low' : 'In stock'),
            render: (row) => (
              <span style={{ display: 'flex', gap: '0.35rem' }}>
                {row.expired ? <Badge tone="error">Expired</Badge> : null}
                {row.low ? <Badge tone="warning">Low</Badge> : null}
                {!row.expired && !row.low ? <Badge tone="success">In stock</Badge> : null}
              </span>
            ),
          },
        ]}
      />
      <form onSubmit={adjust} style={{ display: 'grid', gap: '0.75rem', maxWidth: '36rem', marginTop: '1.5rem' }}>
        <h2>Adjustment</h2>
        <Field label="Batch" htmlFor="adj-batch">
          <Select id="adj-batch" value={batchId} onChange={(e) => setBatchId(e.target.value)} required>
            {rows.map((row) => (
              <option key={row.batchId} value={row.batchId}>
                {row.brand} · {row.batchNo} · {row.qty}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Quantity change" htmlFor="delta" hint="Use a negative number to write stock off.">
          <Input id="delta" inputMode="numeric" value={delta} onChange={(e) => setDelta(e.target.value)} required />
        </Field>
        <Field label="Reason" htmlFor="reason">
          <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} required minLength={2} />
        </Field>
        <Button type="submit" loading={busy} disabled={!batchId}>
          Post adjustment
        </Button>
      </form>
      <form onSubmit={sendBack} style={{ display: 'grid', gap: '0.75rem', maxWidth: '36rem', marginTop: '1.5rem' }}>
        <h2>Return to supplier</h2>
        <Field label="Supplier" htmlFor="ret-supplier">
          <Select id="ret-supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
            {suppliers.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Quantity" htmlFor="ret-qty">
          <Input id="ret-qty" inputMode="numeric" value={returnQty} onChange={(e) => setReturnQty(e.target.value)} required />
        </Field>
        <Button type="submit" variant="secondary" loading={busy} disabled={!batchId || !supplierId}>
          Return stock
        </Button>
        {message ? <p role="status">{message}</p> : null}
      </form>
      <GstNote />
    </>
  );
}
