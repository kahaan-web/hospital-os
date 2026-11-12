import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectRoles, disconnectRoles, expectSqlState, scopeTenant, type DbRoles } from './helpers';

/**
 * B5 money tables are not updated or deleted by hos_app. State changes go through
 * SECURITY DEFINER functions, which reject another tenant's id and an illegal status.
 */

const LOCKED = [
  'bills',
  'bill_lines',
  'deposits',
  'bill_settlements',
  'concessions',
  'refunds',
  'bill_credit_notes',
  'cash_ledger',
] as const;

const FUNCS = [
  'hos_bill_lock',
  'hos_deposit_lock',
  'hos_bill_reprice',
  'hos_bill_finalise',
  'hos_bill_cancel',
  'hos_bill_settle',
  'hos_bill_refund',
  'hos_bill_credit_note_cancel',
  'hos_deposit_refund',
  'hos_cash_attach_ref',
  'hos_cash_void',
  'hos_billing_guard',
] as const;

describe.sequential('billing definers', () => {
  let roles: DbRoles | null = null;

  beforeAll(async () => {
    roles = await connectRoles();
  });

  afterAll(async () => {
    await disconnectRoles(roles);
  });

  function app() {
    if (!roles) throw new Error('database clients were not opened');
    return roles.app;
  }

  it('refuses direct updates and deletes, and keeps the guard private', async () => {
    await app().query('BEGIN');
    try {
      for (const table of LOCKED) {
        await expectSqlState(app(), `update ${table} set updated_at = updated_at`, [], '42501');
        await expectSqlState(app(), `delete from ${table}`, [], '42501');
      }
      await expectSqlState(
        app(),
        `insert into bill_settlements (tenant_id, bill_id, mode, amount_paise) values (gen_random_uuid(), gen_random_uuid(), 'cash', 1)`,
        [],
        '42501',
      );
      await expectSqlState(
        app(),
        `insert into refunds (tenant_id, number, amount_paise, reason, mode) values (gen_random_uuid(), 'NOPE', 1, 'Nope', 'cash')`,
        [],
        '42501',
      );
      await expectSqlState(
        app(),
        `insert into bill_credit_notes (tenant_id, bill_id, number, amount_paise) values (gen_random_uuid(), gen_random_uuid(), 'NOPE', 1)`,
        [],
        '42501',
      );
      const rows = await app().query<{ proname: string; ok: boolean }>(
        `select p.proname, has_function_privilege(p.oid, 'execute') as ok
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = any($1::text[])`,
        [FUNCS],
      );
      const privilege = new Map(rows.rows.map((row) => [row.proname, row.ok]));
      for (const name of FUNCS) {
        expect(privilege.get(name), name).toBe(name !== 'hos_billing_guard');
      }
    } finally {
      await app().query('ROLLBACK');
    }
  });

  it('rejects a missing tenant, a cross-tenant id, and an illegal transition', async () => {
    const stamp = randomUUID().replace(/-/g, '').slice(0, 8);
    await app().query('BEGIN');
    try {
      await expectHos(app(), `select hos_bill_finalise($1::uuid, 'T${stamp}')`, [randomUUID()], 'hos:forbidden', '42501');

      const sunrise = await tenantOf('owner@sunrise.demo');
      const lotus = await tenantOf('owner@lotus.demo');
      expect(sunrise).not.toBe(lotus);
      await scopeTenant(app(), sunrise);
      const loc = await one<{ id: string }>(`select id from locations limit 1`);
      const patient = await one<{ id: string }>(`select id from patients limit 1`);

      const draft = await one<{ id: string }>(
        `insert into bills (
           tenant_id, location_id, patient_id, kind, doc_type, pay_class, subtotal_paise, total_paise
         ) values (hos_tenant_id(), $1, $2, 'op', 'bill_of_supply', 'cash', 100, 100)
         returning id`,
        [loc.id, patient.id],
      );
      await app().query(`select hos_bill_finalise($1::uuid, $2)`, [draft.id, `F${stamp}`]);
      await expectHos(app(), `select hos_bill_finalise($1::uuid, $2)`, [draft.id, `G${stamp}`], 'hos:bad_transition');
      await expectHos(
        app(),
        `select hos_bill_reprice($1::uuid, '[]'::jsonb, 'bill_of_supply', 100, 0, 0, 0, 0, 0, 100)`,
        [draft.id],
        'hos:bad_transition',
      );
      await expectHos(app(), `select hos_bill_settle($1::uuid, 'cash', 100, null, null, null, null)`, [draft.id], 'hos:bad_transition');

      const payable = await one<{ id: string }>(
        `insert into bills (
           tenant_id, location_id, patient_id, kind, number, doc_type, status, pay_class,
           subtotal_paise, total_paise, paid_paise, finalised_at
         ) values (
           hos_tenant_id(), $1, $2, 'op', $3, 'bill_of_supply', 'final', 'cash', 100, 100, 0, now()
         ) returning id`,
        [loc.id, patient.id, `P${stamp}`],
      );
      const receipt = await one<{ id: string }>(
        `insert into cash_ledger (
           tenant_id, location_id, entry_type, direction, mode, amount_paise, number, patient_id, ref_type, ref_id
         ) values (hos_tenant_id(), $1, 'receipt', 'in', 'cash', 40, $2, $3, 'bill', $4)
         returning id`,
        [loc.id, `C${stamp}`, patient.id, payable.id],
      );
      await app().query(`select hos_bill_settle($1::uuid, 'cash', 40, null, $2::uuid, null, null)`, [payable.id, receipt.id]);
      const paid = await one<{ paid_paise: string }>(`select paid_paise::text from bills where id = $1`, [payable.id]);
      expect(paid.paid_paise).toBe('40');
      await expectHos(
        app(),
        `select hos_bill_settle($1::uuid, 'cash', 100, null, $2::uuid, null, null)`,
        [payable.id, receipt.id],
        'hos:bad_transition',
      );

      const deposit = await one<{ id: string }>(
        `insert into deposits (
           tenant_id, location_id, patient_id, number, amount_paise, balance_paise, mode, status
         ) values (hos_tenant_id(), $1, $2, $3, 50, 50, 'cash', 'open')
         returning id`,
        [loc.id, patient.id, `D${stamp}`],
      );
      await app().query(`select hos_bill_settle($1::uuid, 'deposit', 50, $2::uuid, null, null, null)`, [payable.id, deposit.id]);
      const closed = await one<{ balance_paise: string; status: string }>(
        `select balance_paise::text, status from deposits where id = $1`,
        [deposit.id],
      );
      expect(closed).toEqual({ balance_paise: '0', status: 'adjusted' });
      await expectHos(
        app(),
        `select hos_deposit_refund($1::uuid, 10, 'Too late to refund', 'cash', $2, $3::uuid, null)`,
        [deposit.id, `R${stamp}X`, randomUUID()],
        'hos:bad_transition',
      );

      const openDeposit = await one<{ id: string }>(
        `insert into deposits (
           tenant_id, location_id, patient_id, number, amount_paise, balance_paise, mode, status
         ) values (hos_tenant_id(), $1, $2, $3, 80, 80, 'cash', 'open')
         returning id`,
        [loc.id, patient.id, `E${stamp}`],
      );
      await expectHos(
        app(),
        `select hos_deposit_refund($1::uuid, 81, 'More than the balance', 'cash', $2, $3::uuid, null)`,
        [openDeposit.id, `R${stamp}Y`, randomUUID()],
        'hos:bad_transition',
      );
      const cashOut = await one<{ id: string }>(
        `insert into cash_ledger (
           tenant_id, location_id, entry_type, direction, mode, amount_paise, number, patient_id, ref_type, ref_id
         ) values (hos_tenant_id(), $1, 'deposit_refund', 'out', 'cash', 30, $2, $3, 'deposit', $4)
         returning id`,
        [loc.id, `O${stamp}`, patient.id, openDeposit.id],
      );
      await app().query(
        `select hos_deposit_refund($1::uuid, 30, 'Part of the deposit', 'cash', $2, $3::uuid, null)`,
        [openDeposit.id, `R${stamp}Z`, cashOut.id],
      );
      const left = await one<{ balance_paise: string; status: string }>(
        `select balance_paise::text, status from deposits where id = $1`,
        [openDeposit.id],
      );
      expect(left).toEqual({ balance_paise: '50', status: 'open' });

      const refunded = await one<{ id: string }>(
        `insert into bills (
           tenant_id, location_id, patient_id, kind, number, doc_type, status, pay_class,
           subtotal_paise, total_paise, paid_paise, finalised_at
         ) values (
           hos_tenant_id(), $1, $2, 'op', $3, 'bill_of_supply', 'final', 'cash', 100, 100, 100, now()
         ) returning id`,
        [loc.id, patient.id, `B${stamp}`],
      );
      await expectHos(app(), `select hos_bill_cancel($1::uuid, 'Paid bill')`, [refunded.id], 'hos:bad_transition');
      const refundCash = await one<{ id: string }>(
        `insert into cash_ledger (
           tenant_id, location_id, entry_type, direction, mode, amount_paise, number, patient_id, ref_type, ref_id
         ) values (hos_tenant_id(), $1, 'refund', 'out', 'cash', 100, $2, $3, 'bill', $4)
         returning id`,
        [loc.id, `N${stamp}`, patient.id, refunded.id],
      );
      await app().query(
        `select hos_bill_refund($1::uuid, 100, 'Sample refund', 'cash', $2, $3, $4::uuid, null)`,
        [refunded.id, `RF${stamp}`, `CN${stamp}`, refundCash.id],
      );
      const note = await one<{ id: string; paid_paise: string }>(
        `select n.id, b.paid_paise::text
           from bill_credit_notes n
           join bills b on b.id = n.bill_id
          where n.bill_id = $1`,
        [refunded.id],
      );
      expect(note.paid_paise).toBe('0');
      await app().query(`select hos_bill_credit_note_cancel($1::uuid)`, [note.id]);
      await expectHos(app(), `select hos_bill_credit_note_cancel($1::uuid)`, [note.id], 'hos:bad_transition');

      const ledger = await one<{ id: string }>(
        `insert into cash_ledger (
           tenant_id, location_id, entry_type, direction, mode, amount_paise, number, ref_type, ref_id
         ) values (hos_tenant_id(), $1, 'receipt', 'in', 'cash', 10, $2, 'bill', $3)
         returning id`,
        [loc.id, `V${stamp}`, refunded.id],
      );
      await expectHos(app(), `select hos_cash_void($1::uuid, 'no')`, [ledger.id], 'hos:bad_transition');
      await app().query(`select hos_cash_void($1::uuid, 'Wrong counter')`, [ledger.id]);
      const voided = await one<{ void_reason: string }>(`select void_reason from cash_ledger where id = $1`, [ledger.id]);
      expect(voided.void_reason).toBe('Wrong counter');
      await app().query(`select hos_cash_void($1::uuid, 'A second reason')`, [ledger.id]);
      const still = await one<{ void_reason: string }>(`select void_reason from cash_ledger where id = $1`, [ledger.id]);
      expect(still.void_reason).toBe('Wrong counter');

      await scopeTenant(app(), lotus);
      await expectHos(app(), `select hos_bill_cancel($1::uuid, 'Other hospital')`, [draft.id], 'hos:bill_not_found');
      await expectHos(
        app(),
        `select hos_deposit_refund($1::uuid, 10, 'Other hospital', 'cash', $2, $3::uuid, null)`,
        [openDeposit.id, `R${stamp}Q`, randomUUID()],
        'hos:deposit_not_found',
      );
      await expectHos(app(), `select hos_bill_credit_note_cancel($1::uuid)`, [note.id], 'hos:credit_note_not_found');
      await expectHos(app(), `select hos_cash_void($1::uuid, 'Other hospital')`, [ledger.id], 'hos:cash_not_found');
    } finally {
      await app().query('ROLLBACK');
    }
  });

  async function tenantOf(email: string): Promise<string> {
    const found = await app().query<{ tenant_id: string }>(`select tenant_id from hos_login_lookup($1)`, [email]);
    const id = found.rows[0]?.tenant_id;
    if (!id) throw new Error(`missing tenant for ${email}`);
    return id;
  }

  async function one<T extends Record<string, string>>(text: string, params: unknown[] = []): Promise<T> {
    const found = await app().query<T>(text, params);
    const row = found.rows[0];
    if (!row) throw new Error(`no row for ${text}`);
    return row;
  }
});

async function expectHos(
  client: DbRoles['app'],
  text: string,
  params: unknown[],
  token: string,
  code = 'P0001',
): Promise<void> {
  const message = await expectSqlState(client, text, params, code);
  expect(message).toContain(token);
}
