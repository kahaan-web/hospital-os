import { sql } from 'drizzle-orm';
import { check, foreignKey, index, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { doctors, tenants } from '../schema';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const orderSets = pgTable(
  'order_sets',
  {
    id: id(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    items: jsonb('items').notNull().default(sql`'[]'::jsonb`),
    ownerDoctorId: uuid('owner_doctor_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('order_sets_tenant_id_uq').on(t.tenantId, t.id),
    index('order_sets_tenant_idx').on(t.tenantId, t.ownerDoctorId),
    foreignKey({ columns: [t.tenantId, t.ownerDoctorId], foreignColumns: [doctors.tenantId, doctors.id], name: 'order_sets_doctor_fk' }),
    check('order_sets_kind_chk', sql`kind in ('lab', 'procedure', 'medicine')`),
  ],
);

export const prescriptionTemplates = pgTable(
  'prescription_templates',
  {
    id: id(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    items: jsonb('items').notNull().default(sql`'[]'::jsonb`),
    ownerDoctorId: uuid('owner_doctor_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('prescription_templates_tenant_id_uq').on(t.tenantId, t.id),
    index('prescription_templates_tenant_idx').on(t.tenantId, t.ownerDoctorId),
    foreignKey({
      columns: [t.tenantId, t.ownerDoctorId],
      foreignColumns: [doctors.tenantId, doctors.id],
      name: 'prescription_templates_doctor_fk',
    }),
  ],
);
