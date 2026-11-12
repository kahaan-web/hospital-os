// Sample indents, purchase order, linen stock and one laundry batch for the Sunrise demo (MVP slice).
// Every row is fictional and flagged is_sample. Numbers use the DEMO- prefix.
import { and, eq } from 'drizzle-orm';
import type { Db } from '../client';
import * as schema from '../schema';

const SUNRISE = 'sunrise-care';

export async function seedSunriseIndentsLinen(db: Db, tenantId: string, log: (m: string) => void): Promise<void> {
  const [mumbai] = await db
    .select()
    .from(schema.locations)
    .where(and(eq(schema.locations.tenantId, tenantId), eq(schema.locations.code, 'MUM')));
  const location = mumbai ?? (await db.select().from(schema.locations).where(eq(schema.locations.tenantId, tenantId)))[0];
  if (!location) {
    log(`indents/linen seed skipped: no location for ${SUNRISE}`);
    return;
  }
  const locationId = location.id;

  // Indents. IND-DEMO-01 is approved (ready to convert). IND-DEMO-02 is still a draft.
  const indentSpecs = [
    {
      number: 'IND-DEMO-01',
      department: 'Ward GW-1 (Sample)',
      priority: 'routine',
      status: 'approved',
      lines: [
        ['Disposable gloves, medium (Sample)', 'box', 20],
        ['Surgical mask (Sample)', 'box', 10],
        ['Saline 0.9%, 500 ml (Sample)', 'bottle', 30],
      ] as const,
    },
    {
      number: 'IND-DEMO-02',
      department: 'Operation Theatre (Sample)',
      priority: 'urgent',
      status: 'draft',
      lines: [
        ['Sterile gauze pack (Sample)', 'pack', 15],
        ['Suture silk 2-0 (Sample)', 'pcs', 12],
      ] as const,
    },
  ];

  for (const spec of indentSpecs) {
    const [existing] = await db
      .select({ id: schema.indents.id })
      .from(schema.indents)
      .where(and(eq(schema.indents.tenantId, tenantId), eq(schema.indents.number, spec.number)));
    if (existing) continue;
    const [row] = await db
      .insert(schema.indents)
      .values({
        tenantId,
        locationId,
        number: spec.number,
        department: spec.department,
        priority: spec.priority,
        status: spec.status,
        approvedAt: spec.status === 'approved' ? new Date() : null,
        isSample: true,
      })
      .returning();
    await db.insert(schema.indentLines).values(
      spec.lines.map(([itemName, unit, qty], i) => ({
        tenantId,
        indentId: row!.id,
        lineNo: i + 1,
        itemName,
        unit,
        qtyRequested: qty,
      })),
    );
  }

  // One indent already converted, so the purchase order list has a sample row.
  const [converted] = await db
    .select()
    .from(schema.indents)
    .where(and(eq(schema.indents.tenantId, tenantId), eq(schema.indents.number, 'IND-DEMO-03')));
  if (!converted) {
    const [row] = await db
      .insert(schema.indents)
      .values({
        tenantId,
        locationId,
        number: 'IND-DEMO-03',
        department: 'Housekeeping (Sample)',
        priority: 'routine',
        status: 'converted',
        approvedAt: new Date(),
        isSample: true,
      })
      .returning();
    await db.insert(schema.indentLines).values({
      tenantId,
      indentId: row!.id,
      lineNo: 1,
      itemName: 'Phenyl floor cleaner, 5 L (Sample)',
      unit: 'can',
      qtyRequested: 6,
    });
    await db.insert(schema.purchaseOrders).values({
      tenantId,
      locationId,
      number: 'PO-DEMO-01',
      indentId: row!.id,
      supplierName: 'Sample Hygiene Supplies (Sample)',
      status: 'open',
      isSample: true,
    });
  }

  // Linen stock and one batch already out to the laundry (30 bed sheets).
  const items = [
    { name: 'Bed sheet, cotton (Sample)', clean: 90, laundry: 30 },
    { name: 'OT drape (Sample)', clean: 40, laundry: 0 },
    { name: 'Patient gown (Sample)', clean: 60, laundry: 0 },
  ];
  for (const item of items) {
    const [existing] = await db
      .select({ id: schema.linenItems.id })
      .from(schema.linenItems)
      .where(and(eq(schema.linenItems.tenantId, tenantId), eq(schema.linenItems.locationId, locationId), eq(schema.linenItems.name, item.name)));
    if (existing) continue;
    const [row] = await db
      .insert(schema.linenItems)
      .values({ tenantId, locationId, name: item.name, cleanQty: item.clean, inLaundryQty: item.laundry, isSample: true })
      .returning();
    if (item.laundry > 0) {
      await db.insert(schema.laundryBatches).values({
        tenantId,
        locationId,
        number: 'LB-DEMO-01',
        linenItemId: row!.id,
        vendor: 'In-house laundry (Sample)',
        qtySent: item.laundry,
        status: 'sent',
        isSample: true,
      });
    }
  }
  log('sunrise indents and linen sample rows ensured');
}
