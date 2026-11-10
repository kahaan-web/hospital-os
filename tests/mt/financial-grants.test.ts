import { createDb, dbEnv } from '@hos/db';
import { sql } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

const handle = createDb(dbEnv().appUrl, { max: 1 });

afterAll(async () => {
  await handle.close();
});

function pgCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const record = error as { code?: unknown; cause?: unknown };
  if (typeof record.code === 'string' && /^[0-9A-Z]{5}$/.test(record.code)) return record.code;
  return pgCode(record.cause);
}

async function expectDenied(label: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
    throw new Error(`expected 42501 for ${label}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('expected 42501')) throw error;
    expect(pgCode(error), error instanceof Error ? error.message : String(error)).toBe('42501');
  }
}

it('refuses hos_app updates and deletes on issued billing rows', async () => {
  await expectDenied('invoices update', () => handle.db.execute(sql`update invoices set notes = notes`));
  await expectDenied('invoices delete', () => handle.db.execute(sql`delete from invoices`));
  await expectDenied('invoice_lines update', () => handle.db.execute(sql`update invoice_lines set description = description`));
  await expectDenied('invoice_lines delete', () => handle.db.execute(sql`delete from invoice_lines`));
  await expectDenied('payments update', () => handle.db.execute(sql`update payments set status = 'failed'`));
  await expectDenied('payments delete', () => handle.db.execute(sql`delete from payments`));
  await expectDenied('credit_notes delete', () => handle.db.execute(sql`delete from credit_notes`));
  await expectDenied('credit_notes update', () => handle.db.execute(sql`update credit_notes set reason = reason`));
});

it('refuses direct subscription writes and order or consent columns that must not change', async () => {
  await expectDenied('subscriptions insert', () => handle.db.execute(sql`insert into subscriptions default values`));
  await expectDenied('subscriptions update', () => handle.db.execute(sql`update subscriptions set credit_paise = 0`));
  await expectDenied('subscriptions delete', () => handle.db.execute(sql`delete from subscriptions`));
  await expectDenied('subscription_items insert', () => handle.db.execute(sql`insert into subscription_items default values`));
  await expectDenied('subscription_items update', () => handle.db.execute(sql`update subscription_items set status = 'removed'`));
  await expectDenied('subscription_items delete', () => handle.db.execute(sql`delete from subscription_items`));
  await expectDenied('orders delete', () => handle.db.execute(sql`delete from orders`));
  await expectDenied('orders quote', () => handle.db.execute(sql`update orders set quote = quote`));
  await expectDenied('consents delete', () => handle.db.execute(sql`delete from consents`));
  await expectDenied('consents purposes', () => handle.db.execute(sql`update consents set purposes = purposes`));

  await handle.db.execute(sql`update orders set status = status where false`);
  await handle.db.execute(sql`update consents set withdrawn_at = withdrawn_at where false`);
});

it('grants the narrow billing functions and keeps the replace helper private', async () => {
  const rows = await handle.db.execute<{ proname: string; ok: boolean }>(sql`
    select p.proname, has_function_privilege(p.oid, 'execute') as ok
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'hos_payment_transition',
        'hos_order_mark_paid',
        'hos_order_transition',
        'hos_payment_tenant',
        'hos_subscription_apply_order',
        'hos_subscription_admin_change',
        'hos_subscription_replace'
      )
  `);
  const privilege = new Map(rows.rows.map((row) => [row.proname, row.ok]));
  expect(privilege.get('hos_payment_transition')).toBe(true);
  expect(privilege.get('hos_order_mark_paid')).toBe(true);
  expect(privilege.get('hos_subscription_apply_order')).toBe(true);
  expect(privilege.get('hos_subscription_admin_change')).toBe(true);
  expect(privilege.get('hos_subscription_replace')).toBe(false);
});
