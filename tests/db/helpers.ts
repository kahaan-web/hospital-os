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
  /** Login that may hold platform scope. Successful platform writes use this client. */
  platform: pg.Client;
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
  creditNoteId: string;
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
  scheduleId: string;
  exceptionId: string;
  appointmentId: string;
  queueId: string;
  /** Second encounter so an opd_queue insert does not collide with the fixture row. */
  spareEncounterId: string;
  mlcId: string;
  pharmacyItemId: string;
  pharmacySupplierId: string;
  pharmacyBatchId: string;
  pharmacyStockId: string;
  pharmacyMoveId: string;
  pharmacyGrnId: string;
  pharmacyGrnLineId: string;
  pharmacySaleId: string;
  pharmacySaleLineId: string;
  pharmacySaleReturnId: string;
  pharmacySaleReturnLineId: string;
  pharmacyIpIssueId: string;
  pharmacyIpIssueLineId: string;
  pharmacyAdjustmentId: string;
  pharmacyAdjustmentLineId: string;
  pharmacySupplierReturnId: string;
  pharmacySupplierReturnLineId: string;
  wardId: string;
  roomId: string;
  bedId: string;
  admissionId: string;
  bedAssignmentId: string;
  admissionRequestId: string;
  summaryId: string;
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
  const platform = new pg.Client({ connectionString: env.platformUrl, connectionTimeoutMillis: CONNECT_MS });
  const migrator = new pg.Client({ connectionString: env.migrationUrl, connectionTimeoutMillis: CONNECT_MS });
  const admin = new pg.Client({ connectionString: env.adminUrl, connectionTimeoutMillis: CONNECT_MS });
  const clients = [app, platform, migrator, admin];
  try {
    for (const client of clients) await client.connect();
  } catch (err) {
    await Promise.all(clients.map((client) => client.end().catch(() => undefined)));
    throw err;
  }
  return { app, platform, migrator, admin };
}

