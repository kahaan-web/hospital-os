// MVP demo slice: Doctors Accounting. SQL lives in migration 1120. Do not drizzle-kit generate.
import { sql } from 'drizzle-orm';
import { bigint, boolean, check, date, foreignKey, index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { doctors, tenants } from '../schema';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const doctorShareRules = pgTable(
  'doctor_share_rules',
  {
    id: id(),
    tenantId: tenantId(),
    doctorId: uuid('doctor_id').notNull(),
    serviceCategory: text('service_category').notNull().default('all'),
    encounterType: text('encounter_type').notNull().default('any'),
    shareType: text('share_type').notNull().default('pct_net'),
    shareValue: integer('share_value').notNull(),
    effectiveFrom: date('effective_from').notNull().default(sql`current_date`),
    active: boolean('active').notNull().default(true),
    isSample: boolean('is_sample').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('doctor_share_rules_tenant_id_uq').on(t.tenantId, t.id),
    index('doctor_share_rules_doctor_idx').on(t.tenantId, t.doctorId),
    foreignKey({ columns: [t.tenantId, t.doctorId], foreignColumns: [doctors.tenantId, doctors.id], name: 'doctor_share_rules_doctor_fk' }),
    check('doctor_share_rules_enc_chk', sql`encounter_type in ('op', 'ip', 'any')`),
    check('doctor_share_rules_type_chk', sql`share_type in ('pct_net', 'pct_gross', 'fixed_per_unit')`),
    check('doctor_share_rules_value_chk', sql`share_value >= 0 and (share_type = 'fixed_per_unit' or share_value <= 100)`),
  ],
);

export const doctorPayouts = pgTable(
  'doctor_payouts',
  {
    id: id(),
    tenantId: tenantId(),
    doctorId: uuid('doctor_id').notNull(),
    periodFrom: date('period_from').notNull(),
    periodTo: date('period_to').notNull(),
    grossPaise: bigint('gross_paise', { mode: 'number' }).notNull().default(0),
    sharePaise: bigint('share_paise', { mode: 'number' }).notNull().default(0),
    status: text('status').notNull().default('pending'),
    paidOn: date('paid_on'),
    payMode: text('pay_mode').notNull().default(''),
    payRef: text('pay_ref').notNull().default(''),
    paidBy: uuid('paid_by'),
    isSample: boolean('is_sample').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('doctor_payouts_tenant_id_uq').on(t.tenantId, t.id),
    index('doctor_payouts_doctor_idx').on(t.tenantId, t.doctorId, t.periodFrom),
    foreignKey({ columns: [t.tenantId, t.doctorId], foreignColumns: [doctors.tenantId, doctors.id], name: 'doctor_payouts_doctor_fk' }),
    check('doctor_payouts_status_chk', sql`status in ('pending', 'paid')`),
    check('doctor_payouts_period_chk', sql`period_to >= period_from`),
    check('doctor_payouts_amount_chk', sql`gross_paise >= 0 and share_paise >= 0`),
  ],
);
