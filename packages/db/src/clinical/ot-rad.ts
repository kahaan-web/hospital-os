import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { tenants } from '../schema';
import { patients } from './foundation';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

/** MVP demo slice (docs/specs/03-ot-scheduling.md). */
export const otCases = pgTable(
  'ot_cases',
  {
    id: id(),
    tenantId: tenantId(),
    locationId: uuid('location_id').notNull(),
    patientId: uuid('patient_id').notNull(),
    number: text('number').notNull(),
    procedureName: text('procedure_name').notNull(),
    surgeonName: text('surgeon_name').notNull(),
    anaesthetistName: text('anaesthetist_name').notNull().default(''),
    roomCode: text('room_code').notNull(),
    priority: text('priority').notNull().default('elective'),
    anaesthesiaType: text('anaesthesia_type').notNull().default(''),
    scheduledStart: ts('scheduled_start').notNull(),
    scheduledEnd: ts('scheduled_end').notNull(),
    status: text('status').notNull().default('scheduled'),
    inRoomAt: ts('in_room_at'),
    outRoomAt: ts('out_room_at'),
    notes: text('notes').notNull().default(''),
    isSample: boolean('is_sample').notNull().default(false),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('ot_cases_tenant_id_uq').on(t.tenantId, t.id),
    unique('ot_cases_number_uq').on(t.tenantId, t.number),
    index('ot_cases_board_idx').on(t.tenantId, t.locationId, t.scheduledStart),
    index('ot_cases_room_idx').on(t.tenantId, t.roomCode, t.scheduledStart),
    foreignKey({ columns: [t.tenantId, t.patientId], foreignColumns: [patients.tenantId, patients.id], name: 'ot_cases_patient_fk' }),
    check('ot_cases_status_chk', sql`status in ('scheduled', 'in_progress', 'completed', 'cancelled')`),
    check('ot_cases_priority_chk', sql`priority in ('elective', 'emergency')`),
    check('ot_cases_window_chk', sql`scheduled_end > scheduled_start`),
  ],
);

/** MVP demo slice (docs/specs/04-radiology.md). */
export const radOrders = pgTable(
  'rad_orders',
  {
    id: id(),
    tenantId: tenantId(),
    locationId: uuid('location_id').notNull(),
    patientId: uuid('patient_id').notNull(),
    number: text('number').notNull(),
    modality: text('modality').notNull(),
    studyName: text('study_name').notNull(),
    priority: text('priority').notNull().default('routine'),
    clinicalNotes: text('clinical_notes').notNull().default(''),
    orderingDoctorName: text('ordering_doctor_name').notNull().default(''),
    status: text('status').notNull().default('ordered'),
    performedAt: ts('performed_at'),
    isSample: boolean('is_sample').notNull().default(false),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('rad_orders_tenant_id_uq').on(t.tenantId, t.id),
    unique('rad_orders_number_uq').on(t.tenantId, t.number),
    index('rad_orders_worklist_idx').on(t.tenantId, t.locationId, t.status, t.createdAt),
    foreignKey({ columns: [t.tenantId, t.patientId], foreignColumns: [patients.tenantId, patients.id], name: 'rad_orders_patient_fk' }),
    check('rad_orders_modality_chk', sql`modality in ('xray', 'usg', 'ct', 'mri', 'mammo', 'other')`),
    check('rad_orders_priority_chk', sql`priority in ('routine', 'urgent', 'stat')`),
    check('rad_orders_status_chk', sql`status in ('ordered', 'in_progress', 'done', 'reported', 'cancelled')`),
  ],
);

export const radReports = pgTable(
  'rad_reports',
  {
    id: id(),
    tenantId: tenantId(),
    orderId: uuid('order_id').notNull(),
    version: integer('version').notNull().default(1),
    findings: text('findings').notNull().default(''),
    impression: text('impression').notNull().default(''),
    status: text('status').notNull().default('draft'),
    radiologistId: uuid('radiologist_id'),
    signedAt: ts('signed_at'),
    isSample: boolean('is_sample').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('rad_reports_tenant_id_uq').on(t.tenantId, t.id),
    unique('rad_reports_version_uq').on(t.tenantId, t.orderId, t.version),
    foreignKey({ columns: [t.tenantId, t.orderId], foreignColumns: [radOrders.tenantId, radOrders.id], name: 'rad_reports_order_fk' }),
    check('rad_reports_status_chk', sql`status in ('draft', 'final')`),
  ],
);
