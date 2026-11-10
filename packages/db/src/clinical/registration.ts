import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { encounters, patients } from './foundation';
import { tenants, users } from '../schema';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const patientDocuments = pgTable(
  'patient_documents',
  {
    id: id(),
    tenantId: tenantId(),
    patientId: uuid('patient_id').notNull(),
    kind: text('kind').notNull(),
    filePath: text('file_path').notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    uploadedBy: uuid('uploaded_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('patient_documents_tenant_id_uq').on(t.tenantId, t.id),
    index('patient_documents_patient_idx').on(t.tenantId, t.patientId),
    foreignKey({ columns: [t.tenantId, t.patientId], foreignColumns: [patients.tenantId, patients.id], name: 'patient_documents_patient_fk' }),
    foreignKey({ columns: [t.tenantId, t.uploadedBy], foreignColumns: [users.tenantId, users.id], name: 'patient_documents_uploader_fk' }),
    check('patient_documents_size_chk', sql`size > 0 and size <= 5242880`),
  ],
);

export const mlcCases = pgTable(
  'mlc_cases',
  {
    id: id(),
    tenantId: tenantId(),
    patientId: uuid('patient_id').notNull(),
    encounterId: uuid('encounter_id').notNull(),
    number: text('number').notNull(),
    policeStation: text('police_station').notNull().default(''),
    broughtBy: text('brought_by').notNull().default(''),
    injurySummary: text('injury_summary').notNull().default(''),
    reportedAt: timestamp('reported_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('mlc_cases_tenant_id_uq').on(t.tenantId, t.id),
    unique('mlc_cases_number_uq').on(t.tenantId, t.number),
    index('mlc_cases_patient_idx').on(t.tenantId, t.patientId),
    index('mlc_cases_reported_idx').on(t.tenantId, t.reportedAt),
    foreignKey({ columns: [t.tenantId, t.patientId], foreignColumns: [patients.tenantId, patients.id], name: 'mlc_cases_patient_fk' }),
    foreignKey({ columns: [t.tenantId, t.encounterId], foreignColumns: [encounters.tenantId, encounters.id], name: 'mlc_cases_encounter_fk' }),
  ],
);
