import { sql } from 'drizzle-orm';
import { boolean, check, date, foreignKey, index, jsonb, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { DischargeSummarySections } from '@hos/shared';
import { encounters, patients, services } from './foundation';
import { doctors, locations, tenants, users } from '../schema';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

const wardType = sql`ward_type in ('general', 'semi_private', 'private', 'icu', 'nicu', 'hdu', 'daycare')`;
const bedStatus = sql`status in ('vacant', 'occupied', 'housekeeping', 'maintenance', 'blocked')`;

export const wards = pgTable(
  'wards',
  {
    id: id(),
    tenantId: tenantId(),
    locationId: uuid('location_id').notNull(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    wardType: text('ward_type').notNull(),
    isIcu: boolean('is_icu').notNull().default(false),
    bedServiceId: uuid('bed_service_id'),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('wards_tenant_id_uq').on(t.tenantId, t.id),
    unique('wards_code_uq').on(t.tenantId, t.locationId, t.code),
    index('wards_location_idx').on(t.tenantId, t.locationId),
    foreignKey({ columns: [t.tenantId, t.locationId], foreignColumns: [locations.tenantId, locations.id], name: 'wards_location_fk' }),
    foreignKey({ columns: [t.tenantId, t.bedServiceId], foreignColumns: [services.tenantId, services.id], name: 'wards_service_fk' }),
    check('wards_type_chk', wardType),
  ],
);

export const rooms = pgTable(
  'rooms',
  {
    id: id(),
    tenantId: tenantId(),
    wardId: uuid('ward_id').notNull(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('rooms_tenant_id_uq').on(t.tenantId, t.id),
    unique('rooms_code_uq').on(t.tenantId, t.wardId, t.code),
    index('rooms_ward_idx').on(t.tenantId, t.wardId),
    foreignKey({ columns: [t.tenantId, t.wardId], foreignColumns: [wards.tenantId, wards.id], name: 'rooms_ward_fk' }),
  ],
);

export const beds = pgTable(
  'beds',
  {
    id: id(),
    tenantId: tenantId(),
    roomId: uuid('room_id').notNull(),
    label: text('label').notNull(),
    wardClass: text('ward_class').notNull(),
    status: text('status').notNull().default('vacant'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('beds_tenant_id_uq').on(t.tenantId, t.id),
    unique('beds_label_uq').on(t.tenantId, t.roomId, t.label),
    index('beds_room_idx').on(t.tenantId, t.roomId),
    foreignKey({ columns: [t.tenantId, t.roomId], foreignColumns: [rooms.tenantId, rooms.id], name: 'beds_room_fk' }),
    check('beds_class_chk', sql`ward_class in ('general', 'semi_private', 'private', 'icu', 'nicu', 'hdu', 'daycare')`),
    check('beds_status_chk', bedStatus),
  ],
);

export const admissions = pgTable(
  'admissions',
  {
    id: id(),
    tenantId: tenantId(),
    locationId: uuid('location_id').notNull(),
    encounterId: uuid('encounter_id').notNull(),
    patientId: uuid('patient_id').notNull(),
    doctorId: uuid('doctor_id'),
    number: text('number').notNull(),
    admissionType: text('admission_type').notNull(),
    attendant: text('attendant').notNull().default(''),
    provisionalDiagnosis: text('provisional_diagnosis').notNull().default(''),
    status: text('status').notNull().default('admitted'),
    dischargeType: text('discharge_type'),
    admittedAt: ts('admitted_at').notNull().defaultNow(),
    dischargedAt: ts('discharged_at'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('admissions_tenant_id_uq').on(t.tenantId, t.id),
    unique('admissions_encounter_uq').on(t.tenantId, t.encounterId),
    unique('admissions_number_uq').on(t.tenantId, t.number),
    index('admissions_patient_idx').on(t.tenantId, t.patientId),
    index('admissions_admitted_idx').on(t.tenantId, t.admittedAt),
    foreignKey({ columns: [t.tenantId, t.locationId], foreignColumns: [locations.tenantId, locations.id], name: 'admissions_location_fk' }),
    foreignKey({ columns: [t.tenantId, t.encounterId], foreignColumns: [encounters.tenantId, encounters.id], name: 'admissions_encounter_fk' }),
    foreignKey({ columns: [t.tenantId, t.patientId], foreignColumns: [patients.tenantId, patients.id], name: 'admissions_patient_fk' }),
    foreignKey({ columns: [t.tenantId, t.doctorId], foreignColumns: [doctors.tenantId, doctors.id], name: 'admissions_doctor_fk' }),
    foreignKey({ columns: [t.tenantId, t.createdBy], foreignColumns: [users.tenantId, users.id], name: 'admissions_created_by_fk' }),
    check('admissions_type_chk', sql`admission_type in ('emergency', 'elective', 'day_care')`),
    check('admissions_status_chk', sql`status in ('admitted', 'discharge_initiated', 'discharged', 'cancelled')`),
    check('admissions_discharge_chk', sql`discharge_type is null or discharge_type in ('normal', 'lama', 'dama', 'referred', 'death', 'absconded')`),
  ],
);

export const bedAssignments = pgTable(
  'bed_assignments',
  {
    id: id(),
    tenantId: tenantId(),
    admissionId: uuid('admission_id').notNull(),
    bedId: uuid('bed_id').notNull(),
    fromAt: ts('from_at').notNull().defaultNow(),
    toAt: ts('to_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('bed_assignments_tenant_id_uq').on(t.tenantId, t.id),
    index('bed_assignments_admission_idx').on(t.tenantId, t.admissionId),
    index('bed_assignments_from_idx').on(t.tenantId, t.fromAt),
    uniqueIndex('bed_assignments_open_bed_uq').on(t.tenantId, t.bedId).where(sql`${t.toAt} is null`),
    uniqueIndex('bed_assignments_open_admission_uq').on(t.tenantId, t.admissionId).where(sql`${t.toAt} is null`),
    foreignKey({ columns: [t.tenantId, t.admissionId], foreignColumns: [admissions.tenantId, admissions.id], name: 'bed_assignments_admission_fk' }),
    foreignKey({ columns: [t.tenantId, t.bedId], foreignColumns: [beds.tenantId, beds.id], name: 'bed_assignments_bed_fk' }),
  ],
);

export const admissionRequests = pgTable(
  'admission_requests',
  {
    id: id(),
    tenantId: tenantId(),
    locationId: uuid('location_id').notNull(),
    patientId: uuid('patient_id').notNull(),
    fromEncounterId: uuid('from_encounter_id').notNull(),
    doctorId: uuid('doctor_id').notNull(),
    admissionId: uuid('admission_id'),
    reason: text('reason').notNull(),
    plannedOn: date('planned_on').notNull(),
    wardType: text('ward_type'),
    status: text('status').notNull().default('requested'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('admission_requests_tenant_id_uq').on(t.tenantId, t.id),
    index('admission_requests_status_idx').on(t.tenantId, t.status),
    foreignKey({ columns: [t.tenantId, t.locationId], foreignColumns: [locations.tenantId, locations.id], name: 'admission_requests_location_fk' }),
    foreignKey({ columns: [t.tenantId, t.patientId], foreignColumns: [patients.tenantId, patients.id], name: 'admission_requests_patient_fk' }),
    foreignKey({ columns: [t.tenantId, t.fromEncounterId], foreignColumns: [encounters.tenantId, encounters.id], name: 'admission_requests_encounter_fk' }),
    foreignKey({ columns: [t.tenantId, t.doctorId], foreignColumns: [doctors.tenantId, doctors.id], name: 'admission_requests_doctor_fk' }),
    foreignKey({ columns: [t.tenantId, t.admissionId], foreignColumns: [admissions.tenantId, admissions.id], name: 'admission_requests_admission_fk' }),
    check('admission_requests_ward_chk', sql`ward_type is null or ward_type in ('general', 'semi_private', 'private', 'icu', 'nicu', 'hdu', 'daycare')`),
    check('admission_requests_status_chk', sql`status in ('requested', 'admitted', 'cancelled')`),
  ],
);

export const dischargeSummaries = pgTable(
  'discharge_summaries',
  {
    id: id(),
    tenantId: tenantId(),
    admissionId: uuid('admission_id').notNull(),
    sections: jsonb('sections').$type<DischargeSummarySections>().notNull(),
    status: text('status').notNull().default('draft'),
    finalisedAt: ts('finalised_at'),
    finalisedBy: uuid('finalised_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('discharge_summaries_tenant_id_uq').on(t.tenantId, t.id),
    unique('discharge_summaries_admission_uq').on(t.tenantId, t.admissionId),
    foreignKey({ columns: [t.tenantId, t.admissionId], foreignColumns: [admissions.tenantId, admissions.id], name: 'discharge_summaries_admission_fk' }),
    foreignKey({ columns: [t.tenantId, t.finalisedBy], foreignColumns: [users.tenantId, users.id], name: 'discharge_summaries_user_fk' }),
    check('discharge_summaries_status_chk', sql`status in ('draft', 'final')`),
  ],
);
