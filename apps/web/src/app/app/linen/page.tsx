'use client';

import { formatDateTime } from '@hos/shared';
import { Badge, Button, DataTable, Input, PageHeader } from '@hos/ui';
import { useCallback, useEffect, useState } from 'react';
import { linenApi, type LaundryBatch, type LinenItem } from '@/features/clinical/linen/api';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { ApiError } from '@/lib/api';

// MVP demo slice: linen stock, send to the laundry and receive back.

export default function LinenPage() {
  const [items, setItems] = useState<LinenItem[]>([]);
  const [batches, setBatches] = useState<LaundryBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sendItem, setSendItem] = useState('');
  const [sendQty, setSendQty] = useState('');
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState('');
  const [newClean, setNewClean] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([linenApi.stock(), linenApi.batches()])
      .then(([stock, sent]) => {
        setItems(stock);
        setBatches(sent);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const fail = (err: unknown, fallback: string) => setActionError(err instanceof ApiError ? err.message : fallback);

  const addItem = async (event: React.FormEvent) => {
    event.preventDefault();
    setActionError('');
    const cleanQty = Number(newClean || '0');
    if (!newName.trim() || !Number.isInteger(cleanQty) || cleanQty < 0) return setActionError('Enter a name and a clean count of 0 or more.');
    try {
      await linenApi.createItem({ name: newName.trim(), cleanQty });
      setNewName('');
      setNewClean('');
      load();
    } catch (err) {
      fail(err, 'Could not add this item');
    }
  };

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    setActionError('');
    const itemId = sendItem || items[0]?.id || '';
    const qty = Number(sendQty);
    if (!itemId || !Number.isInteger(qty) || qty < 1) return setActionError('Choose an item and a quantity of 1 or more.');
    try {
      await linenApi.sendToLaundry({ linenItemId: itemId, qtySent: qty });
      setSendQty('');
      load();
    } catch (err) {
      fail(err, 'Could not send this linen to the laundry');
    }
  };

  const receive = async (batch: LaundryBatch) => {
    setActionError('');
    const qty = Number(receiveQty[batch.id] ?? '');
    if (!Number.isInteger(qty) || qty < 0 || qty > batch.qtySent) return setActionError(`Enter a count from 0 to ${batch.qtySent}.`);
    setBusyId(batch.id);
    try {
      await linenApi.receive(batch.id, qty);
      load();
    } catch (err) {
      fail(err, 'Could not receive this batch');
    } finally {
      setBusyId(null);
    }
  };

  if (loading && items.length === 0 && !error) return <PageLoading label="Loading linen stock…" />;
  if (error) return <PageError error={error} onRetry={load} />;

  return (
    <>
      <PageHeader title="Linen and laundry" description="Clean linen stock, linen out to the laundry, and what came back." />

      {actionError ? (
        <p role="alert" className="mb-3 text-sm" style={{ color: 'var(--hos-fg-danger)' }}>
          {actionError}
        </p>
      ) : null}

      <DataTable
        data={items}
        getRowId={(row) => row.id}
        emptyMessage="No linen items yet. Add one below."
        columns={[
          { id: 'name', header: 'Item', accessor: (row) => row.name },
          { id: 'clean', header: 'Clean', accessor: (row) => String(row.cleanQty) },
          {
            id: 'laundry',
            header: 'In laundry',
            accessor: (row) => String(row.inLaundryQty),
            render: (row) => (row.inLaundryQty > 0 ? <Badge tone="info">{row.inLaundryQty}</Badge> : '0'),
          },
        ]}
      />

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <form onSubmit={send} aria-label="Send linen to laundry" className="grid gap-3">
          <h2 className="text-base font-medium">Send to laundry</h2>
          <div>
            <label htmlFor="linen-send-item" className="mb-1 block text-sm">
              Item
            </label>
            <select id="linen-send-item" className="hos-input" value={sendItem || items[0]?.id || ''} onChange={(e) => setSendItem(e.target.value)}>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.cleanQty} clean)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="linen-send-qty" className="mb-1 block text-sm">
              Quantity
            </label>
            <Input id="linen-send-qty" inputMode="numeric" value={sendQty} onChange={(e) => setSendQty(e.target.value)} />
          </div>
          <div>
            <Button type="submit">Send</Button>
          </div>
        </form>

        <form onSubmit={addItem} aria-label="Add linen item" className="grid gap-3">
          <h2 className="text-base font-medium">Add linen item</h2>
          <div>
            <label htmlFor="linen-new-name" className="mb-1 block text-sm">
              Name
            </label>
            <Input id="linen-new-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Pillow cover" />
          </div>
          <div>
            <label htmlFor="linen-new-clean" className="mb-1 block text-sm">
              Clean count
            </label>
            <Input id="linen-new-clean" inputMode="numeric" value={newClean} onChange={(e) => setNewClean(e.target.value)} />
          </div>
          <div>
            <Button type="submit">Add item</Button>
          </div>
        </form>
      </div>

      <h2 className="mb-2 mt-8 text-base font-medium">Laundry batches</h2>
      <DataTable
        data={batches}
        getRowId={(row) => row.id}
        emptyMessage="Nothing has been sent to the laundry yet."
        columns={[
          { id: 'number', header: 'Batch', accessor: (row) => row.number },
          { id: 'item', header: 'Item', accessor: (row) => row.itemName },
          { id: 'vendor', header: 'Laundry', accessor: (row) => row.vendor },
          { id: 'sent', header: 'Sent on', accessor: (row) => formatDateTime(row.sentAt) },
          { id: 'qty', header: 'Sent', accessor: (row) => String(row.qtySent) },
          {
            id: 'status',
            header: 'Status',
            accessor: (row) => row.status,
            render: (row) =>
              row.status === 'sent' ? (
                <div className="flex items-center gap-2">
                  <Input
                    aria-label={`Count back for ${row.number}`}
                    inputMode="numeric"
                    className="w-24"
                    value={receiveQty[row.id] ?? ''}
                    onChange={(e) => setReceiveQty((prev) => ({ ...prev, [row.id]: e.target.value }))}
                  />
                  <Button type="button" disabled={busyId === row.id} onClick={() => void receive(row)}>
                    Receive
                  </Button>
                </div>
              ) : (
                <span>
                  Received {row.qtyReceived ?? 0}
                  {row.qtyMissing > 0 ? `, missing ${row.qtyMissing}` : ''}
                </span>
              ),
          },
        ]}
      />
    </>
  );
}
