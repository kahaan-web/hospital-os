import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { locations, tenants } from '../schema';

// Linen & Laundry (docs/specs/10-linen-laundry.md), MVP demo slice. Migration 1200.
const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

export const linenItems = pgTable(
  'linen_items',
  {
    id: id(),
    tenantId: tenantId(),
    locationId: uuid('location_id').notNull(),
    name: text('name').notNull(),
    cleanQty: integer('clean_qty').notNull().default(0),
    inLaundryQty: integer('in_laundry_qty').notNull().default(0),
    isSample: boolean('is_sample').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('linen_items_tenant_id_uq').on(t.tenantId, t.id),
    unique('linen_items_name_uq').on(t.tenantId, t.locationId, t.name),
    index('linen_items_location_idx').on(t.tenantId, t.locationId, t.name),
    foreignKey({ columns: [t.tenantId, t.locationId], foreignColumns: [locations.tenantId, locations.id], name: 'linen_items_location_fk' }),
    check('linen_items_clean_chk', sql`clean_qty >= 0`),
    check('linen_items_laundry_chk', sql`in_laundry_qty >= 0`),
  ],
);

export const laundryBatches = pgTable(
  'laundry_batches',
  {
    id: id(),
    tenantId: tenantId(),
    locationId: uuid('location_id').notNull(),
    number: text('number').notNull(),
    linenItemId: uuid('linen_item_id').notNull(),
    vendor: text('vendor').notNull().default('In-house laundry'),
    qtySent: integer('qty_sent').notNull(),
    qtyReceived: integer('qty_received'),
    qtyMissing: integer('qty_missing').notNull().default(0),
    status: text('status').notNull().default('sent'),
    sentAt: ts('sent_at').notNull().defaultNow(),
    receivedAt: ts('received_at'),
    isSample: boolean('is_sample').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('laundry_batches_tenant_id_uq').on(t.tenantId, t.id),
    unique('laundry_batches_number_uq').on(t.tenantId, t.number),
    index('laundry_batches_location_idx').on(t.tenantId, t.locationId, t.sentAt),
    foreignKey({ columns: [t.tenantId, t.locationId], foreignColumns: [locations.tenantId, locations.id], name: 'laundry_batches_location_fk' }),
    foreignKey({ columns: [t.tenantId, t.linenItemId], foreignColumns: [linenItems.tenantId, linenItems.id], name: 'laundry_batches_item_fk' }),
    check('laundry_batches_sent_chk', sql`qty_sent > 0`),
    check('laundry_batches_status_chk', sql`status in ('sent', 'received')`),
    check('laundry_batches_received_chk', sql`qty_received is null or (qty_received >= 0 and qty_received + qty_missing = qty_sent)`),
  ],
);
