import { randomUUID } from 'node:crypto';
import { schema } from '@hos/db';
import {
  CLINICAL_FEATURES,
  HEALTHCARE_SAC,
  MAX_DOC_NUMBER_LENGTH,
  documentTypeFor,
  formatDocNumber,
  fyCode,
  splitInclusive,
  type ClinicalOrderDto,
  type ClinicalOrderItemDto,
  type PharmacyAdjustmentInput,
  type PharmacyGrnInput,
  type PharmacyInpatientDto,
  type PharmacyIpIssueDto,
  type PharmacyIpIssueInput,
  type PharmacyIpReturnInput,
  type PharmacyItemDto,
  type PharmacyItemInput,
  type PharmacyItemPatch,
  type PharmacyQueueItemDto,
  type PharmacySaleDto,
  type PharmacySaleInput,
  type PharmacySaleReturnInput,
  type PharmacyStockRowDto,
  type PharmacySupplierDto,
  type PharmacySupplierInput,
  type PharmacySupplierPatch,
  type PharmacySupplierReturnInput,
  type PharmacySchedule,
} from '@hos/shared';
import { and, asc, desc, eq, ilike, inArray, sql } from 'drizzle-orm';
import { ApiError } from '../../http';
import { cash } from '../cash';
import { charges } from '../charges';
import { numbering } from '../numbering';
import { orders } from '../orders';
import { allocateFefo, applyStock, istDay, todayIst, type PharmacyCtx } from './stock';

export type { PharmacyCtx };

export const pharmacyFeatures = CLINICAL_FEATURES.pharmacy;

function itemDto(row: typeof schema.pharmacyItems.$inferSelect): PharmacyItemDto {
  return {
    id: row.id,
    genericCode: row.genericCode,
    brand: row.brand,
    form: row.form,
    strength: row.strength,
    hsn: row.hsn,
    gstRateBp: row.gstRateBp,
    reorderLevel: row.reorderLevel,
    schedule: row.schedule as PharmacySchedule,
    active: row.active,
  };
}

function supplierDto(row: typeof schema.pharmacySuppliers.$inferSelect): PharmacySupplierDto {
  return { id: row.id, name: row.name, gstin: row.gstin, phone: row.phone, city: row.city, active: row.active };
}

function halves(taxPaise: number): { cgstPaise: number; sgstPaise: number } {
  const cgstPaise = Math.round(taxPaise / 2);
  return { cgstPaise, sgstPaise: taxPaise - cgstPaise };
}

async function loadItem(ctx: PharmacyCtx, id: string) {
  const [row] = await ctx.tx.select().from(schema.pharmacyItems).where(eq(schema.pharmacyItems.id, id));
  if (!row) throw new ApiError(404, 'not_found', 'Item not found');
  return row;
}

async function loadBatch(ctx: PharmacyCtx, id: string) {
  const [row] = await ctx.tx.select().from(schema.pharmacyBatches).where(eq(schema.pharmacyBatches.id, id));
  if (!row) throw new ApiError(404, 'not_found', 'Batch not found');
  return row;
}

/** Series that are not in the shared DOC_SERIES list (SR supplier return, PI IP issue, AJ adjustment). */
async function localNumber(ctx: PharmacyCtx, series: string, code: string): Promise<string> {
  const [loc] = await ctx.tx.select({ docPrefix: schema.locations.docPrefix }).from(schema.locations).where(eq(schema.locations.id, ctx.locationId));
  if (!loc?.docPrefix) throw new ApiError(422, 'location_required', 'This location has no document prefix');
  const fy = fyCode(new Date());
  const found = await ctx.tx.execute<{ n: number }>(sql`select hos_next_number(${series}, ${ctx.locationId}::uuid, ${fy}) as n`);
  const n = Number(found.rows[0]?.n);
  if (!n || n < 1) throw new ApiError(422, 'series_exhausted', 'Could not take the next number');
  const formatted = formatDocNumber(loc.docPrefix, code, fy, n);
  if (formatted.length > MAX_DOC_NUMBER_LENGTH) throw new ApiError(422, 'series_exhausted', 'That number would be longer than 16 characters');
  return formatted;
}

export async function listItems(ctx: PharmacyCtx, q?: string): Promise<PharmacyItemDto[]> {
  const rows = await ctx.tx.select().from(schema.pharmacyItems).orderBy(asc(schema.pharmacyItems.brand));
  const needle = q?.trim().toLowerCase();
  return rows
    .filter((row) => !needle || `${row.brand} ${row.genericCode} ${row.strength}`.toLowerCase().includes(needle))
    .map(itemDto);
}

export async function createItem(ctx: PharmacyCtx, input: PharmacyItemInput): Promise<PharmacyItemDto> {
  const [row] = await ctx.tx
    .insert(schema.pharmacyItems)
    .values({
      tenantId: ctx.tenantId,
      genericCode: input.genericCode.toUpperCase(),
      brand: input.brand,
      form: input.form,
      strength: input.strength,
      hsn: input.hsn,
      gstRateBp: input.gstRateBp,
      reorderLevel: input.reorderLevel,
      schedule: input.schedule,
      active: input.active ?? true,
    })
    .returning();
  await ctx.audit('pharmacy.item.create', 'pharmacy_item', row!.id, null, itemDto(row!));
  return itemDto(row!);
}

