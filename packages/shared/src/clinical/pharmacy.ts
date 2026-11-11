import { z } from 'zod';
import { PAYMENT_MODES, type PaymentMode } from './codes';
import type { ClinicalDocType } from './gst-health';
import type { ClinicalOrderDto } from './orders';

export const PHARMACY_SCHEDULES = ['H', 'H1', 'X', 'OTC'] as const;
export type PharmacySchedule = (typeof PHARMACY_SCHEDULES)[number];

export const PHARMACY_SALE_KINDS = ['op', 'outside'] as const;
export type PharmacySaleKind = (typeof PHARMACY_SALE_KINDS)[number];

export const PHARMACY_REPORTS = [
  'stock-register',
  'receipts',
  'rejections',
  'issues',
  'issue-returns',
  'adjustments',
  'ip-statement',
  'expiry',
  'purchases',
] as const;
export type PharmacyReportKey = (typeof PHARMACY_REPORTS)[number];

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date as YYYY-MM-DD');
const gstin = z
  .string()
  .trim()
  .max(15)
  .default('')
  .refine((value) => value === '' || /^[0-9]{2}[A-Z0-9]{13}$/.test(value.toUpperCase()), 'Enter a valid GSTIN');

export const pharmacyItemSchema = z.object({
  genericCode: z.string().trim().min(1).max(40),
  brand: z.string().trim().min(1).max(80),
  form: z.string().trim().min(1).max(40),
  strength: z.string().trim().max(40).default(''),
  hsn: z.string().trim().min(4).max(8),
  gstRateBp: z.number().int().min(0).max(10_000),
  reorderLevel: z.number().int().min(0).default(0),
  schedule: z.enum(PHARMACY_SCHEDULES),
  active: z.boolean().optional(),
});
export type PharmacyItemInput = z.infer<typeof pharmacyItemSchema>;

export const pharmacyItemPatchSchema = z.object({
  genericCode: z.string().trim().min(1).max(40).optional(),
  brand: z.string().trim().min(1).max(80).optional(),
  form: z.string().trim().min(1).max(40).optional(),
  strength: z.string().trim().max(40).optional(),
  hsn: z.string().trim().min(4).max(8).optional(),
  gstRateBp: z.number().int().min(0).max(10_000).optional(),
  reorderLevel: z.number().int().min(0).optional(),
  schedule: z.enum(PHARMACY_SCHEDULES).optional(),
  active: z.boolean().optional(),
});
export type PharmacyItemPatch = z.infer<typeof pharmacyItemPatchSchema>;

export const pharmacySupplierSchema = z.object({
  name: z.string().trim().min(2).max(120),
  gstin,
  phone: z.string().trim().max(20).default(''),
  city: z.string().trim().max(60).default(''),
  active: z.boolean().optional(),
});
export type PharmacySupplierInput = z.infer<typeof pharmacySupplierSchema>;

export const pharmacySupplierPatchSchema = pharmacySupplierSchema.partial();
export type PharmacySupplierPatch = z.infer<typeof pharmacySupplierPatchSchema>;

export const pharmacyGrnSchema = z.object({
  supplierId: z.uuid(),
  notes: z.string().trim().max(500).optional(),
  lines: z
    .array(
      z.object({
        itemId: z.uuid(),
        batchNo: z.string().trim().min(1).max(40),
        expiry: dateOnly,
        qty: z.number().int().positive().max(100_000),
        mrpPaise: z.number().int().nonnegative(),
        purchaseRatePaise: z.number().int().nonnegative(),
      }),
    )
    .min(1, 'Add a line'),
});
export type PharmacyGrnInput = z.infer<typeof pharmacyGrnSchema>;

export const pharmacySaleSchema = z.object({
  kind: z.enum(PHARMACY_SALE_KINDS),
  patientId: z.uuid().optional(),
  encounterId: z.uuid().optional(),
  walkinName: z.string().trim().max(80).optional(),
  mode: z.enum(PAYMENT_MODES),
  lines: z
    .array(
      z.object({
        itemId: z.uuid(),
        qty: z.number().int().positive().max(100_000),
        orderItemId: z.uuid().optional(),
      }),
    )
    .min(1, 'Add a line'),
});
export type PharmacySaleInput = z.infer<typeof pharmacySaleSchema>;

