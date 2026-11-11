import { sql } from 'drizzle-orm';
import { bigint, check, date, foreignKey, index, integer, numeric, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { locations, tenants } from '../schema';
import { encounters, patients } from './foundation';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const bills = pgTable(
  'bills',
  {
    id: id(),
    tenantId: tenantId(),
    locationId: uuid('location_id').notNull(),
    patientId: uuid('patient_id').notNull(),
    encounterId: uuid('encounter_id'),
    kind: text('kind').notNull(),
    number: text('number'),
    docType: text('doc_type').notNull(),
    status: text('status').notNull().default('draft'),
    payClass: text('pay_class').notNull(),
    payerId: uuid('payer_id'),
    subtotalPaise: bigint('subtotal_paise', { mode: 'number' }).notNull(),
    discountPaise: bigint('discount_paise', { mode: 'number' }).notNull().default(0),
    cgstPaise: bigint('cgst_paise', { mode: 'number' }).notNull().default(0),
    sgstPaise: bigint('sgst_paise', { mode: 'number' }).notNull().default(0),
    igstPaise: bigint('igst_paise', { mode: 'number' }).notNull().default(0),
    roundOffPaise: bigint('round_off_paise', { mode: 'number' }).notNull().default(0),
    totalPaise: bigint('total_paise', { mode: 'number' }).notNull(),
    paidPaise: bigint('paid_paise', { mode: 'number' }).notNull().default(0),
    cancelReason: text('cancel_reason').notNull().default(''),
    createdBy: uuid('created_by'),
    finalisedAt: timestamp('finalised_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('bills_tenant_id_uq').on(t.tenantId, t.id),
    uniqueIndex('bills_number_uq').on(t.tenantId, t.number).where(sql`${t.number} is not null`),
    index('bills_patient_idx').on(t.tenantId, t.patientId, t.createdAt),
    index('bills_status_idx').on(t.tenantId, t.status),
    foreignKey({ columns: [t.tenantId, t.locationId], foreignColumns: [locations.tenantId, locations.id], name: 'bills_location_fk' }),
    foreignKey({ columns: [t.tenantId, t.patientId], foreignColumns: [patients.tenantId, patients.id], name: 'bills_patient_fk' }),
    foreignKey({ columns: [t.tenantId, t.encounterId], foreignColumns: [encounters.tenantId, encounters.id], name: 'bills_encounter_fk' }),
    check('bills_kind_chk', sql`kind in ('op', 'ip')`),
    check('bills_doc_type_chk', sql`doc_type in ('bill_of_supply', 'tax_invoice', 'invoice_cum_bill_of_supply')`),
    check('bills_status_chk', sql`status in ('draft', 'final', 'cancelled')`),
    check('bills_pay_class_chk', sql`pay_class in ('cash', 'credit', 'free')`),
    check('bills_number_len_chk', sql`number is null or char_length(number) <= 16`),
  ],
);

export const billLines = pgTable(
  'bill_lines',
  {
    id: id(),
    tenantId: tenantId(),
    billId: uuid('bill_id').notNull(),
    chargeId: uuid('charge_id').notNull(),
    lineNo: integer('line_no').notNull(),
    description: text('description').notNull(),
    qty: numeric('qty', { precision: 12, scale: 3, mode: 'number' }).notNull(),
    unitPricePaise: bigint('unit_price_paise', { mode: 'number' }).notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    discountPaise: bigint('discount_paise', { mode: 'number' }).notNull().default(0),
    billDiscountPaise: bigint('bill_discount_paise', { mode: 'number' }).notNull().default(0),
    taxablePaise: bigint('taxable_paise', { mode: 'number' }).notNull(),
    gstTreatment: text('gst_treatment').notNull(),
    configuredRateBp: integer('configured_rate_bp').notNull().default(0),
    gstRateBp: integer('gst_rate_bp').notNull().default(0),
    hsnSac: text('hsn_sac').notNull().default('9993'),
    cgstPaise: bigint('cgst_paise', { mode: 'number' }).notNull().default(0),
    sgstPaise: bigint('sgst_paise', { mode: 'number' }).notNull().default(0),
    igstPaise: bigint('igst_paise', { mode: 'number' }).notNull().default(0),
    serviceId: uuid('service_id'),
    performingDoctorId: uuid('performing_doctor_id'),
    serviceDate: date('service_date').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('bill_lines_tenant_id_uq').on(t.tenantId, t.id),
    unique('bill_lines_charge_uq').on(t.chargeId),
    unique('bill_lines_line_uq').on(t.tenantId, t.billId, t.lineNo),
    index('bill_lines_bill_idx').on(t.tenantId, t.billId),
    foreignKey({ columns: [t.tenantId, t.billId], foreignColumns: [bills.tenantId, bills.id], name: 'bill_lines_bill_fk' }),
    check('bill_lines_gst_chk', sql`gst_treatment in ('exempt_healthcare', 'taxable', 'room_rent_rule')`),
  ],
);

export const deposits = pgTable(
  'deposits',
  {
    id: id(),
    tenantId: tenantId(),
    locationId: uuid('location_id').notNull(),
    patientId: uuid('patient_id').notNull(),
    encounterId: uuid('encounter_id'),
    number: text('number').notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    balancePaise: bigint('balance_paise', { mode: 'number' }).notNull(),
    mode: text('mode').notNull(),
    status: text('status').notNull().default('open'),
    instrumentRef: text('instrument_ref'),
    receivedBy: uuid('received_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('deposits_tenant_id_uq').on(t.tenantId, t.id),
    unique('deposits_number_uq').on(t.tenantId, t.number),
    index('deposits_patient_idx').on(t.tenantId, t.patientId),
    foreignKey({ columns: [t.tenantId, t.locationId], foreignColumns: [locations.tenantId, locations.id], name: 'deposits_location_fk' }),
    foreignKey({ columns: [t.tenantId, t.patientId], foreignColumns: [patients.tenantId, patients.id], name: 'deposits_patient_fk' }),
    foreignKey({ columns: [t.tenantId, t.encounterId], foreignColumns: [encounters.tenantId, encounters.id], name: 'deposits_encounter_fk' }),
    check('deposits_mode_chk', sql`mode in ('cash', 'upi', 'card', 'cheque', 'neft')`),
    check('deposits_status_chk', sql`status in ('open', 'refunded', 'adjusted', 'closed')`),
  ],
);

export const billSettlements = pgTable(
  'bill_settlements',
  {
    id: id(),
    tenantId: tenantId(),
    billId: uuid('bill_id').notNull(),
    mode: text('mode').notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    depositId: uuid('deposit_id'),
    cashEntryId: uuid('cash_entry_id'),
    instrumentRef: text('instrument_ref'),
    receivedBy: uuid('received_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('bill_settlements_tenant_id_uq').on(t.tenantId, t.id),
    index('bill_settlements_bill_idx').on(t.tenantId, t.billId),
    foreignKey({ columns: [t.tenantId, t.billId], foreignColumns: [bills.tenantId, bills.id], name: 'bill_settlements_bill_fk' }),
    foreignKey({ columns: [t.tenantId, t.depositId], foreignColumns: [deposits.tenantId, deposits.id], name: 'bill_settlements_deposit_fk' }),
    check('bill_settlements_mode_chk', sql`mode in ('cash', 'upi', 'card', 'cheque', 'neft', 'deposit', 'credit')`),
    check('bill_settlements_amount_chk', sql`amount_paise > 0`),
  ],
);

export const concessions = pgTable(
  'concessions',
  {
    id: id(),
    tenantId: tenantId(),
    billId: uuid('bill_id').notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    reason: text('reason').notNull(),
    status: text('status').notNull().default('requested'),
    requestedBy: uuid('requested_by'),
    approvedBy: uuid('approved_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('concessions_tenant_id_uq').on(t.tenantId, t.id),
    index('concessions_bill_idx').on(t.tenantId, t.billId),
    foreignKey({ columns: [t.tenantId, t.billId], foreignColumns: [bills.tenantId, bills.id], name: 'concessions_bill_fk' }),
    check('concessions_status_chk', sql`status in ('requested', 'approved', 'rejected')`),
    check('concessions_amount_chk', sql`amount_paise > 0`),
  ],
);

export const refunds = pgTable(
  'refunds',
  {
    id: id(),
    tenantId: tenantId(),
    billId: uuid('bill_id'),
    depositId: uuid('deposit_id'),
    number: text('number').notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    reason: text('reason').notNull(),
    mode: text('mode').notNull(),
    cashEntryId: uuid('cash_entry_id'),
    approvedBy: uuid('approved_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('refunds_tenant_id_uq').on(t.tenantId, t.id),
    unique('refunds_number_uq').on(t.tenantId, t.number),
    foreignKey({ columns: [t.tenantId, t.billId], foreignColumns: [bills.tenantId, bills.id], name: 'refunds_bill_fk' }),
    foreignKey({ columns: [t.tenantId, t.depositId], foreignColumns: [deposits.tenantId, deposits.id], name: 'refunds_deposit_fk' }),
    check('refunds_target_chk', sql`bill_id is not null or deposit_id is not null`),
    check('refunds_mode_chk', sql`mode in ('cash', 'upi', 'card', 'cheque', 'neft')`),
  ],
);

export const creditNotes = pgTable(
  'bill_credit_notes',
  {
    id: id(),
    tenantId: tenantId(),
    billId: uuid('bill_id').notNull(),
    refundId: uuid('refund_id'),
    number: text('number').notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    cgstPaise: bigint('cgst_paise', { mode: 'number' }).notNull().default(0),
    sgstPaise: bigint('sgst_paise', { mode: 'number' }).notNull().default(0),
    igstPaise: bigint('igst_paise', { mode: 'number' }).notNull().default(0),
    reason: text('reason').notNull().default(''),
    status: text('status').notNull().default('issued'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('credit_notes_tenant_id_uq').on(t.tenantId, t.id),
    unique('credit_notes_number_uq').on(t.tenantId, t.number),
    index('credit_notes_bill_idx').on(t.tenantId, t.billId),
    foreignKey({ columns: [t.tenantId, t.billId], foreignColumns: [bills.tenantId, bills.id], name: 'credit_notes_bill_fk' }),
    foreignKey({ columns: [t.tenantId, t.refundId], foreignColumns: [refunds.tenantId, refunds.id], name: 'credit_notes_refund_fk' }),
    check('credit_notes_status_chk', sql`status in ('issued', 'cancelled')`),
    check('credit_notes_money_chk', sql`amount_paise > 0 and char_length(number) <= 16`),
  ],
);
