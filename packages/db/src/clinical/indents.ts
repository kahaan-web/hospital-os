import { sql } from 'drizzle-orm';
import { boolean, check, date, foreignKey, index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { locations, tenants } from '../schema';

// Indents & Purchase (docs/specs/07-indents-purchase.md), MVP demo slice. Migration 1140.
const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const indents = pgTable(
  'indents',
  {
    id: id(),
    tenantId: tenantId(),
    locationId: uuid('location_id').notNull(),
    number: text('number').notNull(),
    department: text('department').notNull(),
    priority: text('priority').notNull().default('routine'),
    requiredBy: date('required_by', { mode: 'string' }),
    status: text('status').notNull().default('draft'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    isSample: boolean('is_sample').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('indents_tenant_id_uq').on(t.tenantId, t.id),
    unique('indents_number_uq').on(t.tenantId, t.number),
    index('indents_location_idx').on(t.tenantId, t.locationId, t.createdAt),
    foreignKey({ columns: [t.tenantId, t.locationId], foreignColumns: [locations.tenantId, locations.id], name: 'indents_location_fk' }),
    check('indents_priority_chk', sql`priority in ('routine', 'urgent')`),
    check('indents_status_chk', sql`status in ('draft', 'approved', 'converted', 'cancelled')`),
  ],
);

export const indentLines = pgTable(
  'indent_lines',
  {
    id: id(),
    tenantId: tenantId(),
    indentId: uuid('indent_id').notNull(),
    lineNo: integer('line_no').notNull(),
    itemName: text('item_name').notNull(),
    unit: text('unit').notNull().default('nos'),
    qtyRequested: integer('qty_requested').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('indent_lines_tenant_id_uq').on(t.tenantId, t.id),
    unique('indent_lines_line_uq').on(t.tenantId, t.indentId, t.lineNo),
    index('indent_lines_indent_idx').on(t.tenantId, t.indentId, t.lineNo),
    foreignKey({ columns: [t.tenantId, t.indentId], foreignColumns: [indents.tenantId, indents.id], name: 'indent_lines_indent_fk' }),
    check('indent_lines_qty_chk', sql`qty_requested > 0 and qty_requested <= 100000`),
  ],
);

export const purchaseOrders = pgTable(
  'purchase_orders',
  {
    id: id(),
    tenantId: tenantId(),
    locationId: uuid('location_id').notNull(),
    number: text('number').notNull(),
    indentId: uuid('indent_id').notNull(),
    supplierName: text('supplier_name').notNull(),
    expectedBy: date('expected_by', { mode: 'string' }),
    status: text('status').notNull().default('open'),
    isSample: boolean('is_sample').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('purchase_orders_tenant_id_uq').on(t.tenantId, t.id),
    unique('purchase_orders_number_uq').on(t.tenantId, t.number),
    unique('purchase_orders_indent_uq').on(t.tenantId, t.indentId),
    index('purchase_orders_location_idx').on(t.tenantId, t.locationId, t.createdAt),
    foreignKey({ columns: [t.tenantId, t.locationId], foreignColumns: [locations.tenantId, locations.id], name: 'purchase_orders_location_fk' }),
    foreignKey({ columns: [t.tenantId, t.indentId], foreignColumns: [indents.tenantId, indents.id], name: 'purchase_orders_indent_fk' }),
    check('purchase_orders_status_chk', sql`status in ('open', 'received', 'cancelled')`),
  ],
);
