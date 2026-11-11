import type { Tx } from '@hos/db';
import { afterEach, expect, it, vi } from 'vitest';
import { AuditPhiError, writeAudit, type Actor } from './http';

const actor: Actor = {
  actorType: 'user',
  actorId: null,
  actorLabel: 'audit-phi-test',
  tenantId: null,
  locationId: null,
  ip: null,
  userAgent: null,
};

function rejectingTx(): Tx {
  return {
    insert() {
      throw new Error('insert reached');
    },
  } as unknown as Tx;
}

afterEach(() => {
  vi.restoreAllMocks();
});

it('rejects mobile, dob and abhaNumber anywhere in an audit payload', async () => {
  const tx = rejectingTx();
  await expect(writeAudit(tx, actor, 'registration.patient.update', 'patient', null, null, { mobile: '+919000011111' })).rejects.toBeInstanceOf(AuditPhiError);
  await expect(writeAudit(tx, actor, 'registration.patient.update', 'patient', null, { dob: '1990-01-01' }, { status: 'active' })).rejects.toBeInstanceOf(AuditPhiError);
  await expect(writeAudit(tx, actor, 'registration.patient.update', 'patient', null, null, { nested: { abhaNumber: '00-0000-0000-0001' } })).rejects.toBeInstanceOf(AuditPhiError);
});

it('allows a patient update that only names the changed fields', async () => {
  await expect(
    writeAudit(rejectingTx(), actor, 'registration.patient.update', 'patient', null, { uhid: 'DEMO-1', status: 'active' }, { uhid: 'DEMO-1', status: 'active', changed: ['mobile', 'firstName', 'abhaNumber'] }),
  ).rejects.toThrow('insert reached');
});

it('strips patient-data keys in production and logs the key names only', async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const stored: { before?: unknown; after?: unknown }[] = [];
  const tx = {
    insert() {
      return {
        values(row: { before?: unknown; after?: unknown }) {
          stored.push(row);
          return Promise.resolve();
        },
      };
    },
  } as unknown as Tx;
  try {
    await writeAudit(tx, actor, 'registration.patient.update', 'patient', null, { mobile: '+919000011111', status: 'active' }, { dob: '1990-01-01', uhid: 'DEMO-1' });
  } finally {
    process.env.NODE_ENV = previous;
  }
  expect(stored).toHaveLength(1);
  expect(stored[0]?.before).toEqual({ status: 'active' });
  expect(stored[0]?.after).toEqual({ uhid: 'DEMO-1' });
  const logged = error.mock.calls.map((call) => call.map(String).join(' ')).join('\n');
  expect(logged).toContain('mobile');
  expect(logged).toContain('dob');
  expect(logged).not.toContain('+919000011111');
  expect(logged).not.toContain('1990-01-01');
});