export const pharmacySaleReturnSchema = z.object({
  reason: z.string().trim().min(2).max(300),
  lines: z.array(z.object({ saleLineId: z.uuid(), qty: z.number().int().positive() })).min(1),
});
export type PharmacySaleReturnInput = z.infer<typeof pharmacySaleReturnSchema>;

export const pharmacyIpIssueSchema = z.object({
  encounterId: z.uuid(),
  lines: z.array(z.object({ itemId: z.uuid(), qty: z.number().int().positive().max(100_000) })).min(1),
});
export type PharmacyIpIssueInput = z.infer<typeof pharmacyIpIssueSchema>;

export const pharmacyIpReturnSchema = z.object({
  reason: z.string().trim().min(2).max(300),
  lines: z.array(z.object({ lineId: z.uuid(), qty: z.number().int().positive() })).min(1),
});
export type PharmacyIpReturnInput = z.infer<typeof pharmacyIpReturnSchema>;

export const pharmacyAdjustmentSchema = z.object({
  reason: z.string().trim().min(2).max(300),
  lines: z
    .array(
      z.object({
        batchId: z.uuid(),
        qtyDelta: z.number().int().refine((value) => value !== 0, 'Quantity cannot be zero'),
        reason: z.string().trim().max(200).optional(),
      }),
    )
    .min(1),
});
export type PharmacyAdjustmentInput = z.infer<typeof pharmacyAdjustmentSchema>;

export const pharmacySupplierReturnSchema = z.object({
  supplierId: z.uuid(),
  reason: z.string().trim().min(2).max(300),
  lines: z.array(z.object({ batchId: z.uuid(), qty: z.number().int().positive() })).min(1),
});
export type PharmacySupplierReturnInput = z.infer<typeof pharmacySupplierReturnSchema>;

export const pharmacyReportQuery = z.object({
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  patientId: z.uuid().optional(),
});
export type PharmacyReportQuery = z.infer<typeof pharmacyReportQuery>;

export interface PharmacyItemDto {
  id: string;
  genericCode: string;
  brand: string;
  form: string;
  strength: string;
  hsn: string;
  gstRateBp: number;
  reorderLevel: number;
  schedule: PharmacySchedule;
  active: boolean;
}

export interface PharmacySupplierDto {
  id: string;
  name: string;
  gstin: string;
  phone: string;
  city: string;
  active: boolean;
}

export interface PharmacyStockRowDto {
  stockId: string;
  itemId: string;
  brand: string;
  genericCode: string;
  strength: string;
  form: string;
  schedule: PharmacySchedule;
  reorderLevel: number;
  batchId: string;
  batchNo: string;
  expiry: string;
  mrpPaise: number;
  qty: number;
  moveSum: number;
  expired: boolean;
  low: boolean;
}

export interface PharmacySaleLineDto {
  id: string;
  itemId: string;
  brand: string;
  batchId: string;
  batchNo: string;
  qty: number;
  returnedQty: number;
  mrpPaise: number;
  gstRateBp: number;
  grossPaise: number;
  taxablePaise: number;
  taxPaise: number;
}

export interface PharmacySaleDto {
  id: string;
  number: string;
  kind: PharmacySaleKind;
  patientId: string | null;
  encounterId: string | null;
  walkinName: string;
  mode: PaymentMode;
  docType: ClinicalDocType;
  grossPaise: number;
  taxablePaise: number;
  taxPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
  lines: PharmacySaleLineDto[];
}

export interface PharmacyIpIssueLineDto {
  id: string;
  itemId: string;
  brand: string;
  batchId: string;
  qty: number;
  returnedQty: number;
  mrpPaise: number;
  chargeId: string | null;
}

export interface PharmacyIpIssueDto {
  id: string;
  number: string;
  encounterId: string;
  patientId: string;
  lines: PharmacyIpIssueLineDto[];
}

export interface PharmacyQueueItemDto {
  order: ClinicalOrderDto;
  patientName: string;
  uhid: string;
  encounterNumber: string;
}

export interface PharmacyInpatientDto {
  encounterId: string;
  patientId: string;
  uhid: string;
  patientName: string;
  number: string;
  bedLabel: string | null;
}

export interface PharmacyReportDto {
  key: PharmacyReportKey;
  title: string;
  columns: string[];
  rows: string[][];
  /** Shown on every pharmacy money screen. Rates are configuration. */
  gstNote: string;
}

export const PHARMACY_GST_NOTE = 'GST rates are configuration. Confirm with your CA.';
