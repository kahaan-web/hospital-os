'use client';

import { formatDateTime } from '@hos/shared';
import { Badge, Button, DataTable, Input, PageHeader, Textarea } from '@hos/ui';
import { useCallback, useEffect, useState } from 'react';
import { indentsApi, type Indent } from '@/features/clinical/indents/api';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { ApiError } from '@/lib/api';

// MVP demo slice: indent list, create, approve and convert to a purchase order.
// Lines are typed one per row as: item | unit | quantity.

function statusTone(status: string): 'neutral' | 'info' | 'warning' | 'success' | 'error' {
  if (status === 'converted') return 'success';
  if (status === 'approved') return 'info';
  if (status === 'cancelled') return 'error';
  if (status === 'draft') return 'warning';
  return 'neutral';
}

function parseLines(text: string): { itemName: string; unit: string; qty: number }[] | string {
  const out: { itemName: string; unit: string; qty: number }[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const [itemName = '', unit = '', qtyText = ''] = line.split('|').map((part) => part.trim());
    const qty = Number(qtyText);
    if (!itemName || !unit || !Number.isInteger(qty) || qty < 1) {
      return `Check this line: "${line}". Use item | unit | quantity.`;
    }
    out.push({ itemName, unit, qty });
  }
  if (out.length === 0) return 'Add at least one line.';
  return out;
}

export default function IndentsPage() {
  const [rows, setRows] = useState<Indent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [department, setDepartment] = useState('');
  const [priority, setPriority] = useState<'routine' | 'urgent'>('routine');
  const [linesText, setLinesText] = useState('');
  const [supplierName, setSupplierName] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    indentsApi
      .list()
      .then(setRows)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const fail = (err: unknown, fallback: string) => setActionError(err instanceof ApiError ? err.message : fallback);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setActionError('');
    if (!department.trim()) return setActionError('Enter the department that is raising this indent.');
    const lines = parseLines(linesText);
    if (typeof lines === 'string') return setActionError(lines);
    try {
      await indentsApi.create({ department: department.trim(), priority, lines });
      setDepartment('');
      setLinesText('');
      load();
    } catch (err) {
      fail(err, 'Could not save this indent');
    }
  };

  const approve = async (row: Indent) => {
    setBusyId(row.id);
    setActionError('');
    try {
      await indentsApi.approve(row.id);
      load();
    } catch (err) {
      fail(err, 'Could not approve this indent');
    } finally {
      setBusyId(null);
    }
  };

  const convert = async (row: Indent) => {
    setActionError('');
    if (!supplierName.trim()) return setActionError('Enter the supplier name first.');
    setBusyId(row.id);
    try {
      await indentsApi.convertToPo(row.id, { supplierName: supplierName.trim() });
      load();
    } catch (err) {
      fail(err, 'Could not create the purchase order');
    } finally {
      setBusyId(null);
    }
  };

  if (loading && rows.length === 0 && !error) return <PageLoading label="Loading indents…" />;
  if (error) return <PageError error={error} onRetry={load} />;

  return (
    <>
      <PageHeader title="Indents and purchase" description="Departments request stock. Approved indents become purchase orders." />

      {actionError ? (
        <p role="alert" className="mb-3 text-sm" style={{ color: 'var(--hos-fg-danger)' }}>
          {actionError}
        </p>
      ) : null}

      <form onSubmit={create} aria-label="New indent" className="mb-6 grid gap-3 md:grid-cols-2">
        <div>
          <label htmlFor="ind-dept" className="mb-1 block text-sm">
            Department
          </label>
          <Input id="ind-dept" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Ward GW-1" />
        </div>
        <div>
          <label htmlFor="ind-priority" className="mb-1 block text-sm">
            Priority
          </label>
          <select id="ind-priority" value={priority} onChange={(e) => setPriority(e.target.value as 'routine' | 'urgent')} className="hos-input">
            <option value="routine">Routine</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label htmlFor="ind-lines" className="mb-1 block text-sm">
            Items (one per line: item | unit | quantity)
          </label>
          <Textarea id="ind-lines" rows={4} value={linesText} onChange={(e) => setLinesText(e.target.value)} />
        </div>
        <div>
          <Button type="submit">Save indent</Button>
        </div>
      </form>

      <div className="mb-3 max-w-md">
        <label htmlFor="ind-supplier" className="mb-1 block text-sm">
          Supplier for the purchase order
        </label>
        <Input id="ind-supplier" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Supplier name" />
      </div>

      <DataTable
        data={rows}
        getRowId={(row) => row.id}
        emptyMessage="No indents yet. Save one above to start."
        columns={[
          { id: 'number', header: 'Indent', accessor: (row) => row.number },
          { id: 'dept', header: 'Department', accessor: (row) => row.department },
          { id: 'priority', header: 'Priority', accessor: (row) => row.priority },
          { id: 'items', header: 'Items', accessor: (row) => row.lines.map((l) => `${l.itemName} × ${l.qty}`).join('; ') },
          { id: 'created', header: 'Raised', accessor: (row) => formatDateTime(row.createdAt) },
          {
            id: 'status',
            header: 'Status',
            accessor: (row) => row.status,
            render: (row) => <Badge tone={statusTone(row.status)}>{row.status}</Badge>,
          },
          {
            id: 'action',
            header: '',
            accessor: () => '',
            render: (row) => {
              if (row.status === 'draft') {
                return (
                  <Button type="button" disabled={busyId === row.id} onClick={() => void approve(row)}>
                    Approve
                  </Button>
                );
              }
              if (row.status === 'approved') {
                return (
                  <Button type="button" disabled={busyId === row.id} onClick={() => void convert(row)}>
                    Convert to PO
                  </Button>
                );
              }
              return row.purchaseOrder ? <span>{row.purchaseOrder.number}</span> : '—';
            },
          },
        ]}
      />
    </>
  );
}