export async function updateItem(ctx: PharmacyCtx, id: string, patch: PharmacyItemPatch): Promise<PharmacyItemDto> {
  const current = await loadItem(ctx, id);
  const [row] = await ctx.tx
    .update(schema.pharmacyItems)
    .set({
      genericCode: patch.genericCode?.toUpperCase() ?? current.genericCode,
      brand: patch.brand ?? current.brand,
      form: patch.form ?? current.form,
      strength: patch.strength ?? current.strength,
      hsn: patch.hsn ?? current.hsn,
      gstRateBp: patch.gstRateBp ?? current.gstRateBp,
      reorderLevel: patch.reorderLevel ?? current.reorderLevel,
      schedule: patch.schedule ?? current.schedule,
      active: patch.active ?? current.active,
    })
    .where(eq(schema.pharmacyItems.id, id))
    .returning();
  await ctx.audit('pharmacy.item.update', 'pharmacy_item', id, itemDto(current), itemDto(row!));
  return itemDto(row!);
}

export async function listSuppliers(ctx: PharmacyCtx, q?: string): Promise<PharmacySupplierDto[]> {
  const needle = q?.trim();
  const rows = needle
    ? await ctx.tx.select().from(schema.pharmacySuppliers).where(ilike(schema.pharmacySuppliers.name, `%${needle.replace(/[%_]/g, '')}%`)).orderBy(asc(schema.pharmacySuppliers.name))
    : await ctx.tx.select().from(schema.pharmacySuppliers).orderBy(asc(schema.pharmacySuppliers.name));
  return rows.map(supplierDto);
}

export async function createSupplier(ctx: PharmacyCtx, input: PharmacySupplierInput): Promise<PharmacySupplierDto> {
  const [row] = await ctx.tx
    .insert(schema.pharmacySuppliers)
    .values({
      tenantId: ctx.tenantId,
      name: input.name,
      gstin: input.gstin.toUpperCase(),
      phone: input.phone,
      city: input.city,
      active: input.active ?? true,
    })
    .returning();
  await ctx.audit('pharmacy.supplier.create', 'pharmacy_supplier', row!.id, null, supplierDto(row!));
  return supplierDto(row!);
}

export async function updateSupplier(ctx: PharmacyCtx, id: string, patch: PharmacySupplierPatch): Promise<PharmacySupplierDto> {
  const [current] = await ctx.tx.select().from(schema.pharmacySuppliers).where(eq(schema.pharmacySuppliers.id, id));
  if (!current) throw new ApiError(404, 'not_found', 'Supplier not found');
  const [row] = await ctx.tx
    .update(schema.pharmacySuppliers)
    .set({
      name: patch.name ?? current.name,
      gstin: (patch.gstin ?? current.gstin).toUpperCase(),
      phone: patch.phone ?? current.phone,
      city: patch.city ?? current.city,
      active: patch.active ?? current.active,
    })
    .where(eq(schema.pharmacySuppliers.id, id))
    .returning();
  await ctx.audit('pharmacy.supplier.update', 'pharmacy_supplier', id, supplierDto(current), supplierDto(row!));
  return supplierDto(row!);
}

export async function listStock(ctx: PharmacyCtx): Promise<PharmacyStockRowDto[]> {
  const rows = await ctx.tx.execute<{
    stock_id: string;
    item_id: string;
    brand: string;
    generic_code: string;
    strength: string;
    form: string;
    schedule: PharmacySchedule;
    reorder_level: number;
    batch_id: string;
    batch_no: string;
    expiry: string;
    mrp_paise: number;
    qty: number;
    move_sum: number;
  }>(sql`
    select s.id as stock_id, i.id as item_id, i.brand, i.generic_code, i.strength, i.form, i.schedule,
           i.reorder_level, b.id as batch_id, b.batch_no, b.expiry::text as expiry, b.mrp_paise,
           s.qty::int as qty,
           coalesce((
             select sum(m.qty)::int from pharmacy_stock_moves m
              where m.batch_id = s.batch_id and m.location_id = s.location_id
           ), 0) as move_sum
      from pharmacy_stock s
      join pharmacy_batches b on b.id = s.batch_id
      join pharmacy_items i on i.id = b.item_id
     where s.location_id = ${ctx.locationId}::uuid
     order by i.brand, b.expiry
  `);
  const today = todayIst();
  return rows.rows.map((row) => {
    const expiry = String(row.expiry).slice(0, 10);
    const qty = Number(row.qty);
    return {
      stockId: row.stock_id,
      itemId: row.item_id,
      brand: row.brand,
      genericCode: row.generic_code,
      strength: row.strength,
      form: row.form,
      schedule: row.schedule,
      reorderLevel: Number(row.reorder_level),
      batchId: row.batch_id,
      batchNo: row.batch_no,
      expiry,
      mrpPaise: Number(row.mrp_paise),
      qty,
      moveSum: Number(row.move_sum),
      expired: expiry < today,
      low: qty <= Number(row.reorder_level),
    };
  });
}

