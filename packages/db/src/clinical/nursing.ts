import { sql } from 'drizzle-orm';
import { check, foreignKey, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { clinicalOrderItems, encounters } from './foundation';
import { tenants, users } from '../schema';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

const marStatus = sql`status in ('given', 'held', 'refused', 'missed', 'self')`;

export const marSchedules = pgTable(
  'mar_schedules',
  {
    id: id(),
    tenantId: tenantId(),
    orderItemId: uuid('order_item_id').notNull(),
    encounterId: uuid('encounter_id').notNull(),
    scheduledAt: ts('scheduled_at').notNull(),
    voidedAt: ts('voided_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('mar_schedules_tenant_id_uq').on(t.tenantId, t.id),
    unique('mar_schedules_slot_uq').on(t.tenantId, t.orderItemId, t.scheduledAt),
    index('mar_schedules_encounter_idx').on(t.tenantId, t.encounterId, t.scheduledAt),
    index('mar_schedules_item_idx').on(t.tenantId, t.orderItemId),
    foreignKey({ columns: [t.tenantId, t.orderItemId], foreignColumns: [clinicalOrderItems.tenantId, clinicalOrderItems.id], name: 'mar_schedules_item_fk' }),
    foreignKey({ columns: [t.tenantId, t.encounterId], foreignColumns: [encounters.tenantId, encounters.id], name: 'mar_schedules_encounter_fk' }),
  ],
);

export const medicationAdministrations = pgTable(
  'medication_administrations',
  {
    id: id(),
    tenantId: tenantId(),
    marScheduleId: uuid('mar_schedule_id').notNull(),
    status: text('status').notNull(),
    doseGiven: text('dose_given').notNull().default(''),
    givenAt: ts('given_at').notNull().defaultNow(),
    givenBy: uuid('given_by'),
    reason: text('reason').notNull().default(''),
    witnessUserId: uuid('witness_user_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('med_admin_tenant_id_uq').on(t.tenantId, t.id),
    unique('med_admin_schedule_uq').on(t.tenantId, t.marScheduleId),
    index('med_admin_given_idx').on(t.tenantId, t.givenAt),
    foreignKey({ columns: [t.tenantId, t.marScheduleId], foreignColumns: [marSchedules.tenantId, marSchedules.id], name: 'med_admin_schedule_fk' }),
    foreignKey({ columns: [t.tenantId, t.givenBy], foreignColumns: [users.tenantId, users.id], name: 'med_admin_given_by_fk' }),
    foreignKey({ columns: [t.tenantId, t.witnessUserId], foreignColumns: [users.tenantId, users.id], name: 'med_admin_witness_fk' }),
    check('med_admin_status_chk', marStatus),
  ],
);
