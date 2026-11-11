import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { dbEnv } from '../../packages/db/src/env';

/**
 * Fixtures for the RLS suite, on the shared hospital-os Postgres (127.0.0.1:55432).
 *
 * Decision: never create, drop, stop or recreate that database. Rows use a `zz-test-` slug
 * and are removed by the superuser at the end. Unscoped DELETE is rolled back after the
 * rowCount assertion so a missing policy cannot wipe other tenants.
 *
 * hos_migrator owns the tables (owner policy USING true). Checks that must see every
 * tenant use the superuser, matching the contract's "checked as superuser" line.
 */

export interface DbRoles {
  app: pg.Client;
  migrator: pg.Client;
  admin: pg.Client;
}

export interface Side {
  id: string;
  locationId: string;
  departmentId: string;
  doctorId: string;
  userId: string;
  assignmentId: string;
  invitationId: string;
  otpId: string;
  subscriptionId: string;
  itemId: string;
  orderId: string;
  paymentId: string;
  invoiceId: string;
  lineId: string;
  overrideId: string;
  consentId: string;
  requestId: string;
  checklistKey: string;
  outboxId: string;
  idemKey: string;
  seriesId: string;
  patientId: string;
  alertId: string;
  documentId: string;
  serviceId: string;
  tariffId: string;
  encounterId: string;
  clinicalOrderId: string;
  orderItemId: string;
  vitalId: string;
  noteId: string;
  chargeId: string;
  cashId: string;
  mlcId: string;
  billId: string;
  billLineId: string;
  depositId: string;
  settlementId: string;
  concessionId: string;
  refundId: string;
  creditNoteId: string;
}

export interface FixturePair {
  runId: string;
  a: Side;
  b: Side;
  planId: string;
  moduleId: string;
  noticeId: string;
  roleId: string;
}

interface Refs {
  planId: string;
  moduleId: string;
  noticeId: string;
  noticeVersion: string;
  roleId: string;
}

const CONNECT_MS = 15_000;

export async function connectRoles(): Promise<DbRoles> {
  const env = dbEnv();
  let last: unknown;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await openRoles(env);
    } catch (err) {
      last = err;
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }
  throw last;
}

async function openRoles(env: ReturnType<typeof dbEnv>): Promise<DbRoles> {
  const app = new pg.Client({ connectionString: env.appUrl, connectionTimeoutMillis: CONNECT_MS });
  const migrator = new pg.Client({ connectionString: env.migrationUrl, connectionTimeoutMillis: CONNECT_MS });
  const admin = new pg.Client({ connectionString: env.adminUrl, connectionTimeoutMillis: CONNECT_MS });
  await app.connect();
  try {
    await migrator.connect();
    await admin.connect();
  } catch (err) {
    await app.end().catch(() => undefined);
    await migrator.end().catch(() => undefined);
    await admin.end().catch(() => undefined);
    throw err;
  }
  return { app, migrator, admin };
}

export async function disconnectRoles(roles: DbRoles | null): Promise<void> {
  if (!roles) return;
  await roles.app.end().catch(() => undefined);
  await roles.migrator.end().catch(() => undefined);
  await roles.admin.end().catch(() => undefined);
}

export async function scopeTenant(client: pg.Client, tenantId: string): Promise<void> {
  await client.query(`select set_config('app.scope', 'tenant', true), set_config('app.tenant_id', $1, true)`, [tenantId]);
}

export async function scopePlatform(client: pg.Client, tenantId = ''): Promise<void> {
  await client.query(`select set_config('app.scope', 'platform', true), set_config('app.tenant_id', $1, true)`, [tenantId]);
}