function orderItemDto(line: typeof schema.clinicalOrderItems.$inferSelect): ClinicalOrderItemDto {
  return {
    id: line.id,
    orderId: line.orderId,
    lineNo: line.lineNo,
    serviceId: line.serviceId,
    drugName: line.drugName,
    genericCode: line.genericCode,
    strength: line.strength,
    doseForm: line.doseForm,
    dose: line.dose,
    frequencyCode: line.frequencyCode,
    routeCode: line.routeCode,
    durationDays: line.durationDays,
    quantity: line.quantity == null ? null : Number(line.quantity),
    dietCode: line.dietCode,
    instructions: line.instructions,
    status: line.status as ClinicalOrderItemDto['status'],
    fulfilledQty: Number(line.fulfilledQty),
    fulfilledRefType: line.fulfilledRefType,
    fulfilledRefId: line.fulfilledRefId,
  };
}

export async function openPrescriptions(ctx: PharmacyCtx): Promise<PharmacyQueueItemDto[]> {
  const headers = await ctx.tx
    .select()
    .from(schema.clinicalOrders)
    .where(and(eq(schema.clinicalOrders.locationId, ctx.locationId), eq(schema.clinicalOrders.kind, 'medicine'), inArray(schema.clinicalOrders.status, ['placed', 'in_progress'])))
    .orderBy(asc(schema.clinicalOrders.placedAt));
  const out: PharmacyQueueItemDto[] = [];
  for (const order of headers) {
    const lines = await ctx.tx.select().from(schema.clinicalOrderItems).where(eq(schema.clinicalOrderItems.orderId, order.id)).orderBy(asc(schema.clinicalOrderItems.lineNo));
    if (!lines.some((line) => line.status === 'pending' || line.status === 'in_progress')) continue;
    const [patient] = await ctx.tx.select({ fullName: schema.patients.fullName, uhid: schema.patients.uhid }).from(schema.patients).where(eq(schema.patients.id, order.patientId));
    const [encounter] = await ctx.tx.select({ number: schema.encounters.number }).from(schema.encounters).where(eq(schema.encounters.id, order.encounterId));
    const dto: ClinicalOrderDto = {
      id: order.id,
      locationId: order.locationId,
      encounterId: order.encounterId,
      patientId: order.patientId,
      kind: 'medicine',
      number: order.number,
      source: order.source as ClinicalOrderDto['source'],
      priority: order.priority as ClinicalOrderDto['priority'],
      status: order.status as ClinicalOrderDto['status'],
      orderingDoctorId: order.orderingDoctorId,
      orderedByUserId: order.orderedByUserId,
      notes: order.notes,
      placedAt: order.placedAt instanceof Date ? order.placedAt.toISOString() : new Date(order.placedAt).toISOString(),
      cancelledAt: order.cancelledAt ? (order.cancelledAt instanceof Date ? order.cancelledAt.toISOString() : new Date(order.cancelledAt).toISOString()) : null,
      cancelReason: order.cancelReason,
      items: lines.map(orderItemDto),
    };
    out.push({
      order: dto,
      patientName: patient?.fullName ?? '',
      uhid: patient?.uhid ?? '',
      encounterNumber: encounter?.number ?? '',
    });
  }
  return out;
}

export async function listInpatients(ctx: PharmacyCtx): Promise<PharmacyInpatientDto[]> {
  const rows = await ctx.tx
    .select({
      encounterId: schema.encounters.id,
      patientId: schema.encounters.patientId,
      number: schema.encounters.number,
      bedLabel: schema.encounters.currentBedLabel,
      uhid: schema.patients.uhid,
      patientName: schema.patients.fullName,
    })
    .from(schema.encounters)
    .innerJoin(schema.patients, eq(schema.patients.id, schema.encounters.patientId))
    .where(and(eq(schema.encounters.locationId, ctx.locationId), eq(schema.encounters.kind, 'ipd'), eq(schema.encounters.status, 'open')))
    .orderBy(asc(schema.patients.fullName));
  return rows.map((row) => ({ ...row, patientName: row.patientName ?? '' }));
}

