'use client';

import { formatDate, formatINR } from '@hos/shared';
import { Button, DataTable, Field, Input, PageHeader, Select } from '@hos/ui';
import { useCallback, useEffect, useState } from 'react';
import { DoctorAccountingNav } from '@/features/clinical/doctor-accounting/DoctorAccountingNav';
import {
  doctorAccountingApi,
  SHARE_TYPE_LABEL,
  type DoctorOption,
  type EncounterType,
  type ShareRuleRow,
  type ShareType,
} from '@/features/clinical/doctor-accounting/api';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { ApiError } from '@/lib/api';

function shareText(rule: ShareRuleRow): string {
  return rule.shareType === 'fixed_per_unit' ? `${formatINR(rule.shareValue)} per unit` : `${rule.shareValue}% ${rule.shareType === 'pct_net' ? 'of net' : 'of gross'}`;
}

export default function DoctorShareRulesPage() {
  const [rules, setRules] = useState<ShareRuleRow[]>([]);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [doctorId, setDoctorId] = useState('');
  const [serviceCategory, setServiceCategory] = useState('all');
  const [encounterType, setEncounterType] = useState<EncounterType>('any');
  const [shareType, setShareType] = useState<ShareType>('pct_net');
  const [shareValue, setShareValue] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([doctorAccountingApi.rules(), doctorAccountingApi.doctors()])
      .then(([nextRules, nextDoctors]) => {
        setRules(nextRules);
        setDoctors(nextDoctors);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    setBusy(true);
    setFormError('');
    try {
      // Percent rules are whole numbers; a fixed share is entered in rupees and stored in paise.
      const value = shareType === 'fixed_per_unit' ? Math.round(Number(shareValue) * 100) : Math.round(Number(shareValue));
      await doctorAccountingApi.createRule({ doctorId, serviceCategory: serviceCategory.trim() || 'all', encounterType, shareType, shareValue: value });
      setShareValue('');
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save the rule');
    } finally {
      setBusy(false);
    }
  };

  if (loading && rules.length === 0 && !error) return <PageLoading label="Loading share rules…" />;
  if (error) return <PageError error={error} onRetry={load} />;

  return (
    <>
      <PageHeader
        title="Doctor share rules"
        description="How each visiting doctor's share is worked out. The gross-or-net basis is still to be confirmed with the client, so rules store the share type only."
      />
      <DoctorAccountingNav />
      {formError ? (
        <p role="alert" className="mb-3 text-sm" style={{ color: 'var(--hos-fg-danger)' }}>
          {formError}
        </p>
      ) : null}
      <form
        className="mb-6 grid max-w-3xl gap-3 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <Field label="Doctor" required>
          <Select value={doctorId} onChange={(event) => setDoctorId(event.target.value)} required>
            <option value="">Select a doctor</option>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Service category" hint="Use “all” for every service.">
          <Input value={serviceCategory} onChange={(event) => setServiceCategory(event.target.value)} />
        </Field>
        <Field label="Encounter type">
          <Select value={encounterType} onChange={(event) => setEncounterType(event.target.value as EncounterType)}>
            <option value="any">OP and IP</option>
            <option value="op">OP only</option>
            <option value="ip">IP only</option>
          </Select>
        </Field>
        <Field label="Share type">
          <Select value={shareType} onChange={(event) => setShareType(event.target.value as ShareType)}>
            {Object.entries(SHARE_TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={shareType === 'fixed_per_unit' ? 'Amount per unit (₹)' : 'Percentage'} required>
          <Input inputMode="decimal" value={shareValue} onChange={(event) => setShareValue(event.target.value)} required />
        </Field>
        <div className="self-end">
          <Button type="submit" disabled={busy || !doctorId || !shareValue}>
            Add rule
          </Button>
        </div>
      </form>
      <DataTable
        data={rules}
        getRowId={(row) => row.id}
        emptyMessage="No share rules yet. Add one per doctor."
        columns={[
          { id: 'doctor', header: 'Doctor', accessor: (row) => row.doctorName },
          { id: 'category', header: 'Service category', accessor: (row) => row.serviceCategory },
          { id: 'enc', header: 'Encounter', accessor: (row) => (row.encounterType === 'any' ? 'OP and IP' : row.encounterType.toUpperCase()) },
          { id: 'share', header: 'Share', accessor: (row) => shareText(row) },
          { id: 'from', header: 'Effective from', accessor: (row) => formatDate(row.effectiveFrom) },
        ]}
      />
    </>
  );
}