/** Expected failures must not abort the surrounding transaction. */
export async function expectSqlState(client: pg.Client, text: string, params: unknown[], code: string): Promise<string> {
  const mark = `sp_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  await client.query(`SAVEPOINT ${mark}`);
  try {
    await client.query(text, params);
  } catch (err) {
    await client.query(`ROLLBACK TO SAVEPOINT ${mark}`);
    const actual = (err as { code?: string }).code ?? '';
    const message = (err as Error).message;
    if (actual !== code) {
      throw new Error(`expected SQLSTATE ${code} for [${text}], got ${actual || 'none'}: ${message}`);
    }
    return message;
  }
  await client.query(`ROLLBACK TO SAVEPOINT ${mark}`);
  throw new Error(`expected SQLSTATE ${code} but the statement succeeded: ${text}`);
}

export async function insertPair(migrator: pg.Client): Promise<FixturePair> {
  await migrator.query('BEGIN');
  try {
    const refs = await loadRefs(migrator);
    const runId = randomUUID().slice(0, 8);
    const a = await insertSide(migrator, 'a', runId, refs);
    const b = await insertSide(migrator, 'b', runId, refs);
    await migrator.query('COMMIT');
    return { runId, a, b, planId: refs.planId, moduleId: refs.moduleId, noticeId: refs.noticeId, roleId: refs.roleId };
  } catch (err) {
    await migrator.query('ROLLBACK').catch(() => undefined);
    throw err;
  }
}

async function loadRefs(migrator: pg.Client): Promise<Refs> {
  const plan = await migrator.query<{ id: string }>(`select id from plans where key = 'basic' limit 1`);
  const module = await migrator.query<{ id: string }>(`select id from modules order by sort_order limit 1`);
  const notice = await migrator.query<{ id: string; version: string }>(
    `select id, version from privacy_notices where is_current order by created_at desc limit 1`,
  );
  const role = await migrator.query<{ id: string }>(
    `select id from roles where tenant_id is null and key = 'tenant_admin' limit 1`,
  );
  const planId = plan.rows[0]?.id;
  const moduleId = module.rows[0]?.id;
  const noticeId = notice.rows[0]?.id;
  const noticeVersion = notice.rows[0]?.version;
  const roleId = role.rows[0]?.id;
  if (!planId || !moduleId || !noticeId || !noticeVersion || !roleId) {
    throw new Error('catalogue seed is missing (plan, module, privacy notice or tenant_admin role). Run npm run db:seed.');
  }
  return { planId, moduleId, noticeId, noticeVersion, roleId };
}

async function insertSide(migrator: pg.Client, mark: 'a' | 'b', runId: string, refs: Refs): Promise<Side> {
  const slug = `zz-test-${runId}-${mark}`;
  const state = mark === 'a' ? '27' : '23';
  const city = mark === 'a' ? 'Mumbai' : 'Indore';
  const pin = mark === 'a' ? '400001' : '452001';
  const tenant = await one<{ id: string }>(
    migrator,
    `insert into tenants (slug, legal_name, display_name, facility_type, status)
     values ($1, $2, $3, 'nursing_home', 'onboarding') returning id`,
    [slug, `Fictional Nursing Home ${mark.toUpperCase()}`, `Demo Home ${mark.toUpperCase()}`],
  );
  const location = await one<{ id: string }>(
    migrator,
    `insert into locations (tenant_id, name, code, city, state_code, address_line1, pincode, is_primary)
     values ($1, $2, $3, $4, $5, '1 Demo Marg', $6, true) returning id`,
    [tenant.id, city, mark.toUpperCase(), city, state, pin],
  );
  const department = await one<{ id: string }>(
    migrator,
    `insert into departments (tenant_id, location_id, name) values ($1, $2, 'OPD') returning id`,
    [tenant.id, location.id],
  );
  const doctor = await one<{ id: string }>(
    migrator,
    `insert into doctors (tenant_id, location_id, name, is_sample) values ($1, $2, $3, true) returning id`,
    [tenant.id, location.id, `Dr Fiction ${mark.toUpperCase()}`],
  );
  const user = await one<{ id: string }>(
    migrator,
    `insert into users (tenant_id, email, name, status, designation)
     values ($1, $2, $3, 'active', 'owner') returning id`,
    [tenant.id, `${mark}.${runId}@zz-test.example`, `Owner ${mark.toUpperCase()}`],
  );
  const assignment = await one<{ id: string }>(
    migrator,
    `insert into user_location_roles (tenant_id, user_id, role_id) values ($1, $2, $3) returning id`,
    [tenant.id, user.id, refs.roleId],
  );
  const invitation = await one<{ id: string }>(
    migrator,
    `insert into invitations (tenant_id, user_id, token_hash, status, expires_at)
     values ($1, $2, $3, 'pending', now() + interval '7 days') returning id`,
    [tenant.id, user.id, `invite-${runId}-${mark}-${randomUUID()}`],
  );
  const otp = await one<{ id: string }>(
    migrator,
    `insert into otp_challenges (tenant_id, user_id, purpose, channel, destination, code_hash, expires_at)
     values ($1, $2, 'signup', 'sms', $3, $4, now() + interval '10 minutes') returning id`,
    [tenant.id, user.id, mark === 'a' ? '9000000001' : '9000000002', `otp-${runId}-${mark}`],
  );
  const subscription = await one<{ id: string }>(
    migrator,
    `insert into subscriptions (tenant_id, plan_id, billing_cycle, location_count, status, current_period_start, current_period_end)
     values ($1, $2, 'monthly', 1, 'active', now(), now() + interval '1 month') returning id`,
    [tenant.id, refs.planId],
  );
  const item = await one<{ id: string }>(
    migrator,
    `insert into subscription_items (tenant_id, subscription_id, kind, plan_id, unit_amount_paise, quantity, status)
     values ($1, $2, 'plan', $3, 100, 1, 'active') returning id`,
    [tenant.id, subscription.id, refs.planId],
  );
  const order = await one<{ id: string }>(
    migrator,
    `insert into orders (tenant_id, public_id, purpose, status, amount_paise, quote, idempotency_key)
     values ($1, $2, 'onboarding', 'created', 100, '{}'::jsonb, $3) returning id`,
    [tenant.id, `order_${runId}${mark}`, `zz${runId}${mark}order`],
  );
  const payment = await one<{ id: string }>(
    migrator,
    `insert into payments (tenant_id, order_id, public_id, method, status, amount_paise)
     values ($1, $2, $3, 'upi', 'created', 100) returning id`,
    [tenant.id, order.id, `pay_${runId}${mark}`],
  );
  const invoice = await one<{ id: string }>(
    migrator,
    `insert into invoices (
       tenant_id, number, fy, order_id, payment_id, status, issue_date, supplier, customer,
       place_of_supply_state_code, inter_state, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise
     ) values (
       $1, $2, '2026-27', $3, $4, 'paid', current_date, '{}'::jsonb, '{}'::jsonb,
       $5, $6, 100, 9, 9, 0, 118
     ) returning id`,
    [tenant.id, `Z${runId}${mark}`, order.id, payment.id, state, mark === 'b'],
  );
  const line = await one<{ id: string }>(
    migrator,
    `insert into invoice_lines (tenant_id, invoice_id, description, unit_paise, amount_paise, gst_rate_bp, cgst_paise, sgst_paise, igst_paise)
     values ($1, $2, 'Sample line', 100, 100, 1800, 9, 9, 0) returning id`,
    [tenant.id, invoice.id],
  );
  const override = await one<{ id: string }>(
    migrator,
    `insert into tenant_entitlement_overrides (tenant_id, target, module_id, effect)
     values ($1, 'module', $2, 'grant') returning id`,
    [tenant.id, refs.moduleId],
  );
  const consent = await one<{ id: string }>(
    migrator,
    `insert into consents (tenant_id, user_id, notice_id, notice_version, purposes, terms_accepted)
     values ($1, $2, $3, $4, '["account_management"]'::jsonb, true) returning id`,
    [tenant.id, user.id, refs.noticeId, refs.noticeVersion],
  );
  const request = await one<{ id: string }>(
    migrator,
    `insert into data_principal_requests (tenant_id, type, principal_name, principal_contact, details, due_at)
     values ($1, 'access', 'Fictional Patient', $2, 'Sample request for a test', now() + interval '30 days') returning id`,
    [tenant.id, `${mark}.${runId}@zz-test.example`],
  );
  const checklistKey = `zz${runId}${mark}`;
  await migrator.query(`insert into checklist_items (tenant_id, key) values ($1, $2)`, [tenant.id, checklistKey]);
  const outbox = await one<{ id: string }>(
    migrator,
    `insert into outbox_messages (tenant_id, channel, recipient, body, template)
     values ($1, 'sms', $2, 'Sample', 'test') returning id`,
    [tenant.id, mark === 'a' ? '9000000001' : '9000000002'],
  );
  const idemKey = `zz${runId}${mark}idem`;
  await migrator.query(
    `insert into idempotency_keys (tenant_id, scope, key, request_hash, expires_at)
     values ($1, 'POST /test', $2, 'hash', now() + interval '1 day')`,
    [tenant.id, idemKey],
  );
  const series = await one<{ id: string }>(
    migrator,
    `insert into number_series (tenant_id, series_key, period, last_no) values ($1, 'iso', '', 1) returning id`,
    [tenant.id],
  );
  const patient = await one<{ id: string }>(
    migrator,
    `insert into patients (tenant_id, uhid, first_name, gender, is_sample, mobile)
     values ($1, $2, 'Fiction', 'other', true, '9000000099') returning id`,
    [tenant.id, `DEMO-${mark}-${runId}`],
  );
  const alert = await one<{ id: string }>(
    migrator,
    `insert into patient_alerts (tenant_id, patient_id, kind, text) values ($1, $2, 'alert', 'Sample') returning id`,
    [tenant.id, patient.id],
  );
  const service = await one<{ id: string }>(
    migrator,
    `insert into services (tenant_id, code, name, category) values ($1, $2, 'Sample service', 'misc') returning id`,
    [tenant.id, `ZZ${mark}${runId}`],
  );
  const tariff = await one<{ id: string }>(
    migrator,
    `insert into tariffs (tenant_id, service_id, price_paise, effective_from) values ($1, $2, 100, current_date) returning id`,
    [tenant.id, service.id],
  );
  const encounter = await one<{ id: string }>(
    migrator,
    `insert into encounters (tenant_id, location_id, patient_id, kind, number)
     values ($1, $2, $3, 'opd', $4) returning id`,
    [tenant.id, location.id, patient.id, `ZV${runId}${mark}`],
  );
  const clinicalOrder = await one<{ id: string }>(
    migrator,
    `insert into clinical_orders (tenant_id, location_id, encounter_id, patient_id, kind, number, source)
     values ($1, $2, $3, $4, 'medicine', $5, 'opd') returning id`,
    [tenant.id, location.id, encounter.id, patient.id, `ZO${runId}${mark}`],
  );
  const orderItem = await one<{ id: string }>(
    migrator,
    `insert into clinical_order_items (tenant_id, order_id, line_no, drug_name) values ($1, $2, 1, 'Sample') returning id`,
    [tenant.id, clinicalOrder.id],
  );
  const vital = await one<{ id: string }>(
    migrator,
    `insert into vital_signs (tenant_id, location_id, encounter_id, patient_id, pulse) values ($1, $2, $3, $4, 70) returning id`,
    [tenant.id, location.id, encounter.id, patient.id],
  );
  const note = await one<{ id: string }>(
    migrator,
    `insert into clinical_notes (tenant_id, encounter_id, patient_id, kind, body)
     values ($1, $2, $3, 'chief_complaint', 'Sample') returning id`,
    [tenant.id, encounter.id, patient.id],
  );
  const charge = await one<{ id: string }>(
    migrator,
    `insert into charges (
       tenant_id, location_id, encounter_id, patient_id, service_id, description, qty,
       unit_price_paise, amount_paise, gst_treatment, service_date, source_module, source_type, source_id
     ) values (
       $1, $2, $3, $4, $5, 'Sample', 1, 100, 100, 'exempt_healthcare', current_date, 'opd', 'fixture', $3
     ) returning id`,
    [tenant.id, location.id, encounter.id, patient.id, service.id],
  );
  const cash = await one<{ id: string }>(
    migrator,
    `insert into cash_ledger (
       tenant_id, location_id, entry_type, direction, mode, amount_paise, number, patient_id, encounter_id, ref_type, ref_id
     ) values ($1, $2, 'receipt', 'in', 'cash', 100, $3, $4, $5, 'bill', $5) returning id`,
    [tenant.id, location.id, `ZC${runId}${mark}`, patient.id, encounter.id],
  );
  const document = await one<{ id: string }>(
    migrator,
    `insert into patient_documents (tenant_id, patient_id, kind, file_path, mime, size)
     values ($1, $2, 'Consent', 'nope.pdf', 'application/pdf', 1) returning id`,
    [tenant.id, patient.id],
  );
  const mlc = await one<{ id: string }>(
    migrator,
    `insert into mlc_cases (tenant_id, patient_id, encounter_id, number, injury_summary)
     values ($1, $2, $3, $4, 'Fixture MLC') returning id`,
    [tenant.id, patient.id, encounter.id, `ZML${runId}${mark}`],
  );
  const bill = await one<{ id: string }>(
    migrator,
    `insert into bills (
       tenant_id, location_id, patient_id, encounter_id, kind, number, doc_type, status, pay_class,
       subtotal_paise, discount_paise, cgst_paise, sgst_paise, igst_paise, round_off_paise, total_paise, paid_paise
     ) values (
       $1, $2, $3, $4, 'op', $5, 'bill_of_supply', 'final', 'cash',
       100, 0, 0, 0, 0, 0, 100, 100
     ) returning id`,
    [tenant.id, location.id, patient.id, encounter.id, `OB${runId}${mark}`],
  );
  const billLine = await one<{ id: string }>(
    migrator,
    `insert into bill_lines (
       tenant_id, bill_id, charge_id, line_no, description, qty, unit_price_paise, amount_paise,
       discount_paise, bill_discount_paise, taxable_paise, gst_treatment, service_date
     ) values (
       $1, $2, $3, 1, 'Sample consultation', 1, 100, 100, 0, 0, 100, 'exempt_healthcare', current_date
     ) returning id`,
    [tenant.id, bill.id, charge.id],
  );
  const deposit = await one<{ id: string }>(
    migrator,
    `insert into deposits (tenant_id, location_id, patient_id, number, amount_paise, balance_paise, mode, status)
     values ($1, $2, $3, $4, 100, 100, 'cash', 'open') returning id`,
    [tenant.id, location.id, patient.id, `DP${runId}${mark}`],
  );
  const settlement = await one<{ id: string }>(
    migrator,
    `insert into bill_settlements (tenant_id, bill_id, mode, amount_paise, instrument_ref)
     values ($1, $2, 'cash', 100, 'Sample') returning id`,
    [tenant.id, bill.id],
  );
  const concession = await one<{ id: string }>(
    migrator,
    `insert into concessions (tenant_id, bill_id, amount_paise, reason, status)
     values ($1, $2, 100, 'Sample concession', 'requested') returning id`,
    [tenant.id, bill.id],
  );
  const refund = await one<{ id: string }>(
    migrator,
    `insert into refunds (tenant_id, bill_id, number, amount_paise, reason, mode)
     values ($1, $2, $3, 100, 'Sample refund', 'cash') returning id`,
    [tenant.id, bill.id, `RF${runId}${mark}`],
  );
  const creditNote = await one<{ id: string }>(
    migrator,
    `insert into bill_credit_notes (tenant_id, bill_id, refund_id, number, amount_paise, reason, status)
     values ($1, $2, $3, $4, 100, 'Sample credit note', 'issued') returning id`,
    [tenant.id, bill.id, refund.id, `CN${runId}${mark}`],
  );
  return {
    id: tenant.id,
    locationId: location.id,
    departmentId: department.id,
    doctorId: doctor.id,
    userId: user.id,
    assignmentId: assignment.id,
    invitationId: invitation.id,
    otpId: otp.id,
    subscriptionId: subscription.id,
    itemId: item.id,
    orderId: order.id,
    paymentId: payment.id,
    invoiceId: invoice.id,
    lineId: line.id,
    overrideId: override.id,
    consentId: consent.id,
    requestId: request.id,
    checklistKey,
    outboxId: outbox.id,
    idemKey,
    seriesId: series.id,
    patientId: patient.id,
    alertId: alert.id,
    documentId: document.id,
    serviceId: service.id,
    tariffId: tariff.id,
    encounterId: encounter.id,
    clinicalOrderId: clinicalOrder.id,
    orderItemId: orderItem.id,
    vitalId: vital.id,
    noteId: note.id,
    chargeId: charge.id,
    cashId: cash.id,
    mlcId: mlc.id,
    billId: bill.id,
    billLineId: billLine.id,
    depositId: deposit.id,
    settlementId: settlement.id,
    concessionId: concession.id,
    refundId: refund.id,
    creditNoteId: creditNote.id,
  };
}

export async function deletePair(admin: pg.Client, pair: FixturePair | null): Promise<void> {
  if (!pair) return;
  const ids = [pair.a.id, pair.b.id];
  const steps = [
    `delete from bill_credit_notes where tenant_id = any($1::uuid[])`,
    `delete from refunds where tenant_id = any($1::uuid[])`,
    `delete from concessions where tenant_id = any($1::uuid[])`,
    `delete from bill_settlements where tenant_id = any($1::uuid[])`,
    `delete from bill_lines where tenant_id = any($1::uuid[])`,
    `delete from deposits where tenant_id = any($1::uuid[])`,
    `delete from bills where tenant_id = any($1::uuid[])`,
    `delete from cash_ledger where tenant_id = any($1::uuid[])`,
    `delete from charges where tenant_id = any($1::uuid[])`,
    `delete from clinical_order_items where tenant_id = any($1::uuid[])`,
    `delete from clinical_orders where tenant_id = any($1::uuid[])`,
    `delete from vital_signs where tenant_id = any($1::uuid[])`,
    `delete from clinical_notes where tenant_id = any($1::uuid[])`,
    `delete from patient_alerts where tenant_id = any($1::uuid[])`,
    `delete from patient_documents where tenant_id = any($1::uuid[])`,
    `delete from mlc_cases where tenant_id = any($1::uuid[])`,
    `delete from encounters where tenant_id = any($1::uuid[])`,
    `delete from tariffs where tenant_id = any($1::uuid[])`,
    `delete from services where tenant_id = any($1::uuid[])`,
    `delete from patients where tenant_id = any($1::uuid[])`,
    `delete from number_series where tenant_id = any($1::uuid[])`,
    `delete from sessions where tenant_id = any($1::uuid[]) or user_id in (select id from users where tenant_id = any($1::uuid[]))`,
    `delete from invoice_lines where tenant_id = any($1::uuid[])`,
    `delete from invoices where tenant_id = any($1::uuid[])`,
    `delete from payments where tenant_id = any($1::uuid[])`,
    `delete from orders where tenant_id = any($1::uuid[])`,
    `delete from subscription_items where tenant_id = any($1::uuid[])`,
    `delete from subscriptions where tenant_id = any($1::uuid[])`,
    `delete from idempotency_keys where tenant_id = any($1::uuid[])`,
    `delete from outbox_messages where tenant_id = any($1::uuid[])`,
    `delete from checklist_items where tenant_id = any($1::uuid[])`,
    `delete from data_principal_requests where tenant_id = any($1::uuid[])`,
    `delete from consents where tenant_id = any($1::uuid[])`,
    `delete from otp_challenges where tenant_id = any($1::uuid[])`,
    `delete from invitations where tenant_id = any($1::uuid[])`,
    `delete from user_location_roles where tenant_id = any($1::uuid[])`,
    `delete from doctors where tenant_id = any($1::uuid[])`,
    `delete from departments where tenant_id = any($1::uuid[])`,
    `delete from tenant_entitlement_overrides where tenant_id = any($1::uuid[])`,
    `delete from locations where tenant_id = any($1::uuid[])`,
    `delete from users where tenant_id = any($1::uuid[])`,
    `delete from tenants where id = any($1::uuid[])`,
  ];
  await admin.query('BEGIN');
  try {
    // Append-only guards block even the superuser. Disable them only for this cleanup transaction.
    await admin.query('alter table vital_signs disable trigger vital_signs_guard');
    await admin.query('alter table clinical_notes disable trigger clinical_notes_guard');
    for (const text of steps) await admin.query(text, [ids]);
    await admin.query('alter table vital_signs enable trigger vital_signs_guard');
    await admin.query('alter table clinical_notes enable trigger clinical_notes_guard');
    await admin.query('COMMIT');
  } catch (err) {
    await admin.query('ROLLBACK').catch(() => undefined);
    throw err;
  }
}

async function one<T extends pg.QueryResultRow>(client: pg.Client, text: string, params: unknown[]): Promise<T> {
  const result = await client.query<T>(text, params);
  const row = result.rows[0];
  if (!row) throw new Error(`insert returned no row: ${text}`);
  return row;
}