export async function postGrn(ctx: PharmacyCtx, input: PharmacyGrnInput): Promise<{ id: string; number: string; totalPaise: number }> {
  const [supplier] = await ctx.tx.select({ id: schema.pharmacySuppliers.id }).from(schema.pharmacySuppliers).where(eq(schema.pharmacySuppliers.id, input.supplierId));
  if (!supplier) throw new ApiError(404, 'not_found', 'Supplier not found');
  const grnId = randomUUID();
  let taxable = 0;
  let tax = 0;
  const lines: (typeof schema.pharmacyGrnLines.$inferInsert)[] = [];
  let lineNo = 1;
  for (const line of input.lines) {
    const item = await loadItem(ctx, line.itemId);
    const [existing] = await ctx.tx
      .select()
      .from(schema.pharmacyBatches)
      .where(and(eq(schema.pharmacyBatches.itemId, item.id), eq(schema.pharmacyBatches.batchNo, line.batchNo)));
    let batchId: string;
    if (existing) {
      if (String(existing.expiry).slice(0, 10) !== line.expiry || Number(existing.mrpPaise) !== line.mrpPaise) {
        throw new ApiError(409, 'batch_conflict', `Batch ${line.batchNo} is already on file with a different MRP or expiry`);
      }
      batchId = existing.id;
    } else {
      batchId = randomUUID();
      await ctx.tx.insert(schema.pharmacyBatches).values({
        id: batchId,
        tenantId: ctx.tenantId,
        itemId: item.id,
        supplierId: input.supplierId,
        batchNo: line.batchNo,
        expiry: line.expiry,
        mrpPaise: line.mrpPaise,
        purchaseRatePaise: line.purchaseRatePaise,
      });
    }
    const lineId = randomUUID();
    await applyStock(ctx, { batchId, qtyDelta: line.qty, moveType: 'grn', refType: 'pharmacy_grn', refId: grnId, refLine: lineId });
    const lineTaxable = line.purchaseRatePaise * line.qty;
    const lineTax = Math.round((lineTaxable * item.gstRateBp) / 10_000);
    taxable += lineTaxable;
    tax += lineTax;
    lines.push({
      id: lineId,
      tenantId: ctx.tenantId,
      grnId,
      lineNo: lineNo++,
      itemId: item.id,
      batchId,
      qty: line.qty,
      mrpPaise: line.mrpPaise,
      purchaseRatePaise: line.purchaseRatePaise,
      gstRateBp: item.gstRateBp,
    });
  }
  const number = await numbering.next(ctx, 'grn');
  await ctx.tx.insert(schema.pharmacyGrns).values({
    id: grnId,
    tenantId: ctx.tenantId,
    locationId: ctx.locationId,
    supplierId: input.supplierId,
    number,
    notes: input.notes ?? '',
    taxablePaise: taxable,
    taxPaise: tax,
    totalPaise: taxable + tax,
    createdBy: ctx.userId,
  });
  await ctx.tx.insert(schema.pharmacyGrnLines).values(lines);
  await ctx.audit('pharmacy.grn.post', 'pharmacy_grn', grnId, null, { number, totalPaise: taxable + tax });
  return { id: grnId, number, totalPaise: taxable + tax };
}

export async function postSupplierReturn(ctx: PharmacyCtx, input: PharmacySupplierReturnInput): Promise<{ id: string; number: string }> {
  const [supplier] = await ctx.tx.select({ id: schema.pharmacySuppliers.id }).from(schema.pharmacySuppliers).where(eq(schema.pharmacySuppliers.id, input.supplierId));
  if (!supplier) throw new ApiError(404, 'not_found', 'Supplier not found');
  const returnId = randomUUID();
  const lines: (typeof schema.pharmacySupplierReturnLines.$inferInsert)[] = [];
  let lineNo = 1;
  for (const line of input.lines) {
    const batch = await loadBatch(ctx, line.batchId);
    const lineId = randomUUID();
    await applyStock(ctx, {
      batchId: batch.id,
      qtyDelta: -line.qty,
      moveType: 'supplier_return',
      refType: 'pharmacy_supplier_return',
      refId: returnId,
      refLine: lineId,
      reason: input.reason,
    });
    lines.push({ id: lineId, tenantId: ctx.tenantId, returnId, lineNo: lineNo++, batchId: batch.id, qty: line.qty });
  }
  const number = await localNumber(ctx, 'supplier_return', 'SR');
  await ctx.tx.insert(schema.pharmacySupplierReturns).values({
    id: returnId,
    tenantId: ctx.tenantId,
    locationId: ctx.locationId,
    supplierId: input.supplierId,
    number,
    reason: input.reason,
    createdBy: ctx.userId,
  });
  await ctx.tx.insert(schema.pharmacySupplierReturnLines).values(lines);
  await ctx.audit('pharmacy.supplier_return.post', 'pharmacy_supplier_return', returnId, null, { number, reason: input.reason });
  return { id: returnId, number };
}

