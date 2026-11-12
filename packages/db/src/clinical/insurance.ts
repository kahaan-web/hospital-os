// MVP demo slice: Insurance / TPA. SQL lives in migration 1100. Do not drizzle-kit generate.
import { sql } from 'drizzle-orm';
import { bigint, boolean, check, foreignKey, index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { tenants } from '../schema';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const insurancePayers = pgTable(
  'insurance_payers',
  {
    id: id(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    payerType: text('payer_type').notNull().default('insurer'),
    copayPct: integer('copay_pct').notNull().default(0),
    creditDays: integer('credit_days').notNull().default(30),
    active: boolean('active').notNull().default(true),
    isSample: boolean('is_sample').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('insurance_payers_tenant_id_uq').on(t.tenantId, t.id),
    unique('insurance_payers_name_uq').on(t.tenantId, t.name),
    check('insurance_payers_type_chk', sql`payer_type in ('insurer', 'tpa', 'corporate', 'government')`),
    check('insurance_payers_copay_chk', sql`copay_pct between 0 and 100`),
    check('insurance_payers_credit_chk', sql`credit_days >= 0`),
  ],
);

export const insuranceRequests = pgTable(
  'insurance_requests',
  {
    id: id(),
    tenantId: tenantId(),
    payerId: uuid('payer_id').notNull(),
    kind: text('kind').notNull().default('preauth'),
    patientName: text('patient_name').notNull(),
    uhid: text('uhid').notNull().default(''),
    policyNo: text('policy_no').notNull().default(''),
    diagnosis: text('diagnosis').notNull().default(''),
    estimatedPaise: bigint('estimated_paise', { mode: 'number' }).notNull().default(0),
    approvedPaise: bigint('approved_paise', { mode: 'number' }),
    status: text('status').notNull().default('submitted'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decidedBy: uuid('decided_by'),
    rejectReason: text('reject_reason').notNull().default(''),
    isSample: boolean('is_sample').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('insurance_requests_tenant_id_uq').on(t.tenantId, t.id),
    index('insurance_requests_status_idx').on(t.tenantId, t.status, t.createdAt),
    foreignKey({ columns: [t.tenantId, t.payerId], foreignColumns: [insurancePayers.tenantId, insurancePayers.id], name: 'insurance_requests_payer_fk' }),
    check('insurance_requests_kind_chk', sql`kind in ('preauth', 'claim')`),
    check('insurance_requests_status_chk', sql`status in ('draft', 'submitted', 'approved', 'rejected')`),
  ],
);
