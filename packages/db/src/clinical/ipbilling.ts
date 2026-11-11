import { sql } from 'drizzle-orm';
import { bigint, boolean, check, foreignKey, index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { tenants } from '../schema';
import { encounters } from './foundation';
import { bills } from './billing';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const payers = pgTable(
  'payers',
  {
    id: id(),
    tenantId: tenantId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    gstin: text('gstin').notNull().default(''),
    stateCode: text('state_code').notNull().default(''),
    creditDays: integer('credit_days').notNull().default(0),
    active: boolean('active').notNull().default(true),
    isSample: boolean('is_sample').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('payers_tenant_id_uq').on(t.tenantId, t.id),
    unique('payers_code_uq').on(t.tenantId, t.code),
    index('payers_name_idx').on(t.tenantId, sql`lower(${t.name})`),
    check('payers_kind_chk', sql`kind in ('tpa', 'insurer', 'corporate', 'scheme')`),
  ],
);

export const encounterPayers = pgTable(
  'encounter_payers',
  {
    id: id(),
    tenantId: tenantId(),
    encounterId: uuid('encounter_id').notNull(),
    payerId: uuid('payer_id').notNull(),
    policyNo: text('policy_no').notNull().default(''),
    preauthAmountPaise: bigint('preauth_amount_paise', { mode: 'number' }).notNull().default(0),
    approvedAmountPaise: bigint('approved_amount_paise', { mode: 'number' }).notNull().default(0),
    status: text('status').notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('encounter_payers_tenant_id_uq').on(t.tenantId, t.id),
    unique('encounter_payers_encounter_uq').on(t.tenantId, t.encounterId),
    foreignKey({ columns: [t.tenantId, t.encounterId], foreignColumns: [encounters.tenantId, encounters.id], name: 'encounter_payers_enc_fk' }),
    foreignKey({ columns: [t.tenantId, t.payerId], foreignColumns: [payers.tenantId, payers.id], name: 'encounter_payers_payer_fk' }),
    check('encounter_payers_status_chk', sql`status in ('active', 'closed')`),
  ],
);

export const payerReceivables = pgTable(
  'payer_receivables',
  {
    id: id(),
    tenantId: tenantId(),
    billId: uuid('bill_id').notNull(),
    payerId: uuid('payer_id').notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    status: text('status').notNull().default('open'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('payer_receivables_tenant_id_uq').on(t.tenantId, t.id),
    index('payer_receivables_bill_idx').on(t.tenantId, t.billId),
    index('payer_receivables_status_idx').on(t.tenantId, t.status),
    check('payer_receivables_amount_chk', sql`amount_paise > 0`),
    check('payer_receivables_status_chk', sql`status in ('open', 'submitted', 'settled', 'denied')`),
    foreignKey({ columns: [t.tenantId, t.billId], foreignColumns: [bills.tenantId, bills.id], name: 'payer_receivables_bill_fk' }),
    foreignKey({ columns: [t.tenantId, t.payerId], foreignColumns: [payers.tenantId, payers.id], name: 'payer_receivables_payer_fk' }),
  ],
);
