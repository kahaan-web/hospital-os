'use client';

import { Button, Dialog, Field, Textarea } from '@hos/ui';
import { useState } from 'react';
import { otSchedulingApi } from './api';
import { InlineNote } from './bits';
import { otActionError } from './format';

export function CancelRequestDialog({
  requestId,
  onClose,
  onCancelled,
}: {
  requestId: string | null;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => {
    setReason('');
    setError('');
    onClose();
  };

  const confirm = async () => {
    if (!requestId) return;
    if (!reason.trim()) {
      setError('Enter a reason before cancelling this request.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await otSchedulingApi.cancelRequest(requestId, reason.trim());
      setReason('');
      onCancelled();
    } catch (err) {
      setError(otActionError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={Boolean(requestId)}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title="Are you sure cancel the OT request?"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="button" variant="danger" loading={busy} onClick={() => void confirm()}>
            OK
          </Button>
        </>
      }
    >
      <Field label="Reason" required>
        <Textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} aria-label="Reason" required />
      </Field>
      <InlineNote>{error}</InlineNote>
    </Dialog>
  );
}