export async function readSale(ctx: PharmacyCtx, id: string): Promise<PharmacySaleDto> {
  const [sale] = await ctx.tx.select().from(schema.pharmacySales).where(eq(schema.pharmacySales.id, id));
  if (!sale) throw new ApiError(404, 'not_found', 'Sale not found');
  const lines = await ctx.tx
    .select({
      id: schema.pharmacySaleLines.id,
      itemId: schema.pharmacySaleLines.itemId,
      brand: schema.pharmacyItems.brand,
      batchId: schema.pharmacySaleLines.batchId,
      batchNo: schema.pharmacyBatches.batchNo,
      qty: schema.pharmacySaleLines.qty,
      returnedQty: schema.pharmacySaleLines.returnedQty,
      mrpPaise: schema.pharmacySaleLines.mrpPaise,
      gstRateBp: schema.pharmacySaleLines.gstRateBp,
      grossPaise: schema.pharmacySaleLines.grossPaise,
      taxablePaise: schema.pharmacySaleLines.taxablePaise,
      taxPaise: schema.pharmacySaleLines.taxPaise,
    })
    .from(schema.pharmacySaleLines)
    .innerJoin(schema.pharmacyItems, eq(schema.pharmacyItems.id, schema.pharmacySaleLines.itemId))
    .innerJoin(schema.pharmacyBatches, eq(schema.pharmacyBatches.id, schema.pharmacySaleLines.batchId))
    .where(eq(schema.pharmacySaleLines.saleId, sale.id))
    .orderBy(asc(schema.pharmacySaleLines.lineNo));
  return {
    id: sale.id,
    number: sale.number,
    kind: sale.kind as PharmacySaleDto['kind'],
    patientId: sale.patientId,
    encounterId: sale.encounterId,
    walkinName: sale.walkinName,
    mode: sale.mode as PharmacySaleDto['mode'],
    docType: sale.docType as PharmacySaleDto['docType'],
    grossPaise: sale.grossPaise,
    taxablePaise: sale.taxablePaise,
    taxPaise: sale.cgstPaise + sale.sgstPaise + sale.igstPaise,
    cgstPaise: sale.cgstPaise,
    sgstPaise: sale.sgstPaise,
    igstPaise: sale.igstPaise,
    totalPaise: sale.totalPaise,
    lines: lines.map((line) => ({ ...line, mrpPaise: Number(line.mrpPaise), grossPaise: Number(line.grossPaise), taxablePaise: Number(line.taxablePaise), taxPaise: Number(line.taxPaise) })),
  };
}

export async function postSale(ctx: PharmacyCtx, input: PharmacySaleInput): Promise<PharmacySaleDto> {
  if (input.kind === 'op' && !input.patientId) throw new ApiError(422, 'validation', 'Choose the patient for an OP issue');
  if (input.kind === 'outside' && !input.patientId && !input.walkinName?.trim()) {
    throw new ApiError(422, 'validation', 'Enter the buyer name for an outside sale');
  }
  if (input.patientId) {
    const [patient] = await ctx.tx.select({ id: schema.patients.id }).from(schema.patients).where(eq(schema.patients.id, input.patientId));
    if (!patient) throw new ApiError(404, 'not_found', 'Patient not found');
  }
  if (input.encounterId) {
    const [encounter] = await ctx.tx.select().from(schema.encounters).where(eq(schema.encounters.id, input.encounterId));
    if (!encounter || encounter.locationId !== ctx.locationId) throw new ApiError(422, 'validation', 'That visit is not at this location');
    if (input.patientId && encounter.patientId !== input.patientId) throw new ApiError(422, 'validation', 'That visit does not match the patient');
  }
  const saleId = randomUUID();
  const drafted: {
    id: string;
    lineNo: number;
    itemId: string;
    batchId: string;
    qty: number;
    mrpPaise: number;
    gstRateBp: number;
    grossPaise: number;
    taxablePaise: number;
    taxPaise: number;
    orderItemId: string | null;
  }[] = [];
  const fulfilled = new Map<string, number>();
  let lineNo = 1;
  for (const line of input.lines) {
    const item = await loadItem(ctx, line.itemId);
    if (!item.active) throw new ApiError(422, 'validation', `${item.brand} is not active`);
    const parts = await allocateFefo(ctx, item.id, line.qty);
    for (const part of parts) {
      const lineId = randomUUID();
      await applyStock(ctx, { batchId: part.batchId, qtyDelta: -part.qty, moveType: 'sale', refType: 'pharmacy_sale', refId: saleId, refLine: lineId });
      const grossPaise = part.qty * part.mrpPaise;
      const split = splitInclusive(grossPaise, item.gstRateBp);
      drafted.push({
        id: lineId,
        lineNo: lineNo++,
        itemId: item.id,
        batchId: part.batchId,
        qty: part.qty,
        mrpPaise: part.mrpPaise,
        gstRateBp: item.gstRateBp,
        grossPaise,
        taxablePaise: split.taxablePaise,
        taxPaise: split.taxPaise,
        orderItemId: line.orderItemId ?? null,
      });
      if (line.orderItemId) fulfilled.set(line.orderItemId, (fulfilled.get(line.orderItemId) ?? 0) + part.qty);
    }
  }
  const grossPaise = drafted.reduce((sum, line) => sum + line.grossPaise, 0);
  const taxablePaise = drafted.reduce((sum, line) => sum + line.taxablePaise, 0);
  const taxPaise = drafted.reduce((sum, line) => sum + line.taxPaise, 0);
  const { cgstPaise, sgstPaise } = halves(taxPaise);
  const docType = documentTypeFor(
    drafted.map((line) => ({ treatment: 'taxable' as const, gstRateBp: line.gstRateBp })),
    false,
  );
  const number = await numbering.next(ctx, 'pharmacy_sale');
  await ctx.tx.insert(schema.pharmacySales).values({
    id: saleId,
    tenantId: ctx.tenantId,
    locationId: ctx.locationId,
    patientId: input.patientId ?? null,
    encounterId: input.encounterId ?? null,
    walkinName: input.walkinName?.trim() ?? '',
    kind: input.kind,
    number,
    mode: input.mode,
    docType,
    grossPaise,
    taxablePaise,
    cgstPaise,
    sgstPaise,
    igstPaise: 0,
    totalPaise: grossPaise,
    createdBy: ctx.userId,
  });
  await ctx.tx.insert(schema.pharmacySaleLines).values(
    drafted.map((line) => ({
      id: line.id,
      tenantId: ctx.tenantId,
      saleId,
      lineNo: line.lineNo,
      itemId: line.itemId,
      batchId: line.batchId,
      orderItemId: line.orderItemId,
      qty: line.qty,
      mrpPaise: line.mrpPaise,
      gstRateBp: line.gstRateBp,
      grossPaise: line.grossPaise,
      taxablePaise: line.taxablePaise,
      taxPaise: line.taxPaise,
    })),
  );
  if (grossPaise > 0) {
    await cash.record(ctx, {
      counterCode: 'PHARMACY',
      entryType: 'receipt',
      direction: 'in',
      mode: input.mode,
      amountPaise: grossPaise,
      patientId: input.patientId ?? null,
      encounterId: input.encounterId ?? null,
      refType: 'pharmacy_sale',
      refId: saleId,
    });
  }
  for (const [orderItemId, qty] of fulfilled) {
    const [orderItem] = await ctx.tx.select().from(schema.clinicalOrderItems).where(eq(schema.clinicalOrderItems.id, orderItemId));
    if (!orderItem) throw new ApiError(404, 'not_found', 'Prescription line not found');
    const target = orderItem.quantity == null ? qty : Number(orderItem.quantity);
    await orders.recordFulfilment(ctx, orderItemId, {
      status: qty >= target ? 'done' : 'in_progress',
      qty,
      refType: 'pharmacy_sale',
      refId: saleId,
    });
  }
  await ctx.audit('pharmacy.sale.post', 'pharmacy_sale', saleId, null, { number, kind: input.kind, grossPaise, taxablePaise, taxPaise });
  return readSale(ctx, saleId);
}

