'use client';

import { Button, Checkbox, Dialog, PriceDisplay } from '@hos/ui';
import { useEffect, useState } from 'react';
import { otSchedulingApi, type OtOutstandingDto } from './api';
import { InlineNote } from './bits';
import { otActionError } from './format';

const EMPTY: OtOutstandingDto = {
  unsettledPaise: 0,
  unbilledPaise: 0,
  depositPaise: 0,
  duePaise: 0,
  officePermission: false,
};

export function OutstandingDialog({
  requestId,
  remark,
  onClose,
  onPermission,
}: {
  requestId: string | null;
  remark: string;
  onClose: () => void;
  onPermission: (granted: boolean) => void;
}) {
  const [row, setRow] = useState<OtOutstandingDto>(EMPTY);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!requestId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    otSchedulingApi
      .outstanding(requestId)
      .then((next) => {
        if (!cancelled) setRow(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setRow(EMPTY);
          setError(otActionError(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  const savePermission = async (granted: boolean) => {
    if (!requestId) return;
    setSaving(true);
    setError('');
    setRow((prev) => ({ ...prev, officePermission: granted }));
    try {
      await otSchedulingApi.officePermission(requestId, { granted, remark });
      onPermission(granted);
    } catch (err) {
      setRow((prev) => ({ ...prev, officePermission: !granted }));
      setError(otActionError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={Boolean(requestId)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Patient Outstanding Details"
      footer={
        <Button type="button" variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {loading ? <p style={{ margin: 0 }}>Loading outstanding amounts…</p> : null}
      <table className="hos-table" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <caption className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          Patient outstanding amounts
        </caption>
        <tbody>
          <Amount label="Un-Settled Amount" paise={row.unsettledPaise} />
          <Amount label="Un-Billed Amount" paise={row.unbilledPaise} />
          <Amount label="Deposit Balance" paise={row.depositPaise} />
          <Amount label="Due Amount" paise={row.duePaise} />
        </tbody>
      </table>
      <div style={{ marginTop: 'var(--hos-space-3)' }}>
        <Checkbox
          checked={row.officePermission}
          disabled={saving || loading || !requestId}
          label="Office Permission?"
          onCheckedChange={(checked) => void savePermission(checked === true)}
        />
      </div>
      <InlineNote>{error}</InlineNote>
    </Dialog>
  );
}

function Amount({ label, paise }: { label: string; paise: number }) {
  return (
    <tr>
      <th scope="row" style={{ textAlign: 'left', fontWeight: 500 }}>
        {label}
      </th>
      <td>
        <PriceDisplay paise={paise} decimals="always" />
      </td>
    </tr>
  );
}
