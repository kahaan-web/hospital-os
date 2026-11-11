'use client';

import type { ServiceOrderInput } from '@hos/shared';
import { Button, Select } from '@hos/ui';
import { useEffect, useState } from 'react';
import { doctorApi } from '../doctor/api';

export function OrderEntryPanel({
  encounterId,
  onPlaced,
}: {
  encounterId: string;
  onPlaced?: () => void;
}) {
  const [services, setServices] = useState<{ id: string; name: string }[]>([]);
  const [serviceId, setServiceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    doctorApi.services('lab').then(setServices).catch(() => setServices([]));
  }, []);

  const place = async () => {
    if (!serviceId) return;
    setBusy(true);
    setError(null);
    const body: ServiceOrderInput = { items: [{ serviceId }] };
    try {
      await doctorApi.diagnosticOrder(encounterId, body);
      onPlaced?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not place order');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-[var(--hos-border)] p-4">
      <h3 className="text-sm font-semibold">Investigations</h3>
      <Select value={serviceId} onChange={(e) => setServiceId(e.target.value)} aria-label="Lab test">
        <option value="">Choose a test</option>
        {services.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      {error ? <p className="text-sm text-[var(--hos-danger)]">{error}</p> : null}
      <Button type="button" onClick={() => void place()} disabled={busy || !serviceId}>
        Place lab order
      </Button>
    </div>
  );
}
