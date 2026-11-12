// MVP demo slice: blood bank (storage-centre mode) and marketing campaigns.
// SQL lives in migrations 1180 and 1320. Do not drizzle-kit generate.
import { sql } from 'drizzle-orm';
import { boolean, date, foreignKey, index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { patients } from './foundation';
import { locations, tenants } from '../schema';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

export const bbUnits = pgTable(
  'bb_units',
  {
    id: id(),
    tenantId: tenantId(),
    locationId: uuid('location_id').notNull(),
    unitNo: text('unit_no').notNull(),
    component: text('component').notNull(),
    abo: text('abo').notNull(),
    rh: text('rh').notNull(),
    volumeMl: integer('volume_ml').notNull(),
    collectedOn: date('collected_on').notNull(),
    expiresAt: date('expires_at').notNull(),
    sourceCentre: text('source_centre').notNull().default(''),
    ttiCleared: boolean('tti_cleared').notNull().default(false),
    status: text('status').notNull().default('available'),
    isSample: boolean('is_sample').notNull().default(false),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('bb_units_tenant_id_uq').on(t.tenantId, t.id),
    unique('bb_units_unit_no_uq').on(t.tenantId, t.locationId, t.unitNo),
    index('bb_units_stock_idx').on(t.tenantId, t.locationId, t.status, t.expiresAt),
    foreignKey({ columns: [t.tenantId, t.locationId], foreignColumns: [locations.tenantId, locations.id], name: 'bb_units_location_fk' }),
  ],
);

export const bbRequests = pgTable(
  'bb_requests',
  {
    id: id(),
    tenantId: tenantId(),
    locationId: uuid('location_id').notNull(),
    patientId: uuid('patient_id').notNull(),
    patientAbo: text('patient_abo').notNull(),
    patientRh: text('patient_rh').notNull(),
    component: text('component').notNull(),
    urgency: text('urgency').notNull().default('routine'),
    indication: text('indication').notNull().default(''),
    status: text('status').notNull().default('open'),
    unitId: uuid('unit_id'),
    issuedAt: ts('issued_at'),
    issuedBy: uuid('issued_by'),
    receivedBy: text('received_by').notNull().default(''),
    isSample: boolean('is_sample').notNull().default(false),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('bb_requests_tenant_id_uq').on(t.tenantId, t.id),
    index('bb_requests_queue_idx').on(t.tenantId, t.locationId, t.status, t.createdAt),
    foreignKey({ columns: [t.tenantId, t.locationId], foreignColumns: [locations.tenantId, locations.id], name: 'bb_requests_location_fk' }),
    foreignKey({ columns: [t.tenantId, t.patientId], foreignColumns: [patients.tenantId, patients.id], name: 'bb_requests_patient_fk' }),
    foreignKey({ columns: [t.tenantId, t.unitId], foreignColumns: [bbUnits.tenantId, bbUnits.id], name: 'bb_requests_unit_fk' }),
  ],
);

export const mktCampaigns = pgTable(
  'mkt_campaigns',
  {
    id: id(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    channel: text('channel').notNull(),
    segmentNote: text('segment_note').notNull().default(''),
    message: text('message').notNull(),
    status: text('status').notNull().default('draft'),
    audienceCount: integer('audience_count').notNull().default(0),
    sentCount: integer('sent_count').notNull().default(0),
    suppressedCount: integer('suppressed_count').notNull().default(0),
    sentAt: ts('sent_at'),
    sentBy: uuid('sent_by'),
    isSample: boolean('is_sample').notNull().default(false),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique('mkt_campaigns_tenant_id_uq').on(t.tenantId, t.id), index('mkt_campaigns_list_idx').on(t.tenantId, t.createdAt)],
);
