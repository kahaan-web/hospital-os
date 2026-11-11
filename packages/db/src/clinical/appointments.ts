// B2 appointments, clinic hours and the OPD queue. SQL is migration 0120. Do not drizzle-kit generate.
import { sql } from 'drizzle-orm';
import { boolean, check, date, foreignKey, index, integer, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { doctors, locations, tenants, users } from '../schema';
import { encounters, patients } from './foundation';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id);
const hhmm = (name: string) => text(name);

export const doctorSchedules = pgTable(
  'doctor_schedules',
  {
    id: id(),
    tenantId: tenantId(),
    doctorId: uuid('doctor_id').notNull(),
    locationId: uuid('location_id').notNull(),
    weekday: integer('weekday').notNull(),
    startTime: hhmm('start_time').notNull(),
    endTime: hhmm('end_time').notNull(),
    slotMinutes: integer('slot_minutes').notNull(),
    maxPerSlot: integer('max_per_slot').notNull(),
    isSample: boolean('is_sample').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('doctor_schedules_tenant_id_uq').on(t.tenantId, t.id),
    unique('doctor_schedules_window_uq').on(t.tenantId, t.doctorId, t.locationId, t.weekday, t.startTime),
    foreignKey({ columns: [t.tenantId, t.doctorId], foreignColumns: [doctors.tenantId, doctors.id], name: 'doctor_schedules_doctor_fk' }),
    foreignKey({ columns: [t.tenantId, t.locationId], foreignColumns: [locations.tenantId, locations.id], name: 'doctor_schedules_location_fk' }),
    check('doctor_schedules_weekday_chk', sql`weekday between 0 and 6`),
    check('doctor_schedules_slot_chk', sql`slot_minutes between 5 and 180`),
    check('doctor_schedules_max_chk', sql`max_per_slot between 1 and 50`),
  ],
);

export const scheduleExceptions = pgTable(
  'schedule_exceptions',
  {
    id: id(),
    tenantId: tenantId(),
    doctorId: uuid('doctor_id').notNull(),
    locationId: uuid('location_id').notNull(),
    onDate: date('on_date').notNull(),
    kind: text('kind').notNull(),
    startTime: hhmm('start_time'),
    endTime: hhmm('end_time'),
    slotMinutes: integer('slot_minutes'),
    maxPerSlot: integer('max_per_slot'),
    reason: text('reason').notNull().default(''),
    isSample: boolean('is_sample').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('schedule_exceptions_tenant_id_uq').on(t.tenantId, t.id),
    index('schedule_exceptions_day_idx').on(t.tenantId, t.doctorId, t.onDate),
    foreignKey({ columns: [t.tenantId, t.doctorId], foreignColumns: [doctors.tenantId, doctors.id], name: 'schedule_exceptions_doctor_fk' }),
    foreignKey({ columns: [t.tenantId, t.locationId], foreignColumns: [locations.tenantId, locations.id], name: 'schedule_exceptions_location_fk' }),
    check('schedule_exceptions_kind_chk', sql`kind in ('closed', 'override', 'extra')`),
  ],
);

export const appointments = pgTable(
  'appointments',
  {
    id: id(),
    tenantId: tenantId(),
    locationId: uuid('location_id').notNull(),
    patientId: uuid('patient_id'),
    walkinName: text('walkin_name').notNull().default(''),
    walkinMobile: text('walkin_mobile').notNull().default(''),
    doctorId: uuid('doctor_id').notNull(),
    apptDate: date('date').notNull(),
    slotStart: text('slot_start').notNull(),
    slotEnd: text('slot_end').notNull(),
    seq: integer('seq').notNull(),
    channel: text('channel').notNull(),
    status: text('status').notNull().default('booked'),
    reason: text('reason').notNull().default(''),
    counterKind: text('counter_kind'),
    encounterId: uuid('encounter_id'),
    cancelReason: text('cancel_reason'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    isSample: boolean('is_sample').notNull().default(false),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('appointments_tenant_id_uq').on(t.tenantId, t.id),
    index('appointments_doctor_day_idx').on(t.tenantId, t.doctorId, t.apptDate),
    index('appointments_location_day_idx').on(t.tenantId, t.locationId, t.apptDate),
    uniqueIndex('appointments_slot_seq_uq').on(t.doctorId, t.apptDate, t.slotStart, t.seq).where(sql`status <> 'cancelled'`),
    foreignKey({ columns: [t.tenantId, t.patientId], foreignColumns: [patients.tenantId, patients.id], name: 'appointments_patient_fk' }),
    foreignKey({ columns: [t.tenantId, t.doctorId], foreignColumns: [doctors.tenantId, doctors.id], name: 'appointments_doctor_fk' }),
    foreignKey({ columns: [t.tenantId, t.locationId], foreignColumns: [locations.tenantId, locations.id], name: 'appointments_location_fk' }),
    foreignKey({ columns: [t.tenantId, t.encounterId], foreignColumns: [encounters.tenantId, encounters.id], name: 'appointments_encounter_fk' }),
    foreignKey({ columns: [t.tenantId, t.createdBy], foreignColumns: [users.tenantId, users.id], name: 'appointments_created_by_fk' }),
    check('appointments_channel_chk', sql`channel in ('counter', 'phone', 'portal')`),
    check('appointments_status_chk', sql`status in ('booked', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show')`),
    check('appointments_counter_chk', sql`counter_kind is null or counter_kind in ('new', 'repeat')`),
    check('appointments_seq_chk', sql`seq >= 1`),
  ],
);

export const opdQueue = pgTable(
  'opd_queue',
  {
    id: id(),
    tenantId: tenantId(),
    locationId: uuid('location_id').notNull(),
    encounterId: uuid('encounter_id').notNull(),
    appointmentId: uuid('appointment_id'),
    patientId: uuid('patient_id').notNull(),
    doctorId: uuid('doctor_id').notNull(),
    token: integer('token').notNull(),
    status: text('status').notNull().default('waiting'),
    visitDate: date('visit_date').notNull(),
    isSample: boolean('is_sample').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('opd_queue_tenant_id_uq').on(t.tenantId, t.id),
    unique('opd_queue_encounter_uq').on(t.tenantId, t.encounterId),
    index('opd_queue_day_idx').on(t.tenantId, t.locationId, t.visitDate),
    foreignKey({ columns: [t.tenantId, t.encounterId], foreignColumns: [encounters.tenantId, encounters.id], name: 'opd_queue_encounter_fk' }),
    foreignKey({ columns: [t.tenantId, t.appointmentId], foreignColumns: [appointments.tenantId, appointments.id], name: 'opd_queue_appointment_fk' }),
    foreignKey({ columns: [t.tenantId, t.patientId], foreignColumns: [patients.tenantId, patients.id], name: 'opd_queue_patient_fk' }),
    foreignKey({ columns: [t.tenantId, t.doctorId], foreignColumns: [doctors.tenantId, doctors.id], name: 'opd_queue_doctor_fk' }),
    foreignKey({ columns: [t.tenantId, t.locationId], foreignColumns: [locations.tenantId, locations.id], name: 'opd_queue_location_fk' }),
    check('opd_queue_status_chk', sql`status in ('waiting', 'in_consultation', 'done', 'skipped')`),
    check('opd_queue_token_chk', sql`token >= 1`),
  ],
);