export async function returnSale(ctx: PharmacyCtx, saleId: string, input: PharmacySaleReturnInput): Promise<{ id: string; number: string; grossPaise: number }> {
  const sale = await readSale(ctx, saleId);
  const returnId = randomUUID();
  const drafted: (typeof schema.pharmacySaleReturnLines.$inferInsert)[] = [];
  let lineNo = 1;
  let gross = 0;
  let taxable = 0;
  let tax = 0;
  for (const req of input.lines) {
    const [line] = await ctx.tx.select().from(schema.pharmacySaleLines).where(and(eq(schema.pharmacySaleLines.id, req.saleLineId), eq(schema.pharmacySaleLines.saleId, sale.id)));
    if (!line) throw new ApiError(404, 'not_found', 'Sale line not found');
    const remaining = line.qty - line.returnedQty;
    if (req.qty > remaining) throw new ApiError(422, 'validation', 'Return quantity is more than the quantity sold');
    const lineId = randomUUID();
    await applyStock(ctx, { batchId: line.batchId, qtyDelta: req.qty, moveType: 'sale_return', refType: 'pharmacy_sale_return', refId: returnId, refLine: lineId, reason: input.reason });
    const grossPaise = req.qty * Number(line.mrpPaise);
    const split = splitInclusive(grossPaise, line.gstRateBp);
    gross += grossPaise;
    taxable += split.taxablePaise;
    tax += split.taxPaise;
    drafted.push({
      id: lineId,
      tenantId: ctx.tenantId,
      returnId,
      lineNo: lineNo++,
      saleLineId: line.id,
      batchId: line.batchId,
      qty: req.qty,
      grossPaise,
      taxablePaise: split.taxablePaise,
      taxPaise: split.taxPaise,
    });
    await ctx.tx.update(schema.pharmacySaleLines).set({ returnedQty: line.returnedQty + req.qty }).where(eq(schema.pharmacySaleLines.id, line.id));
  }
  const number = await numbering.next(ctx, 'pharmacy_return');
  await ctx.tx.insert(schema.pharmacySaleReturns).values({
    id: returnId,
    tenantId: ctx.tenantId,
    locationId: ctx.locationId,
    saleId: sale.id,
    patientId: sale.patientId,
    number,
    reason: input.reason,
    grossPaise: gross,
    taxablePaise: taxable,
    taxPaise: tax,
    createdBy: ctx.userId,
  });
  await ctx.tx.insert(schema.pharmacySaleReturnLines).values(drafted);
  if (gross > 0) {
    await cash.record(ctx, {
      counterCode: 'PHARMACY',
      entryType: 'refund',
      direction: 'out',
      mode: sale.mode,
      amountPaise: gross,
      patientId: sale.patientId,
      encounterId: sale.encounterId,
      refType: 'pharmacy_return',
      refId: returnId,
    });
  }
  await ctx.audit('pharmacy.sale.return', 'pharmacy_sale_return', returnId, null, { number, saleId: sale.id, grossPaise: gross });
  return { id: returnId, number, grossPaise: gross };
}

