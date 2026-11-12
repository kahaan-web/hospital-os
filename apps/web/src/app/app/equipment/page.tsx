'use client';

import { DataTable, Button, Field, Input, PageHeader, Select } from '@hos/ui';
import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { equipmentApi, type Criticality, type EquipmentAssetRow, rupees } from '@/features/clinical/equipment/api';

const STATUS_LABEL: Record<EquipmentAssetRow['status'], string> = {
  operational: 'Operational',
  non_operational: 'Down',
  under_maintenance: 'Under maintenance',
  condemned: 'Condemned',
};

const EMPTY = { assetTag: '', name: '', category: '', department: '', criticality: 'medium' as Criticality, cost: '' };

export default function EquipmentRegisterPage() {
  const [rows, setRows] = useState<EquipmentAssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    equipmentApi
      .assets()
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

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      const costRupees = Number(form.cost || 0);
      await equipmentApi.createAsset({
        assetTag: form.assetTag.trim(),
        name: form.name.trim(),
        category: form.category.trim(),
        department: form.department.trim(),
        criticality: form.criticality,
        purchaseCostPaise: Math.round(costRupees * 100),
      });
      setForm(EMPTY);
      setAdding(false);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save the equipment');
    } finally {
      setBusy(false);
    }
  }

  if (loading && rows.length === 0) return <PageLoading label="Loading equipment register" />;
  if (error && rows.length === 0) return <PageError error={error} onRetry={load} />;

  return (
    <>
      <PageHeader
        title="Equipment"
        description="Asset register, preventive maintenance and breakdown log."
        actions={
          <Button type="button" variant="secondary" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
            {adding ? 'Close form' : 'Add equipment'}
          </Button>
        }
      />
      {adding ? (
        <form onSubmit={onCreate} aria-label="Add equipment" className="mb-6 grid max-w-3xl gap-3 md:grid-cols-2">
          <Field label="Asset tag" required>
            <Input value={form.assetTag} onChange={(e) => setForm({ ...form, assetTag: e.target.value })} required maxLength={40} />
          </Field>
          <Field label="Name" required>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={120} />
          </Field>
          <Field label="Category">
            <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} maxLength={60} />
          </Field>
          <Field label="Department">
            <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} maxLength={60} />
          </Field>
          <Field label="Criticality" required>
            <Select aria-label="Criticality" value={form.criticality} onChange={(e) => setForm({ ...form, criticality: e.target.value as Criticality })}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </Select>
          </Field>
          <Field label="Purchase cost (₹)">
            <Input inputMode="decimal" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
          </Field>
          {formError ? (
            <p role="alert" className="text-sm md:col-span-2" style={{ color: 'var(--hos-fg-danger)' }}>
              {formError}
            </p>
          ) : null}
          <div>
            <Button type="submit" disabled={busy}>
              Save equipment
            </Button>
          </div>
        </form>
      ) : null}
      <DataTable
        data={rows}
        getRowId={(row) => row.id}
        emptyMessage="No equipment yet. Add the first asset to start tracking."
        columns={[
          {
            id: 'tag',
            header: 'Asset tag',
            accessor: (row) => row.assetTag,
            render: (row) => (
              <Link href={`/app/equipment/${row.id}`} className="hos-link">
                {row.assetTag}
              </Link>
            ),
          },
          { id: 'name', header: 'Name', accessor: (row) => row.name },
          { id: 'dept', header: 'Department', accessor: (row) => row.department || '—' },
          { id: 'crit', header: 'Criticality', accessor: (row) => row.criticality },
          { id: 'status', header: 'Status', accessor: (row) => STATUS_LABEL[row.status] },
          {
            id: 'pm',
            header: 'Next PM due',
            accessor: (row) => (row.nextPmDue ? `${row.nextPmDue}${row.pmOverdue ? ' (overdue)' : ''}` : '—'),
          },
          { id: 'cost', header: 'Cost', accessor: (row) => rupees(row.purchaseCostPaise) },
        ]}
      />
    </>
  );
}
