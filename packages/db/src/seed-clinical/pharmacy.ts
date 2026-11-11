import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { createDb, dbEnv, schema } from '../index';

const SUNRISE = 'sunrise-care';
const LOTUS = 'lotus-demo';

interface Move {
  batchId: string;
  qty: number;
  moveType: 'grn' | 'supplier_return' | 'sale' | 'sale_return' | 'ip_issue' | 'ip_return' | 'adjustment';
  refType: string;
  refId: string;
  refLine: string;
  reason?: string;
}

/** Sample pharmacy masters, one balanced stock position, and a medicine order for the queue. */
export async function seedPharmacy(log: (m: string) => void = () => {}): Promise<void> {
  const handle = createDb(dbEnv().migrationUrl, { max: 1 });
  try {
    const [sunrise] = await handle.db.select().from(schema.tenants).where(eq(schema.tenants.slug, SUNRISE));
    const [lotus] = await handle.db.select().from(schema.tenants).where(eq(schema.tenants.slug, LOTUS));
    if (!sunrise || !lotus) {
      log('pharmacy seed skipped (tenants missing)');
      return;
    }
    await seedOne(handle.db, sunrise.id, 'Pyrin 500 (Sample)', true, log);
    await seedOne(handle.db, lotus.id, 'Lotus Pyrin (Sample)', false, log);
  } finally {
    await Promise.race([handle.close(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
}

async function seedOne(
  db: ReturnType<typeof createDb>['db'],
  tenantId: string,
  markerBrand: string,
  withQueue: boolean,
  log: (m: string) => void,
): Promise<void> {
  const [existing] = await db
    .select({ id: schema.pharmacyItems.id })
    .from(schema.pharmacyItems)
    .where(and(eq(schema.pharmacyItems.tenantId, tenantId), eq(schema.pharmacyItems.brand, markerBrand)))
    .limit(1);
  if (existing) return;

  const [location] = await db
    .select()
    .from(schema.locations)
    .where(and(eq(schema.locations.tenantId, tenantId), eq(schema.locations.isPrimary, true)))
    .limit(1);
  const [encounter] = await db.select().from(schema.encounters).where(eq(schema.encounters.tenantId, tenantId)).limit(1);
  const [ipd] = await db
    .select()
    .from(schema.encounters)
    .where(and(eq(schema.encounters.tenantId, tenantId), eq(schema.encounters.kind, 'ipd')))
    .limit(1);
  const [user] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.tenantId, tenantId)).limit(1);
  if (!location || !encounter) {
    log(`pharmacy seed skipped for ${markerBrand} (location or encounter missing)`);
    return;
  }
  const admission = ipd ?? encounter;
  const prefix = location.docPrefix;
  const doc = (code: string, seq: string) => `${prefix}${code}/2627/${seq}`;
  const supplierId = randomUUID();
  const itemId = randomUUID();
  const batchId = randomUUID();
  const grnId = randomUUID();
  const grnLineId = randomUUID();
  const saleId = randomUUID();
  const saleLineId = randomUUID();
  const returnId = randomUUID();
  const returnLineId = randomUUID();
  const issueId = randomUUID();
  const issueLineId = randomUUID();
  const adjustmentId = randomUUID();
  const adjustmentLineId = randomUUID();
  const supplierReturnId = randomUUID();
  const supplierReturnLineId = randomUUID();

  await db.insert(schema.pharmacySuppliers).values({
    id: supplierId,
    tenantId,
    name: withQueue ? 'Malad Pharma Agencies (Sample)' : 'Vijay Nagar Drug House (Sample)',
    phone: withQueue ? '+91 9000014101' : '+91 9000014201',
    city: withQueue ? 'Mumbai' : 'Indore',
    isSample: true,
  });
  await db.insert(schema.pharmacyItems).values({
    id: itemId,
    tenantId,
    genericCode: 'PARACETAMOL',
    brand: markerBrand,
    form: 'tablet',
    strength: '500 mg',
    hsn: '30049099',
    gstRateBp: 1200,
    reorderLevel: 10,
    schedule: 'OTC',
    isSample: true,
  });
  await db.insert(schema.pharmacyBatches).values({
    id: batchId,
    tenantId,
    itemId,
    supplierId,
    batchNo: withQueue ? 'PYRIN-2627-A' : 'LOTUS-2627-A',
    expiry: '2027-08-31',
    mrpPaise: 11200,
    purchaseRatePaise: 8000,
  });

  const grnQty = withQueue ? 40 : 10;
  const receiptQty = grnQty + (withQueue ? 5 : 0);
  const receiptTaxable = 8000 * receiptQty;
  const receiptTax = Math.round((receiptTaxable * 1200) / 10_000);
  const moves: Move[] = [{ batchId, qty: grnQty, moveType: 'grn', refType: 'pharmacy_grn', refId: grnId, refLine: grnLineId }];
  await db.insert(schema.pharmacyGrns).values({
    id: grnId,
    tenantId,
    locationId: location.id,
    supplierId,
    number: doc('GR', '90001'),
    notes: 'Sample goods receipt',
    taxablePaise: receiptTaxable,
    taxPaise: receiptTax,
    totalPaise: receiptTaxable + receiptTax,
    createdBy: user?.id ?? null,
    isSample: true,
  });
  await db.insert(schema.pharmacyGrnLines).values({
    id: grnLineId,
    tenantId,
    grnId,
    lineNo: 1,
    itemId,
    batchId,
    qty: grnQty,
    mrpPaise: 11200,
    purchaseRatePaise: 8000,
    gstRateBp: 1200,
  });

  const saleQty = 2;
  const saleGross = saleQty * 11200;
  const saleTax = Math.round((saleGross * 1200) / (10_000 + 1200));
  const saleTaxable = saleGross - saleTax;
  const cgst = Math.round(saleTax / 2);
  await db.insert(schema.pharmacySales).values({
    id: saleId,
    tenantId,
    locationId: location.id,
    walkinName: 'Sample counter (Sample)',
    kind: 'outside',
    number: doc('PS', '90001'),
    mode: 'cash',
    docType: 'tax_invoice',
    grossPaise: saleGross,
    taxablePaise: saleTaxable,
    cgstPaise: cgst,
    sgstPaise: saleTax - cgst,
    igstPaise: 0,
    totalPaise: saleGross,
    createdBy: user?.id ?? null,
    isSample: true,
  });
  await db.insert(schema.pharmacySaleLines).values({
    id: saleLineId,
    tenantId,
    saleId,
    lineNo: 1,
    itemId,
    batchId,
    qty: saleQty,
    returnedQty: 1,
    mrpPaise: 11200,
    gstRateBp: 1200,
    grossPaise: saleGross,
    taxablePaise: saleTaxable,
    taxPaise: saleTax,
  });
  moves.push({ batchId, qty: -saleQty, moveType: 'sale', refType: 'pharmacy_sale', refId: saleId, refLine: saleLineId });

  const returnGross = 11200;
  const returnTax = Math.round((returnGross * 1200) / (10_000 + 1200));
  await db.insert(schema.pharmacySaleReturns).values({
    id: returnId,
    tenantId,
    locationId: location.id,
    saleId,
    number: doc('PR', '90001'),
    reason: 'Sample return',
    grossPaise: returnGross,
    taxablePaise: returnGross - returnTax,
    taxPaise: returnTax,
    createdBy: user?.id ?? null,
    isSample: true,
  });
  await db.insert(schema.pharmacySaleReturnLines).values({
    id: returnLineId,
    tenantId,
    returnId,
    lineNo: 1,
    saleLineId,
    batchId,
    qty: 1,
    grossPaise: returnGross,
    taxablePaise: returnGross - returnTax,
    taxPaise: returnTax,
  });
  moves.push({ batchId, qty: 1, moveType: 'sale_return', refType: 'pharmacy_sale_return', refId: returnId, refLine: returnLineId });

  await db.insert(schema.pharmacyIpIssues).values({
    id: issueId,
    tenantId,
    locationId: location.id,
    encounterId: admission.id,
    patientId: admission.patientId,
    number: doc('PI', '90001'),
    notes: 'Sample IP issue',
    createdBy: user?.id ?? null,
    isSample: true,
  });
  await db.insert(schema.pharmacyIpIssueLines).values({
    id: issueLineId,
    tenantId,
    issueId,
    lineNo: 1,
    itemId,
    batchId,
    qty: 1,
    mrpPaise: 11200,
  });
  moves.push({ batchId, qty: -1, moveType: 'ip_issue', refType: 'pharmacy_ip_issue', refId: issueId, refLine: issueLineId });

  await db.insert(schema.pharmacyAdjustments).values({
    id: adjustmentId,
    tenantId,
    locationId: location.id,
    number: doc('AJ', '90001'),
    reason: 'Broken strip (Sample)',
    createdBy: user?.id ?? null,
    isSample: true,
  });
  await db.insert(schema.pharmacyAdjustmentLines).values({
    id: adjustmentLineId,
    tenantId,
    adjustmentId,
    lineNo: 1,
    batchId,
    qtyDelta: -1,
    reason: 'Broken strip (Sample)',
  });
  moves.push({ batchId, qty: -1, moveType: 'adjustment', refType: 'pharmacy_adjustment', refId: adjustmentId, refLine: adjustmentLineId, reason: 'Broken strip (Sample)' });

  await db.insert(schema.pharmacySupplierReturns).values({
    id: supplierReturnId,
    tenantId,
    locationId: location.id,
    supplierId,
    number: doc('SR', '90001'),
    reason: 'Damaged carton (Sample)',
    createdBy: user?.id ?? null,
    isSample: true,
  });
  await db.insert(schema.pharmacySupplierReturnLines).values({
    id: supplierReturnLineId,
    tenantId,
    returnId: supplierReturnId,
    lineNo: 1,
    batchId,
    qty: 1,
  });
  moves.push({ batchId, qty: -1, moveType: 'supplier_return', refType: 'pharmacy_supplier_return', refId: supplierReturnId, refLine: supplierReturnLineId, reason: 'Damaged carton (Sample)' });

  let expiredBatchId: string | null = null;
  if (withQueue) {
    expiredBatchId = randomUUID();
    const expiredLine = randomUUID();
    await db.insert(schema.pharmacyBatches).values({
      id: expiredBatchId,
      tenantId,
      itemId,
      supplierId,
      batchNo: 'PYRIN-2401-X',
      expiry: '2024-12-01',
      mrpPaise: 11200,
      purchaseRatePaise: 8000,
    });
    await db.insert(schema.pharmacyGrnLines).values({
      id: expiredLine,
      tenantId,
      grnId,
      lineNo: 2,
      itemId,
      batchId: expiredBatchId,
      qty: 5,
      mrpPaise: 11200,
      purchaseRatePaise: 8000,
      gstRateBp: 1200,
    });
    moves.push({ batchId: expiredBatchId, qty: 5, moveType: 'grn', refType: 'pharmacy_grn', refId: grnId, refLine: expiredLine });

    const [opd] = await db
      .select()
      .from(schema.encounters)
      .where(and(eq(schema.encounters.tenantId, tenantId), eq(schema.encounters.kind, 'opd')))
      .limit(1);
    if (opd) {
      const orderId = randomUUID();
      await db.insert(schema.clinicalOrders).values({
        id: orderId,
        tenantId,
        locationId: location.id,
        encounterId: opd.id,
        patientId: opd.patientId,
        kind: 'medicine',
        number: doc('OR', '90001'),
        source: 'opd',
        status: 'placed',
        notes: 'Sample prescription (Sample)',
        orderingDoctorId: opd.doctorId,
        orderedByUserId: user?.id ?? null,
      });
      await db.insert(schema.clinicalOrderItems).values({
        tenantId,
        orderId,
        lineNo: 1,
        drugName: 'Paracetamol',
        genericCode: 'PARACETAMOL',
        strength: '500 mg',
        doseForm: 'tablet',
        dose: '1',
        frequencyCode: 'TDS',
        routeCode: 'PO',
        durationDays: 3,
        quantity: 10,
        status: 'pending',
      });
    }
  }

  const qtyByBatch = new Map<string, number>();
  for (const move of moves) qtyByBatch.set(move.batchId, (qtyByBatch.get(move.batchId) ?? 0) + move.qty);
  for (const [id, qty] of qtyByBatch) {
    await db.insert(schema.pharmacyStock).values({ tenantId, batchId: id, locationId: location.id, qty });
  }
  await db.insert(schema.pharmacyStockMoves).values(
    moves.map((move) => ({
      tenantId,
      batchId: move.batchId,
      locationId: location.id,
      qty: move.qty,
      moveType: move.moveType,
      refType: move.refType,
      refId: move.refId,
      refLine: move.refLine,
      reason: move.reason ?? '',
      createdBy: user?.id ?? null,
    })),
  );
  log(`pharmacy sample stock for ${markerBrand}${expiredBatchId ? ' (includes an expired batch)' : ''}`);
}