async function readIpIssue(ctx: PharmacyCtx, id: string): Promise<PharmacyIpIssueDto> {
  const [issue] = await ctx.tx.select().from(schema.pharmacyIpIssues).where(eq(schema.pharmacyIpIssues.id, id));
  if (!issue) throw new ApiError(404, 'not_found', 'IP issue not found');
  const lines = await ctx.tx
    .select({
      id: schema.pharmacyIpIssueLines.id,
      itemId: schema.pharmacyIpIssueLines.itemId,
      brand: schema.pharmacyItems.brand,
      batchId: schema.pharmacyIpIssueLines.batchId,
      qty: schema.pharmacyIpIssueLines.qty,
      returnedQty: schema.pharmacyIpIssueLines.returnedQty,
      mrpPaise: schema.pharmacyIpIssueLines.mrpPaise,
      chargeId: schema.pharmacyIpIssueLines.chargeId,
    })
    .from(schema.pharmacyIpIssueLines)
    .innerJoin(schema.pharmacyItems, eq(schema.pharmacyItems.id, schema.pharmacyIpIssueLines.itemId))
    .where(eq(schema.pharmacyIpIssueLines.issueId, issue.id))
    .orderBy(asc(schema.pharmacyIpIssueLines.lineNo));
  return {
    id: issue.id,
    number: issue.number,
    encounterId: issue.encounterId,
    patientId: issue.patientId,
    lines: lines.map((line) => ({ ...line, mrpPaise: Number(line.mrpPaise) })),
  };
}

export async function listIpIssues(ctx: PharmacyCtx): Promise<PharmacyIpIssueDto[]> {
  const rows = await ctx.tx.select({ id: schema.pharmacyIpIssues.id }).from(schema.pharmacyIpIssues).where(eq(schema.pharmacyIpIssues.locationId, ctx.locationId)).orderBy(desc(schema.pharmacyIpIssues.createdAt)).limit(50);
  const out: PharmacyIpIssueDto[] = [];
  for (const row of rows) out.push(await readIpIssue(ctx, row.id));
  return out;
}

export async function postIpIssue(ctx: PharmacyCtx, input: PharmacyIpIssueInput): Promise<PharmacyIpIssueDto> {
  const [encounter] = await ctx.tx.select().from(schema.encounters).where(eq(schema.encounters.id, input.encounterId));
  if (!encounter) throw new ApiError(404, 'not_found', 'Admission not found');
  if (encounter.kind !== 'ipd' || encounter.status !== 'open') throw new ApiError(422, 'validation', 'IP issues are for an open admission');
  if (encounter.locationId !== ctx.locationId) throw new ApiError(422, 'validation', 'That admission is not at this location');
  const issueId = randomUUID();
  const drafted: {
    id: string;
    lineNo: number;
    itemId: string;
    batchId: string;
    qty: number;
    mrpPaise: number;
    brand: string;
    strength: string;
  }[] = [];
  let lineNo = 1;
  for (const line of input.lines) {
    const item = await loadItem(ctx, line.itemId);
    if (!item.active) throw new ApiError(422, 'validation', `${item.brand} is not active`);
    const parts = await allocateFefo(ctx, item.id, line.qty);
    for (const part of parts) {
      const lineId = randomUUID();
      await applyStock(ctx, { batchId: part.batchId, qtyDelta: -part.qty, moveType: 'ip_issue', refType: 'pharmacy_ip_issue', refId: issueId, refLine: lineId });
      drafted.push({ id: lineId, lineNo: lineNo++, itemId: item.id, batchId: part.batchId, qty: part.qty, mrpPaise: part.mrpPaise, brand: item.brand, strength: item.strength });
    }
  }
  const number = await localNumber(ctx, 'ip_issue', 'PI');
  await ctx.tx.insert(schema.pharmacyIpIssues).values({
    id: issueId,
    tenantId: ctx.tenantId,
    locationId: ctx.locationId,
    encounterId: encounter.id,
    patientId: encounter.patientId,
    number,
    createdBy: ctx.userId,
  });
  for (const line of drafted) {
    const posted = await charges.post(ctx, {
      encounterId: encounter.id,
      patientId: encounter.patientId,
      serviceId: null,
      description: `${line.brand} ${line.strength}`.trim(),
      qty: line.qty,
      unitPricePaise: line.mrpPaise,
      gstTreatment: 'exempt_healthcare',
      gstRateBp: 0,
      hsnSac: HEALTHCARE_SAC,
      serviceDate: todayIst(),
      source: { module: 'pharmacy', type: 'pharmacy_ip_issue', id: issueId, line: line.id },
    });
    await ctx.tx.insert(schema.pharmacyIpIssueLines).values({
      id: line.id,
      tenantId: ctx.tenantId,
      issueId,
      lineNo: line.lineNo,
      itemId: line.itemId,
      batchId: line.batchId,
      qty: line.qty,
      mrpPaise: line.mrpPaise,
      chargeId: posted.id,
    });
  }
  await ctx.audit('pharmacy.ip_issue.post', 'pharmacy_ip_issue', issueId, null, { number, encounterId: encounter.id });
  return readIpIssue(ctx, issueId);
}

