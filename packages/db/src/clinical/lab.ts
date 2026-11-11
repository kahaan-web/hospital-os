// B8 laboratory. SQL lives in migrations 0180–0181. Do not drizzle-kit generate.
import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, index, integer, jsonb, numeric, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import type { LabRefBand } from '@hos/shared';
import { clinicalOrderItems, encounters, patients, services } from './foundation';
import { locations, tenants, users } from '../schema';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

const SPECIMEN_SQL = `specimen in ('blood', 'serum', 'plasma', 'urine', 'stool', 'swab', 'sputum', 'csf', 'other')`;

export const labTests = pgTable(
  'lab_tests',
  {
    id: id(),
    tenantId: tenantId(),
    serviceId: uuid('service_id').notNull(),
    specimen: text('specimen').notNull(),
    container: text('container').notNull(),
    tatHours: integer('tat_hours').notNull(),
    active: boolean('active').notNull().default(true),
    isSample: boolean('is_sample').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('lab_tests_tenant_id_uq').on(t.tenantId, t.id),
    unique('lab_tests_service_uq').on(t.tenantId, t.serviceId),
    foreignKey({ columns: [t.tenantId, t.serviceId], foreignColumns: [services.tenantId, services.id], name: 'lab_tests_service_fk' }),
    check('lab_tests_specimen_chk', sql.raw(SPECIMEN_SQL)),
    check('lab_tests_tat_chk', sql`tat_hours >= 1 and tat_hours <= 720`),
  ],
);

