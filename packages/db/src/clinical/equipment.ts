import { sql } from 'drizzle-orm';
import { boolean, check, date, foreignKey, index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { tenants, users } from '../schema';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

// MVP demo slice (migration 1220). Tenant-wide for now; location scoping comes with EQ-T1.
export const equipmentAssets = pgTable(
  'equipment_assets',
  {
    id: id(),
    tenantId: tenantId(),
    assetTag: text('asset_tag').notNull(),
    name: text('name').notNull(),
    category: text('category').notNull().default(''),
    department: text('department').notNull().default(''),
    criticality: text('criticality').notNull().default('medium'),
    status: text('status').notNull().default('operational'),
    purchaseCostPaise: integer('purchase_cost_paise').notNull().default(0),
    installedOn: date('installed_on'),
    warrantyUntil: date('warranty_until'),
    isSample: boolean('is_sample').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('equipment_assets_tenant_id_uq').on(t.tenantId, t.id),
    unique('equipment_assets_tag_uq').on(t.tenantId, t.assetTag),
    check(
      'equipment_assets_criticality_chk',
      sql`criticality in ('high', 'medium', 'low')`,
    ),
    check(
      'equipment_assets_status_chk',
      sql`status in ('operational', 'non_operational', 'under_maintenance', 'condemned')`,
    ),
    check('equipment_assets_cost_chk', sql`purchase_cost_paise >= 0`),
  ],
);

export const equipmentPmSchedules = pgTable(
  'equipment_pm_schedules',
  {
    id: id(),
    tenantId: tenantId(),
    equipmentId: uuid('equipment_id').notNull(),
    title: text('title').notNull(),
    frequencyDays: integer('frequency_days').notNull(),
    nextDue: date('next_due').notNull(),
    lastDoneOn: date('last_done_on'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('equipment_pm_tenant_id_uq').on(t.tenantId, t.id),
    index('equipment_pm_asset_idx').on(t.tenantId, t.equipmentId),
    check('equipment_pm_frequency_chk', sql`frequency_days > 0`),
    foreignKey({ columns: [t.tenantId, t.equipmentId], foreignColumns: [equipmentAssets.tenantId, equipmentAssets.id], name: 'equipment_pm_asset_fk' }),
  ],
);

export const equipmentServiceLogs = pgTable(
  'equipment_service_logs',
  {
    id: id(),
    tenantId: tenantId(),
    equipmentId: uuid('equipment_id').notNull(),
    kind: text('kind').notNull(),
    description: text('description').notNull().default(''),
    costPaise: integer('cost_paise').notNull().default(0),
    loggedAt: timestamp('logged_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('equipment_log_tenant_id_uq').on(t.tenantId, t.id),
    index('equipment_log_asset_idx').on(t.tenantId, t.equipmentId, t.loggedAt),
    check('equipment_log_kind_chk', sql`kind in ('pm', 'breakdown', 'restored')`),
    foreignKey({ columns: [t.tenantId, t.equipmentId], foreignColumns: [equipmentAssets.tenantId, equipmentAssets.id], name: 'equipment_log_asset_fk' }),
    foreignKey({ columns: [t.tenantId, t.createdBy], foreignColumns: [users.tenantId, users.id], name: 'equipment_log_user_fk' }),
  ],
);
