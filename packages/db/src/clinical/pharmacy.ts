// B7 pharmacy tables. SQL lives in migrations 0170–0171. Do not drizzle-kit generate.
// pharmacy_stock uses a uuid id plus UNIQUE (tenant_id, batch_id, location_id).
// The plan's composite primary key is that unique key; the uuid id is what the RLS suites address.
import { sql } from 'drizzle-orm';
import { bigint, boolean, check, date, foreignKey, index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { clinicalOrderItems, encounters, patients } from './foundation';
import { locations, tenants, users } from '../schema';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const money = (name: string) => bigint(name, { mode: 'number' });

export const pharmacyItems = pgTable(
  'pharmacy_items',
  {
    id: id(),
    tenantId: tenantId(),
    genericCode: text('generic_code').notNull(),
    brand: text('brand').notNull(),
    form: text('form').notNull(),
    strength: text('strength').notNull().default(''),
    hsn: text('hsn').notNull(),
    gstRateBp: integer('gst_rate_bp').notNull(),
    reorderLevel: integer('reorder_level').notNull().default(0),
    schedule: text('schedule').notNull(),
    active: boolean('active').notNull().default(true),
    isSample: boolean('is_sample').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('pharmacy_items_tenant_id_uq').on(t.tenantId, t.id),
    index('pharmacy_items_generic_idx').on(t.tenantId, t.genericCode),
    check('pharmacy_items_gst_chk', sql`${t.gstRateBp} >= 0 and ${t.gstRateBp} <= 10000`),
    check('pharmacy_items_reorder_chk', sql`${t.reorderLevel} >= 0`),
    check('pharmacy_items_schedule_chk', sql`${t.schedule} in ('H', 'H1', 'X', 'OTC')`),
  ],
);

export const pharmacySuppliers = pgTable(
  'pharmacy_suppliers',
  {
    id: id(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    gstin: text('gstin').notNull().default(''),
    phone: text('phone').notNull().default(''),
    city: text('city').notNull().default(''),
    active: boolean('active').notNull().default(true),
    isSample: boolean('is_sample').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique('pharmacy_suppliers_tenant_id_uq').on(t.tenantId, t.id)],
);

export const pharmacyBatches = pgTable(
  'pharmacy_batches',
  {
    id: id(),
    tenantId: tenantId(),
    itemId: uuid('item_id').notNull(),
    supplierId: uuid('supplier_id'),
    batchNo: text('batch_no').notNull(),
    expiry: date('expiry').notNull(),
    mrpPaise: money('mrp_paise').notNull(),
    purchaseRatePaise: money('purchase_rate_paise').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('pharmacy_batches_tenant_id_uq').on(t.tenantId, t.id),
    unique('pharmacy_batches_no_uq').on(t.tenantId, t.itemId, t.batchNo),
    index('pharmacy_batches_expiry_idx').on(t.tenantId, t.expiry),
    foreignKey({ columns: [t.tenantId, t.itemId], foreignColumns: [pharmacyItems.tenantId, pharmacyItems.id], name: 'pharmacy_batches_item_fk' }),
    foreignKey({ columns: [t.tenantId, t.supplierId], foreignColumns: [pharmacySuppliers.tenantId, pharmacySuppliers.id], name: 'pharmacy_batches_supplier_fk' }),
    check('pharmacy_batches_money_chk', sql`${t.mrpPaise} >= 0 and ${t.purchaseRatePaise} >= 0`),
  ],
);

export const pharmacyStock = pgTable(
  'pharmacy_stock',
  {
    id: id(),
    tenantId: tenantId(),
    batchId: uuid('batch_id').notNull(),
    locationId: uuid('location_id').notNull(),
    qty: integer('qty').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('pharmacy_stock_tenant_id_uq').on(t.tenantId, t.id),
    unique('pharmacy_stock_loc_uq').on(t.tenantId, t.batchId, t.locationId),
    foreignKey({ columns: [t.tenantId, t.batchId], foreignColumns: [pharmacyBatches.tenantId, pharmacyBatches.id], name: 'pharmacy_stock_batch_fk' }),
    foreignKey({ columns: [t.tenantId, t.locationId], foreignColumns: [locations.tenantId, locations.id], name: 'pharmacy_stock_location_fk' }),
    check('pharmacy_stock_qty_chk', sql`${t.qty} >= 0`),
  ],
);

export const pharmacyStockMoves = pgTable(
  'pharmacy_stock_moves',
  {
    id: id(),
    tenantId: tenantId(),
    batchId: uuid('batch_id').notNull(),
    locationId: uuid('location_id').notNull(),
    qty: integer('qty').notNull(),
    moveType: text('move_type').notNull(),
    refType: text('ref_type').notNull(),
    refId: uuid('ref_id').notNull(),
    refLine: text('ref_line').notNull().default(''),
    reason: text('reason').notNull().default(''),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('pharmacy_stock_moves_tenant_id_uq').on(t.tenantId, t.id),
    index('pharmacy_stock_moves_batch_idx').on(t.tenantId, t.batchId, t.locationId),
    foreignKey({ columns: [t.tenantId, t.batchId], foreignColumns: [pharmacyBatches.tenantId, pharmacyBatches.id], name: 'pharmacy_stock_moves_batch_fk' }),
    foreignKey({ columns: [t.tenantId, t.locationId], foreignColumns: [locations.tenantId, locations.id], name: 'pharmacy_stock_moves_location_fk' }),
    foreignKey({ columns: [t.tenantId, t.createdBy], foreignColumns: [users.tenantId, users.id], name: 'pharmacy_stock_moves_user_fk' }),
    check('pharmacy_stock_moves_qty_chk', sql`${t.qty} <> 0`),
    check('pharmacy_stock_moves_type_chk', sql`${t.moveType} in ('grn', 'supplier_return', 'sale', 'sale_return', 'ip_issue', 'ip_return', 'adjustment')`),
  ],
);

export const pharmacyGrns = pgTable(
  'pharmacy_grns',
  {
    id: id(),
    tenantId: tenantId(),
    locationId: uuid('location_id').notNull(),
    supplierId: uuid('supplier_id').notNull(),
    number: text('number').notNull(),
    notes: text('notes').notNull().default(''),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    taxablePaise: money('taxable_paise').notNull().default(0),
    taxPaise: money('tax_paise').notNull().default(0),
    totalPaise: money('total_paise').notNull().default(0),
    createdBy: uuid('created_by'),
    isSample: boolean('is_sample').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('pharmacy_grns_tenant_id_uq').on(t.tenantId, t.id),
    unique('pharmacy_grns_number_uq').on(t.tenantId, t.number),
    foreignKey({ columns: [t.tenantId, t.locationId], foreignColumns: [locations.tenantId, locations.id], name: 'pharmacy_grns_location_fk' }),
    foreignKey({ columns: [t.tenantId, t.supplierId], foreignColumns: [pharmacySuppliers.tenantId, pharmacySuppliers.id], name: 'pharmacy_grns_supplier_fk' }),
    foreignKey({ columns: [t.tenantId, t.createdBy], foreignColumns: [users.tenantId, users.id], name: 'pharmacy_grns_user_fk' }),
  ],
);

export const pharmacyGrnLines = pgTable(
  'pharmacy_grn_lines',
  {
    id: id(),
    tenantId: tenantId(),
    grnId: uuid('grn_id').notNull(),
    lineNo: integer('line_no').notNull(),
    itemId: uuid('item_id').notNull(),
    batchId: uuid('batch_id').notNull(),
    qty: integer('qty').notNull(),
    mrpPaise: money('mrp_paise').notNull(),
    purchaseRatePaise: money('purchase_rate_paise').notNull(),
    gstRateBp: integer('gst_rate_bp').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('pharmacy_grn_lines_tenant_id_uq').on(t.tenantId, t.id),
    unique('pharmacy_grn_lines_line_uq').on(t.tenantId, t.grnId, t.lineNo),
    foreignKey({ columns: [t.tenantId, t.grnId], foreignColumns: [pharmacyGrns.tenantId, pharmacyGrns.id], name: 'pharmacy_grn_lines_grn_fk' }),
    foreignKey({ columns: [t.tenantId, t.itemId], foreignColumns: [pharmacyItems.tenantId, pharmacyItems.id], name: 'pharmacy_grn_lines_item_fk' }),
    foreignKey({ columns: [t.tenantId, t.batchId], foreignColumns: [pharmacyBatches.tenantId, pharmacyBatches.id], name: 'pharmacy_grn_lines_batch_fk' }),
    check('pharmacy_grn_lines_qty_chk', sql`${t.qty} > 0`),
    check('pharmacy_grn_lines_money_chk', sql`${t.mrpPaise} >= 0 and ${t.purchaseRatePaise} >= 0 and ${t.gstRateBp} >= 0`),
  ],
);

export const pharmacySales = pgTable(
  'pharmacy_sales',
  {
    id: id(),
    tenantId: tenantId(),
    locationId: uuid('location_id').notNull(),
    patientId: uuid('patient_id'),
    encounterId: uuid('encounter_id'),
    walkinName: text('walkin_name').notNull().default(''),
    kind: text('kind').notNull(),
    number: text('number').notNull(),
    mode: text('mode').notNull(),
    docType: text('doc_type').notNull(),
    grossPaise: money('gross_paise').notNull(),
    taxablePaise: money('taxable_paise').notNull(),
    cgstPaise: money('cgst_paise').notNull(),
    sgstPaise: money('sgst_paise').notNull(),
    igstPaise: money('igst_paise').notNull().default(0),
    totalPaise: money('total_paise').notNull(),
    createdBy: uuid('created_by'),
    isSample: boolean('is_sample').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('pharmacy_sales_tenant_id_uq').on(t.tenantId, t.id),
    unique('pharmacy_sales_number_uq').on(t.tenantId, t.number),
    foreignKey({ columns: [t.tenantId, t.locationId], foreignColumns: [locations.tenantId, locations.id], name: 'pharmacy_sales_location_fk' }),
    foreignKey({ columns: [t.tenantId, t.patientId], foreignColumns: [patients.tenantId, patients.id], name: 'pharmacy_sales_patient_fk' }),
    foreignKey({ columns: [t.tenantId, t.encounterId], foreignColumns: [encounters.tenantId, encounters.id], name: 'pharmacy_sales_encounter_fk' }),
    foreignKey({ columns: [t.tenantId, t.createdBy], foreignColumns: [users.tenantId, users.id], name: 'pharmacy_sales_user_fk' }),
    check('pharmacy_sales_kind_chk', sql`${t.kind} in ('op', 'outside')`),
    check('pharmacy_sales_mode_chk', sql`${t.mode} in ('cash', 'upi', 'card', 'cheque', 'neft')`),
    check('pharmacy_sales_doc_chk', sql`${t.docType} in ('bill_of_supply', 'tax_invoice', 'invoice_cum_bill_of_supply')`),
    check('pharmacy_sales_money_chk', sql`${t.grossPaise} >= 0 and ${t.taxablePaise} >= 0 and ${t.cgstPaise} >= 0 and ${t.sgstPaise} >= 0 and ${t.igstPaise} >= 0 and ${t.totalPaise} >= 0`),
  ],
);

export const pharmacySaleLines = pgTable(
  'pharmacy_sale_lines',
  {
    id: id(),
    tenantId: tenantId(),
    saleId: uuid('sale_id').notNull(),
    lineNo: integer('line_no').notNull(),
    itemId: uuid('item_id').notNull(),
    batchId: uuid('batch_id').notNull(),
    orderItemId: uuid('order_item_id'),
    qty: integer('qty').notNull(),
    returnedQty: integer('returned_qty').notNull().default(0),
    mrpPaise: money('mrp_paise').notNull(),
    gstRateBp: integer('gst_rate_bp').notNull(),
    grossPaise: money('gross_paise').notNull(),
    taxablePaise: money('taxable_paise').notNull(),
    taxPaise: money('tax_paise').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('pharmacy_sale_lines_tenant_id_uq').on(t.tenantId, t.id),
    unique('pharmacy_sale_lines_line_uq').on(t.tenantId, t.saleId, t.lineNo),
    foreignKey({ columns: [t.tenantId, t.saleId], foreignColumns: [pharmacySales.tenantId, pharmacySales.id], name: 'pharmacy_sale_lines_sale_fk' }),
    foreignKey({ columns: [t.tenantId, t.itemId], foreignColumns: [pharmacyItems.tenantId, pharmacyItems.id], name: 'pharmacy_sale_lines_item_fk' }),
    foreignKey({ columns: [t.tenantId, t.batchId], foreignColumns: [pharmacyBatches.tenantId, pharmacyBatches.id], name: 'pharmacy_sale_lines_batch_fk' }),
    foreignKey({ columns: [t.tenantId, t.orderItemId], foreignColumns: [clinicalOrderItems.tenantId, clinicalOrderItems.id], name: 'pharmacy_sale_lines_order_fk' }),
    check('pharmacy_sale_lines_qty_chk', sql`${t.qty} > 0 and ${t.returnedQty} >= 0 and ${t.returnedQty} <= ${t.qty}`),
  ],
);

export const pharmacySaleReturns = pgTable(
  'pharmacy_sale_returns',
  {
    id: id(),
    tenantId: tenantId(),
    locationId: uuid('location_id').notNull(),
    saleId: uuid('sale_id').notNull(),
    patientId: uuid('patient_id'),
    number: text('number').notNull(),
    reason: text('reason').notNull(),
    grossPaise: money('gross_paise').notNull(),
    taxablePaise: money('taxable_paise').notNull(),
    taxPaise: money('tax_paise').notNull(),
    createdBy: uuid('created_by'),
    isSample: boolean('is_sample').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('pharmacy_sale_returns_tenant_id_uq').on(t.tenantId, t.id),
    unique('pharmacy_sale_returns_number_uq').on(t.tenantId, t.number),
    foreignKey({ columns: [t.tenantId, t.locationId], foreignColumns: [locations.tenantId, locations.id], name: 'pharmacy_sale_returns_location_fk' }),
    foreignKey({ columns: [t.tenantId, t.saleId], foreignColumns: [pharmacySales.tenantId, pharmacySales.id], name: 'pharmacy_sale_returns_sale_fk' }),
    foreignKey({ columns: [t.tenantId, t.patientId], foreignColumns: [patients.tenantId, patients.id], name: 'pharmacy_sale_returns_patient_fk' }),
    foreignKey({ columns: [t.tenantId, t.createdBy], foreignColumns: [users.tenantId, users.id], name: 'pharmacy_sale_returns_user_fk' }),
  ],
);

export const pharmacySaleReturnLines = pgTable(
  'pharmacy_sale_return_lines',
  {
    id: id(),
    tenantId: tenantId(),
    returnId: uuid('return_id').notNull(),
    lineNo: integer('line_no').notNull(),
    saleLineId: uuid('sale_line_id').notNull(),
    batchId: uuid('batch_id').notNull(),
    qty: integer('qty').notNull(),
    grossPaise: money('gross_paise').notNull(),
    taxablePaise: money('taxable_paise').notNull(),
    taxPaise: money('tax_paise').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('pharmacy_sale_return_lines_tenant_id_uq').on(t.tenantId, t.id),
    unique('pharmacy_sale_return_lines_line_uq').on(t.tenantId, t.returnId, t.lineNo),
    foreignKey({ columns: [t.tenantId, t.returnId], foreignColumns: [pharmacySaleReturns.tenantId, pharmacySaleReturns.id], name: 'pharmacy_sale_return_lines_return_fk' }),
    foreignKey({ columns: [t.tenantId, t.saleLineId], foreignColumns: [pharmacySaleLines.tenantId, pharmacySaleLines.id], name: 'pharmacy_sale_return_lines_sale_line_fk' }),
    foreignKey({ columns: [t.tenantId, t.batchId], foreignColumns: [pharmacyBatches.tenantId, pharmacyBatches.id], name: 'pharmacy_sale_return_lines_batch_fk' }),
    check('pharmacy_sale_return_lines_qty_chk', sql`${t.qty} > 0`),
  ],
);

export const pharmacyIpIssues = pgTable(
  'pharmacy_ip_issues',
  {
    id: id(),
    tenantId: tenantId(),
    locationId: uuid('location_id').notNull(),
    encounterId: uuid('encounter_id').notNull(),
    patientId: uuid('patient_id').notNull(),
    number: text('number').notNull(),
    notes: text('notes').notNull().default(''),
    createdBy: uuid('created_by'),
    isSample: boolean('is_sample').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('pharmacy_ip_issues_tenant_id_uq').on(t.tenantId, t.id),
    unique('pharmacy_ip_issues_number_uq').on(t.tenantId, t.number),
    foreignKey({ columns: [t.tenantId, t.locationId], foreignColumns: [locations.tenantId, locations.id], name: 'pharmacy_ip_issues_location_fk' }),
    foreignKey({ columns: [t.tenantId, t.encounterId], foreignColumns: [encounters.tenantId, encounters.id], name: 'pharmacy_ip_issues_encounter_fk' }),
    foreignKey({ columns: [t.tenantId, t.patientId], foreignColumns: [patients.tenantId, patients.id], name: 'pharmacy_ip_issues_patient_fk' }),
    foreignKey({ columns: [t.tenantId, t.createdBy], foreignColumns: [users.tenantId, users.id], name: 'pharmacy_ip_issues_user_fk' }),
  ],
);

export const pharmacyIpIssueLines = pgTable(
  'pharmacy_ip_issue_lines',
  {
    id: id(),
    tenantId: tenantId(),
    issueId: uuid('issue_id').notNull(),
    lineNo: integer('line_no').notNull(),
    itemId: uuid('item_id').notNull(),
    batchId: uuid('batch_id').notNull(),
    qty: integer('qty').notNull(),
    returnedQty: integer('returned_qty').notNull().default(0),
    mrpPaise: money('mrp_paise').notNull(),
    chargeId: uuid('charge_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('pharmacy_ip_issue_lines_tenant_id_uq').on(t.tenantId, t.id),
    unique('pharmacy_ip_issue_lines_line_uq').on(t.tenantId, t.issueId, t.lineNo),
    foreignKey({ columns: [t.tenantId, t.issueId], foreignColumns: [pharmacyIpIssues.tenantId, pharmacyIpIssues.id], name: 'pharmacy_ip_issue_lines_issue_fk' }),
    foreignKey({ columns: [t.tenantId, t.itemId], foreignColumns: [pharmacyItems.tenantId, pharmacyItems.id], name: 'pharmacy_ip_issue_lines_item_fk' }),
    foreignKey({ columns: [t.tenantId, t.batchId], foreignColumns: [pharmacyBatches.tenantId, pharmacyBatches.id], name: 'pharmacy_ip_issue_lines_batch_fk' }),
    check('pharmacy_ip_issue_lines_qty_chk', sql`${t.qty} > 0 and ${t.returnedQty} >= 0 and ${t.returnedQty} <= ${t.qty}`),
  ],
);

export const pharmacyAdjustments = pgTable(
  'pharmacy_adjustments',
  {
    id: id(),
    tenantId: tenantId(),
    locationId: uuid('location_id').notNull(),
    number: text('number').notNull(),
    reason: text('reason').notNull(),
    createdBy: uuid('created_by'),
    isSample: boolean('is_sample').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('pharmacy_adjustments_tenant_id_uq').on(t.tenantId, t.id),
    unique('pharmacy_adjustments_number_uq').on(t.tenantId, t.number),
    foreignKey({ columns: [t.tenantId, t.locationId], foreignColumns: [locations.tenantId, locations.id], name: 'pharmacy_adjustments_location_fk' }),
    foreignKey({ columns: [t.tenantId, t.createdBy], foreignColumns: [users.tenantId, users.id], name: 'pharmacy_adjustments_user_fk' }),
  ],
);

export const pharmacyAdjustmentLines = pgTable(
  'pharmacy_adjustment_lines',
  {
    id: id(),
    tenantId: tenantId(),
    adjustmentId: uuid('adjustment_id').notNull(),
    lineNo: integer('line_no').notNull(),
    batchId: uuid('batch_id').notNull(),
    qtyDelta: integer('qty_delta').notNull(),
    reason: text('reason').notNull().default(''),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('pharmacy_adjustment_lines_tenant_id_uq').on(t.tenantId, t.id),
    unique('pharmacy_adjustment_lines_line_uq').on(t.tenantId, t.adjustmentId, t.lineNo),
    foreignKey({ columns: [t.tenantId, t.adjustmentId], foreignColumns: [pharmacyAdjustments.tenantId, pharmacyAdjustments.id], name: 'pharmacy_adjustment_lines_adj_fk' }),
    foreignKey({ columns: [t.tenantId, t.batchId], foreignColumns: [pharmacyBatches.tenantId, pharmacyBatches.id], name: 'pharmacy_adjustment_lines_batch_fk' }),
    check('pharmacy_adjustment_lines_qty_chk', sql`${t.qtyDelta} <> 0`),
  ],
);

export const pharmacySupplierReturns = pgTable(
  'pharmacy_supplier_returns',
  {
    id: id(),
    tenantId: tenantId(),
    locationId: uuid('location_id').notNull(),
    supplierId: uuid('supplier_id').notNull(),
    number: text('number').notNull(),
    reason: text('reason').notNull(),
    createdBy: uuid('created_by'),
    isSample: boolean('is_sample').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('pharmacy_supplier_returns_tenant_id_uq').on(t.tenantId, t.id),
    unique('pharmacy_supplier_returns_number_uq').on(t.tenantId, t.number),
    foreignKey({ columns: [t.tenantId, t.locationId], foreignColumns: [locations.tenantId, locations.id], name: 'pharmacy_supplier_returns_location_fk' }),
    foreignKey({ columns: [t.tenantId, t.supplierId], foreignColumns: [pharmacySuppliers.tenantId, pharmacySuppliers.id], name: 'pharmacy_supplier_returns_supplier_fk' }),
    foreignKey({ columns: [t.tenantId, t.createdBy], foreignColumns: [users.tenantId, users.id], name: 'pharmacy_supplier_returns_user_fk' }),
  ],
);

export const pharmacySupplierReturnLines = pgTable(
  'pharmacy_supplier_return_lines',
  {
    id: id(),
    tenantId: tenantId(),
    returnId: uuid('return_id').notNull(),
    lineNo: integer('line_no').notNull(),
    batchId: uuid('batch_id').notNull(),
    qty: integer('qty').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('pharmacy_supplier_return_lines_tenant_id_uq').on(t.tenantId, t.id),
    unique('pharmacy_supplier_return_lines_line_uq').on(t.tenantId, t.returnId, t.lineNo),
    foreignKey({ columns: [t.tenantId, t.returnId], foreignColumns: [pharmacySupplierReturns.tenantId, pharmacySupplierReturns.id], name: 'pharmacy_supplier_return_lines_return_fk' }),
    foreignKey({ columns: [t.tenantId, t.batchId], foreignColumns: [pharmacyBatches.tenantId, pharmacyBatches.id], name: 'pharmacy_supplier_return_lines_batch_fk' }),
    check('pharmacy_supplier_return_lines_qty_chk', sql`${t.qty} > 0`),
  ],
);