export async function disconnectRoles(roles: DbRoles | null): Promise<void> {
  if (!roles) return;
  await roles.app.end().catch(() => undefined);
  await roles.platform.end().catch(() => undefined);
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

/**
 * Cross-tenant UPDATE/DELETE. RLS hiding the row (0 rows) is a pass.
 * Permission denied or the immutability trigger (both SQLSTATE 42501) is also a pass.
 * A write that touches a row is not.
 */
export async function expectHiddenWrite(client: pg.Client, text: string, params: unknown[]): Promise<void> {
  const mark = `sp_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  await client.query(`SAVEPOINT ${mark}`);
  try {
    const result = await client.query(text, params);
    await client.query(`RELEASE SAVEPOINT ${mark}`);
    if ((result.rowCount ?? 0) !== 0) {
      throw new Error(`expected 0 rows or SQLSTATE 42501 for [${text}], updated ${result.rowCount}`);
    }
  } catch (err) {
    const actual = (err as { code?: string }).code;
    if (!actual) throw err;
    await client.query(`ROLLBACK TO SAVEPOINT ${mark}`);
    if (actual !== '42501') {
      throw new Error(`expected 0 rows or SQLSTATE 42501 for [${text}], got ${actual}: ${(err as Error).message}`);
    }
  }
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
  const creditNote = await one<{ id: string }>(
    migrator,
    `insert into credit_notes (tenant_id, invoice_id, number, reason, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise)
     values ($1, $2, $3, 'Sample credit', 100, 9, 9, 0, 118) returning id`,
    [tenant.id, invoice.id, `C${runId}${mark}`],
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
  const spareEncounter = mark === 'b'
    ? await one<{ id: string }>(
      migrator,
      `insert into encounters (tenant_id, location_id, patient_id, kind, number)
       values ($1, $2, $3, 'opd', $4) returning id`,
      [tenant.id, location.id, patient.id, `ZS${runId}${mark}`],
    )
    : encounter;
  const schedule = await one<{ id: string }>(
    migrator,
    `insert into doctor_schedules (
       tenant_id, doctor_id, location_id, weekday, start_time, end_time, slot_minutes, max_per_slot, is_sample
     ) values ($1, $2, $3, 1, '09:00', '12:00', 15, 2, true) returning id`,
    [tenant.id, doctor.id, location.id],
  );
  const exception = await one<{ id: string }>(
    migrator,
    `insert into schedule_exceptions (tenant_id, doctor_id, location_id, on_date, kind, reason, is_sample)
     values ($1, $2, $3, '2026-01-26', 'closed', 'Sample', true) returning id`,
    [tenant.id, doctor.id, location.id],
  );
  const appointment = await one<{ id: string }>(
    migrator,
    `insert into appointments (
       tenant_id, location_id, patient_id, doctor_id, date, slot_start, slot_end, seq, channel, status, reason, is_sample
     ) values ($1, $2, $3, $4, '2026-06-01', '09:00', '09:15', 1, 'counter', 'booked', 'Sample', true) returning id`,
    [tenant.id, location.id, patient.id, doctor.id],
  );
  const queue = await one<{ id: string }>(
    migrator,
    `insert into opd_queue (
       tenant_id, location_id, encounter_id, patient_id, doctor_id, token, status, visit_date, is_sample
     ) values ($1, $2, $3, $4, $5, 1, 'waiting', current_date, true) returning id`,
    [tenant.id, location.id, encounter.id, patient.id, doctor.id],
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
  const pharmacySupplier = await one<{ id: string }>(
    migrator,
    `insert into pharmacy_suppliers (tenant_id, name) values ($1, 'Nope Pharma (Sample)') returning id`,
    [tenant.id],
  );
  const pharmacyItem = await one<{ id: string }>(
    migrator,
    `insert into pharmacy_items (tenant_id, generic_code, brand, form, strength, hsn, gst_rate_bp, schedule)
     values ($1, 'PARACETAMOL', 'Nope', 'tablet', '500 mg', '3004', 1200, 'OTC') returning id`,
    [tenant.id],
  );
  const pharmacyBatch = await one<{ id: string }>(
    migrator,
    `insert into pharmacy_batches (tenant_id, item_id, supplier_id, batch_no, expiry, mrp_paise, purchase_rate_paise)
     values ($1, $2, $3, 'B1', current_date + 30, 100, 50) returning id`,
    [tenant.id, pharmacyItem.id, pharmacySupplier.id],
  );
  const pharmacyStock = await one<{ id: string }>(
    migrator,
    `insert into pharmacy_stock (tenant_id, batch_id, location_id, qty) values ($1, $2, $3, 1) returning id`,
    [tenant.id, pharmacyBatch.id, location.id],
  );
  const pharmacyMove = await one<{ id: string }>(
    migrator,
    `insert into pharmacy_stock_moves (tenant_id, batch_id, location_id, qty, move_type, ref_type, ref_id)
     values ($1, $2, $3, 1, 'adjustment', 'fixture', $2) returning id`,
    [tenant.id, pharmacyBatch.id, location.id],
  );
  const pharmacyGrn = await one<{ id: string }>(
    migrator,
    `insert into pharmacy_grns (tenant_id, location_id, supplier_id, number) values ($1, $2, $3, $4) returning id`,
    [tenant.id, location.id, pharmacySupplier.id, `ZGR${runId}${mark}`],
  );
  const pharmacyGrnLine = await one<{ id: string }>(
    migrator,
    `insert into pharmacy_grn_lines (tenant_id, grn_id, line_no, item_id, batch_id, qty, mrp_paise, purchase_rate_paise, gst_rate_bp)
     values ($1, $2, 1, $3, $4, 1, 100, 50, 1200) returning id`,
    [tenant.id, pharmacyGrn.id, pharmacyItem.id, pharmacyBatch.id],
  );
  const pharmacySale = await one<{ id: string }>(
    migrator,
    `insert into pharmacy_sales (tenant_id, location_id, kind, number, mode, doc_type, gross_paise, taxable_paise, cgst_paise, sgst_paise, total_paise)
     values ($1, $2, 'outside', $3, 'cash', 'tax_invoice', 100, 100, 0, 0, 100) returning id`,
    [tenant.id, location.id, `ZPS${runId}${mark}`],
  );
  const pharmacySaleLine = await one<{ id: string }>(
    migrator,
    `insert into pharmacy_sale_lines (tenant_id, sale_id, line_no, item_id, batch_id, qty, mrp_paise, gst_rate_bp, gross_paise, taxable_paise, tax_paise)
     values ($1, $2, 1, $3, $4, 1, 100, 0, 100, 100, 0) returning id`,
    [tenant.id, pharmacySale.id, pharmacyItem.id, pharmacyBatch.id],
  );
  const pharmacySaleReturn = await one<{ id: string }>(
    migrator,
    `insert into pharmacy_sale_returns (tenant_id, location_id, sale_id, number, reason, gross_paise, taxable_paise, tax_paise)
     values ($1, $2, $3, $4, 'Nope', 0, 0, 0) returning id`,
    [tenant.id, location.id, pharmacySale.id, `ZPR${runId}${mark}`],
  );
  const pharmacySaleReturnLine = await one<{ id: string }>(
    migrator,
    `insert into pharmacy_sale_return_lines (tenant_id, return_id, line_no, sale_line_id, batch_id, qty, gross_paise, taxable_paise, tax_paise)
     values ($1, $2, 1, $3, $4, 1, 0, 0, 0) returning id`,
    [tenant.id, pharmacySaleReturn.id, pharmacySaleLine.id, pharmacyBatch.id],
  );
  const pharmacyIpIssue = await one<{ id: string }>(
    migrator,
    `insert into pharmacy_ip_issues (tenant_id, location_id, encounter_id, patient_id, number) values ($1, $2, $3, $4, $5) returning id`,
    [tenant.id, location.id, encounter.id, patient.id, `ZPI${runId}${mark}`],
  );
  const pharmacyIpIssueLine = await one<{ id: string }>(
    migrator,
    `insert into pharmacy_ip_issue_lines (tenant_id, issue_id, line_no, item_id, batch_id, qty, mrp_paise)
     values ($1, $2, 1, $3, $4, 1, 100) returning id`,
    [tenant.id, pharmacyIpIssue.id, pharmacyItem.id, pharmacyBatch.id],
  );
  const pharmacyAdjustment = await one<{ id: string }>(
    migrator,
    `insert into pharmacy_adjustments (tenant_id, location_id, number, reason) values ($1, $2, $3, 'Nope') returning id`,
    [tenant.id, location.id, `ZAJ${runId}${mark}`],
  );
  const pharmacyAdjustmentLine = await one<{ id: string }>(
    migrator,
    `insert into pharmacy_adjustment_lines (tenant_id, adjustment_id, line_no, batch_id, qty_delta) values ($1, $2, 1, $3, 1) returning id`,
    [tenant.id, pharmacyAdjustment.id, pharmacyBatch.id],
  );
  const pharmacySupplierReturn = await one<{ id: string }>(
    migrator,
    `insert into pharmacy_supplier_returns (tenant_id, location_id, supplier_id, number, reason) values ($1, $2, $3, $4, 'Nope') returning id`,
    [tenant.id, location.id, pharmacySupplier.id, `ZSR${runId}${mark}`],
  );
  const pharmacySupplierReturnLine = await one<{ id: string }>(
    migrator,
    `insert into pharmacy_supplier_return_lines (tenant_id, return_id, line_no, batch_id, qty) values ($1, $2, 1, $3, 1) returning id`,
    [tenant.id, pharmacySupplierReturn.id, pharmacyBatch.id],
  );
  const ward = await one<{ id: string }>(
    migrator,
    `insert into wards (tenant_id, location_id, code, name, ward_type)
     values ($1, $2, $3, 'Sample ward', 'general') returning id`,
    [tenant.id, location.id, `W${mark}`],
  );
  const room = await one<{ id: string }>(
    migrator,
    `insert into rooms (tenant_id, ward_id, code, name) values ($1, $2, 'R1', 'Sample room') returning id`,
    [tenant.id, ward.id],
  );
  const bed = await one<{ id: string }>(
    migrator,
    `insert into beds (tenant_id, room_id, label, ward_class) values ($1, $2, 'B1', 'general') returning id`,
    [tenant.id, room.id],
  );
  const admission = await one<{ id: string }>(
    migrator,
    `insert into admissions (tenant_id, location_id, encounter_id, patient_id, doctor_id, number, admission_type, attendant)
     values ($1, $2, $3, $4, $5, $6, 'elective', 'Sample') returning id`,
    [tenant.id, location.id, encounter.id, patient.id, doctor.id, `ZA${runId}${mark}`],
  );
  const bedAssignment = await one<{ id: string }>(
    migrator,
    `insert into bed_assignments (tenant_id, admission_id, bed_id) values ($1, $2, $3) returning id`,
    [tenant.id, admission.id, bed.id],
  );
  const admissionRequest = await one<{ id: string }>(
    migrator,
    `insert into admission_requests (tenant_id, location_id, patient_id, from_encounter_id, doctor_id, reason, planned_on)
     values ($1, $2, $3, $4, $5, 'Sample request', current_date) returning id`,
    [tenant.id, location.id, patient.id, encounter.id, doctor.id],
  );
  const summary = await one<{ id: string }>(
    migrator,
    `insert into discharge_summaries (tenant_id, admission_id, sections)
     values ($1, $2, '{"diagnosis":"Sample"}'::jsonb) returning id`,
    [tenant.id, admission.id],
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
    creditNoteId: creditNote.id,
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
    scheduleId: schedule.id,
    exceptionId: exception.id,
    appointmentId: appointment.id,
    queueId: queue.id,
    spareEncounterId: spareEncounter.id,
    mlcId: mlc.id,
    pharmacyItemId: pharmacyItem.id,
    pharmacySupplierId: pharmacySupplier.id,
    pharmacyBatchId: pharmacyBatch.id,
    pharmacyStockId: pharmacyStock.id,
    pharmacyMoveId: pharmacyMove.id,
    pharmacyGrnId: pharmacyGrn.id,
    pharmacyGrnLineId: pharmacyGrnLine.id,
    pharmacySaleId: pharmacySale.id,
    pharmacySaleLineId: pharmacySaleLine.id,
    pharmacySaleReturnId: pharmacySaleReturn.id,
    pharmacySaleReturnLineId: pharmacySaleReturnLine.id,
    pharmacyIpIssueId: pharmacyIpIssue.id,
    pharmacyIpIssueLineId: pharmacyIpIssueLine.id,
    pharmacyAdjustmentId: pharmacyAdjustment.id,
    pharmacyAdjustmentLineId: pharmacyAdjustmentLine.id,
    pharmacySupplierReturnId: pharmacySupplierReturn.id,
    pharmacySupplierReturnLineId: pharmacySupplierReturnLine.id,
    wardId: ward.id,
    roomId: room.id,
    bedId: bed.id,
    admissionId: admission.id,
    bedAssignmentId: bedAssignment.id,
    admissionRequestId: admissionRequest.id,
    summaryId: summary.id,
  };
}

export async function deletePair(admin: pg.Client, pair: FixturePair | null): Promise<void> {
  if (!pair) return;
  const ids = [pair.a.id, pair.b.id];
  // Immutability triggers fire for the superuser too. Disable them only for this
  // transaction, then turn them back on before commit (DDL rolls back with the tx).
  const guarded = ['credit_notes', 'invoice_lines', 'invoices', 'vital_signs', 'clinical_notes', 'pharmacy_stock_moves'];
  const steps = [
    `delete from pharmacy_stock_moves where tenant_id = any($1::uuid[])`,
    `delete from pharmacy_supplier_return_lines where tenant_id = any($1::uuid[])`,
    `delete from pharmacy_supplier_returns where tenant_id = any($1::uuid[])`,
    `delete from pharmacy_adjustment_lines where tenant_id = any($1::uuid[])`,
    `delete from pharmacy_adjustments where tenant_id = any($1::uuid[])`,
    `delete from pharmacy_ip_issue_lines where tenant_id = any($1::uuid[])`,
    `delete from pharmacy_ip_issues where tenant_id = any($1::uuid[])`,
    `delete from pharmacy_sale_return_lines where tenant_id = any($1::uuid[])`,
    `delete from pharmacy_sale_returns where tenant_id = any($1::uuid[])`,
    `delete from pharmacy_sale_lines where tenant_id = any($1::uuid[])`,
    `delete from pharmacy_sales where tenant_id = any($1::uuid[])`,
    `delete from pharmacy_grn_lines where tenant_id = any($1::uuid[])`,
    `delete from pharmacy_grns where tenant_id = any($1::uuid[])`,
    `delete from pharmacy_stock where tenant_id = any($1::uuid[])`,
    `delete from pharmacy_batches where tenant_id = any($1::uuid[])`,
    `delete from pharmacy_items where tenant_id = any($1::uuid[])`,
    `delete from pharmacy_suppliers where tenant_id = any($1::uuid[])`,
    `delete from discharge_summaries where tenant_id = any($1::uuid[])`,
    `delete from admission_requests where tenant_id = any($1::uuid[])`,
    `delete from bed_assignments where tenant_id = any($1::uuid[])`,
    `delete from admissions where tenant_id = any($1::uuid[])`,
    `delete from beds where tenant_id = any($1::uuid[])`,
    `delete from rooms where tenant_id = any($1::uuid[])`,
    `delete from wards where tenant_id = any($1::uuid[])`,
    `delete from opd_queue where tenant_id = any($1::uuid[])`,
    `delete from appointments where tenant_id = any($1::uuid[])`,
    `delete from schedule_exceptions where tenant_id = any($1::uuid[])`,
    `delete from doctor_schedules where tenant_id = any($1::uuid[])`,
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
    `delete from credit_notes where tenant_id = any($1::uuid[])`,
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
    // Immutability and append-only guards fire for the superuser too. Disable user triggers
    // (credit notes, invoices, vitals, clinical notes) only for this cleanup transaction.
    for (const table of guarded) await admin.query(`alter table ${table} disable trigger user`);
    for (const text of steps) await admin.query(text, [ids]);
    for (const table of guarded) await admin.query(`alter table ${table} enable trigger user`);
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