export const labTestParams = pgTable(
  'lab_test_params',
  {
    id: id(),
    tenantId: tenantId(),
    testId: uuid('test_id').notNull(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    unit: text('unit').notNull().default(''),
    valueType: text('value_type').notNull(),
    decimals: integer('decimals').notNull().default(0),
    refRanges: jsonb('ref_ranges').$type<LabRefBand[]>().notNull().default(sql`'[]'::jsonb`),
    criticalLow: numeric('critical_low', { precision: 14, scale: 4, mode: 'number' }),
    criticalHigh: numeric('critical_high', { precision: 14, scale: 4, mode: 'number' }),
    options: jsonb('options').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('lab_test_params_tenant_id_uq').on(t.tenantId, t.id),
    unique('lab_test_params_code_uq').on(t.tenantId, t.testId, t.code),
    index('lab_test_params_test_idx').on(t.tenantId, t.testId, t.sortOrder),
    foreignKey({ columns: [t.tenantId, t.testId], foreignColumns: [labTests.tenantId, labTests.id], name: 'lab_test_params_test_fk' }),
    check('lab_test_params_type_chk', sql`value_type in ('numeric', 'text', 'coded')`),
    check('lab_test_params_decimals_chk', sql`decimals >= 0 and decimals <= 4`),
  ],
);

export const labAccessions = pgTable(
  'lab_accessions',
  {
    id: id(),
    tenantId: tenantId(),
    locationId: uuid('location_id').notNull(),
    patientId: uuid('patient_id').notNull(),
    encounterId: uuid('encounter_id').notNull(),
    orderItemId: uuid('order_item_id').notNull(),
    number: text('number').notNull(),
    barcode: text('barcode').notNull(),
    status: text('status').notNull().default('ordered'),
    specimen: text('specimen').notNull(),
    collectedAt: ts('collected_at'),
    collectedBy: uuid('collected_by'),
    receivedAt: ts('received_at'),
    receivedBy: uuid('received_by'),
    verifiedAt: ts('verified_at'),
    reportedAt: ts('reported_at'),
    rejectedAt: ts('rejected_at'),
    rejectReason: text('reject_reason'),
    isSample: boolean('is_sample').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('lab_accessions_tenant_id_uq').on(t.tenantId, t.id),
    unique('lab_accessions_number_uq').on(t.tenantId, t.number),
    unique('lab_accessions_barcode_uq').on(t.tenantId, t.barcode),
    unique('lab_accessions_item_uq').on(t.tenantId, t.orderItemId),
    index('lab_accessions_patient_idx').on(t.tenantId, t.patientId),
    index('lab_accessions_status_idx').on(t.tenantId, t.status),
    foreignKey({ columns: [t.tenantId, t.locationId], foreignColumns: [locations.tenantId, locations.id], name: 'lab_accessions_location_fk' }),
    foreignKey({ columns: [t.tenantId, t.patientId], foreignColumns: [patients.tenantId, patients.id], name: 'lab_accessions_patient_fk' }),
    foreignKey({ columns: [t.tenantId, t.encounterId], foreignColumns: [encounters.tenantId, encounters.id], name: 'lab_accessions_encounter_fk' }),
    foreignKey({ columns: [t.tenantId, t.orderItemId], foreignColumns: [clinicalOrderItems.tenantId, clinicalOrderItems.id], name: 'lab_accessions_item_fk' }),
    foreignKey({ columns: [t.tenantId, t.collectedBy], foreignColumns: [users.tenantId, users.id], name: 'lab_accessions_collected_by_fk' }),
    foreignKey({ columns: [t.tenantId, t.receivedBy], foreignColumns: [users.tenantId, users.id], name: 'lab_accessions_received_by_fk' }),
    check('lab_accessions_status_chk', sql`status in ('ordered', 'collected', 'received', 'resulted', 'verified', 'reported', 'rejected')`),
    check('lab_accessions_specimen_chk', sql.raw(SPECIMEN_SQL)),
    check('lab_accessions_number_len_chk', sql`char_length(number) between 4 and 16`),
  ],
);

export const labResults = pgTable(
  'lab_results',
  {
    id: id(),
    tenantId: tenantId(),
    accessionId: uuid('accession_id').notNull(),
    paramId: uuid('param_id').notNull(),
    valueNum: numeric('value_num', { precision: 14, scale: 4, mode: 'number' }),
    valueText: text('value_text'),
    flag: text('flag'),
    enteredBy: uuid('entered_by'),
    verifiedBy: uuid('verified_by'),
    verifiedAt: ts('verified_at'),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('lab_results_tenant_id_uq').on(t.tenantId, t.id),
    unique('lab_results_version_uq').on(t.tenantId, t.accessionId, t.paramId, t.version),
    index('lab_results_accession_idx').on(t.tenantId, t.accessionId, t.version),
    foreignKey({ columns: [t.tenantId, t.accessionId], foreignColumns: [labAccessions.tenantId, labAccessions.id], name: 'lab_results_accession_fk' }),
    foreignKey({ columns: [t.tenantId, t.paramId], foreignColumns: [labTestParams.tenantId, labTestParams.id], name: 'lab_results_param_fk' }),
    foreignKey({ columns: [t.tenantId, t.enteredBy], foreignColumns: [users.tenantId, users.id], name: 'lab_results_entered_by_fk' }),
    foreignKey({ columns: [t.tenantId, t.verifiedBy], foreignColumns: [users.tenantId, users.id], name: 'lab_results_verified_by_fk' }),
    check('lab_results_flag_chk', sql`flag is null or flag in ('N', 'L', 'H', 'LL', 'HH')`),
    check('lab_results_version_chk', sql`version >= 1`),
  ],
);

export const labInterfaces = pgTable(
  'lab_interfaces',
  {
    id: id(),
    tenantId: tenantId(),
    locationId: uuid('location_id'),
    name: text('name').notNull(),
    kind: text('kind').notNull().default('mock_astm'),
    tokenHash: text('token_hash').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('lab_interfaces_tenant_id_uq').on(t.tenantId, t.id),
    foreignKey({ columns: [t.tenantId, t.locationId], foreignColumns: [locations.tenantId, locations.id], name: 'lab_interfaces_location_fk' }),
    check('lab_interfaces_kind_chk', sql`kind = 'mock_astm'`),
  ],
);

/** One row per tenant. `collect_before_payment` is the lab.collectBeforePayment switch. */
export const labSettings = pgTable(
  'lab_settings',
  {
    id: id(),
    tenantId: tenantId(),
    collectBeforePayment: boolean('collect_before_payment').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique('lab_settings_tenant_id_uq').on(t.tenantId, t.id), unique('lab_settings_tenant_uq').on(t.tenantId)],
);