export async function returnIpIssue(ctx: PharmacyCtx, issueId: string, input: PharmacyIpReturnInput): Promise<PharmacyIpIssueDto> {
  const issue = await readIpIssue(ctx, issueId);
  for (const req of input.lines) {
    const [line] = await ctx.tx.select().from(schema.pharmacyIpIssueLines).where(and(eq(schema.pharmacyIpIssueLines.id, req.lineId), eq(schema.pharmacyIpIssueLines.issueId, issue.id)));
    if (!line) throw new ApiError(404, 'not_found', 'Issue line not found');
    const remaining = line.qty - line.returnedQty;
    if (req.qty > remaining) throw new ApiError(422, 'validation', 'Return quantity is more than the quantity issued');
    if (!line.chargeId) throw new ApiError(422, 'validation', 'This issue line has no charge to reverse');
    await applyStock(ctx, { batchId: line.batchId, qtyDelta: req.qty, moveType: 'ip_return', refType: 'pharmacy_ip_issue', refId: issue.id, refLine: line.id, reason: input.reason });
    await charges.reverse(ctx, line.chargeId, input.reason);
    const returnedQty = line.returnedQty + req.qty;
    const left = line.qty - returnedQty;
    let chargeId = line.chargeId;
    if (left > 0) {
      const item = await loadItem(ctx, line.itemId);
      const posted = await charges.post(ctx, {
        encounterId: issue.encounterId,
        patientId: issue.patientId,
        serviceId: null,
        description: `${item.brand} ${item.strength}`.trim(),
        qty: left,
        unitPricePaise: Number(line.mrpPaise),
        gstTreatment: 'exempt_healthcare',
        gstRateBp: 0,
        hsnSac: HEALTHCARE_SAC,
        serviceDate: todayIst(),
        source: { module: 'pharmacy', type: 'pharmacy_ip_issue', id: issue.id, line: `${line.id}:${returnedQty}` },
      });
      chargeId = posted.id;
    }
    await ctx.tx.update(schema.pharmacyIpIssueLines).set({ returnedQty, chargeId }).where(eq(schema.pharmacyIpIssueLines.id, line.id));
  }
  await ctx.audit('pharmacy.ip_issue.return', 'pharmacy_ip_issue', issue.id, null, { reason: input.reason });
  return readIpIssue(ctx, issue.id);
}

export async function postAdjustment(ctx: PharmacyCtx, input: PharmacyAdjustmentInput): Promise<{ id: string; number: string }> {
  const adjustmentId = randomUUID();
  const lines: (typeof schema.pharmacyAdjustmentLines.$inferInsert)[] = [];
  let lineNo = 1;
  for (const line of input.lines) {
    const batch = await loadBatch(ctx, line.batchId);
    const lineId = randomUUID();
    await applyStock(ctx, {
      batchId: batch.id,
      qtyDelta: line.qtyDelta,
      moveType: 'adjustment',
      refType: 'pharmacy_adjustment',
      refId: adjustmentId,
      refLine: lineId,
      reason: line.reason || input.reason,
    });
    lines.push({
      id: lineId,
      tenantId: ctx.tenantId,
      adjustmentId,
      lineNo: lineNo++,
      batchId: batch.id,
      qtyDelta: line.qtyDelta,
      reason: line.reason ?? '',
    });
  }
  const number = await localNumber(ctx, 'stock_adjustment', 'AJ');
  await ctx.tx.insert(schema.pharmacyAdjustments).values({
    id: adjustmentId,
    tenantId: ctx.tenantId,
    locationId: ctx.locationId,
    number,
    reason: input.reason,
    createdBy: ctx.userId,
  });
  await ctx.tx.insert(schema.pharmacyAdjustmentLines).values(lines);
  await ctx.audit('pharmacy.adjustment.post', 'pharmacy_adjustment', adjustmentId, null, { number, reason: input.reason });
  return { id: adjustmentId, number };
}

export function withinDates(value: Date | string, from?: string, to?: string): boolean {
  const day = istDay(value);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}
