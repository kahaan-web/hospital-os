import { z } from 'zod';
import { PAYMENT_MODES, type PaymentMode } from './codes';
import type { BillDto } from './contract-dtos';
import { GST_TREATMENTS, documentTypeFor, resolveLineGst, roundOffPaise, type ClinicalDocType, type GstTreatment } from './gst-health';

/** Plan names these columns without a suffix. Existing money columns use *_paise, and so do these. */
export const PAY_CLASSES = ['cash', 'credit', 'free'] as const;
export type PayClass = (typeof PAY_CLASSES)[number];

export const OP_BILL_STATUSES = ['draft', 'final', 'cancelled'] as const;
export type OpBillStatus = (typeof OP_BILL_STATUSES)[number];

export const SETTLEMENT_MODES = [...PAYMENT_MODES, 'deposit', 'credit'] as const;
export type SettlementMode = (typeof SETTLEMENT_MODES)[number];

export const SERVICE_CATEGORIES = ['consultation', 'procedure', 'lab', 'radiology', 'bed', 'nursing', 'ot', 'package', 'misc'] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const CONCESSION_STATUSES = ['requested', 'approved', 'rejected'] as const;
export type ConcessionStatus = (typeof CONCESSION_STATUSES)[number];

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date as YYYY-MM-DD');

export class BillMathError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BillMathError';
  }
}

/** Split `amount` across weights so the shares are whole paise and sum to `amount`. */
export function allocatePaise(weights: readonly number[], amount: number): number[] {
  if (!Number.isInteger(amount) || amount < 0) throw new BillMathError('validation', 'Discount must be a whole number of paise');
  if (weights.some((w) => !Number.isInteger(w) || w < 0)) throw new BillMathError('validation', 'Line amounts must be whole paise');
  const sum = weights.reduce((a, b) => a + b, 0);
  if (amount === 0) return weights.map(() => 0);
  if (amount > sum) throw new BillMathError('discount_exceeds_total', 'The concession is more than the bill amount');
  const exact = weights.map((w) => (w * amount) / sum);
  const base = exact.map((n) => Math.floor(n));
  let left = amount - base.reduce((a, b) => a + b, 0);
  const order = exact
    .map((n, i) => ({ i, frac: n - Math.floor(n) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const out = base.slice();
  for (const slot of order) {
    if (left <= 0) break;
    const weight = weights[slot.i] ?? 0;
    const current = out[slot.i] ?? 0;
    if (current < weight) {
      out[slot.i] = current + 1;
      left -= 1;
    }
  }
  if (left !== 0) throw new BillMathError('validation', 'Could not allocate the concession');
  return out;
}

export interface ComposeLineInput {
  netPaise: number;
  treatment: GstTreatment;
  configuredRateBp: number;
  unitPricePaise: number;
}

export interface ComposedLine {
  billDiscountPaise: number;
  taxablePaise: number;
  gstRateBp: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  treatment: GstTreatment;
}

export interface ComposedBill {
  lines: ComposedLine[];
  subtotalPaise: number;
  discountPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  roundOffPaise: number;
  totalPaise: number;
  docType: ClinicalDocType;
}

/**
 * Build bill totals from charge nets.
 * Tax is exclusive. A bill concession is spread across lines before tax.
 * The header total equals the sum of line taxable + tax, plus round-off of at most 50 paise.
 */
export function composeBill(input: {
  lines: readonly ComposeLineInput[];
  billDiscountPaise: number;
  interState: boolean;
  patientRegistered: boolean;
}): ComposedBill {
  if (input.lines.length === 0) throw new BillMathError('nothing_to_bill', 'There are no charges to bill');
  const nets = input.lines.map((line) => {
    if (!Number.isInteger(line.netPaise) || line.netPaise < 0) throw new BillMathError('validation', 'Each line must have a non-negative amount');
    return line.netPaise;
  });
  const shares = allocatePaise(nets, input.billDiscountPaise);
  const lines: ComposedLine[] = input.lines.map((line, i) => {
    const share = shares[i] ?? 0;
    const taxable = line.netPaise - share;
    const resolved = resolveLineGst({
      treatment: line.treatment,
      configuredRateBp: line.configuredRateBp,
      unitPricePaise: line.unitPricePaise,
    });
    const tax = taxable === 0 || resolved.gstRateBp === 0 ? 0 : Math.round((taxable * resolved.gstRateBp) / 10_000);
    const cgst = input.interState ? 0 : Math.floor(tax / 2);
    const sgst = input.interState ? 0 : tax - cgst;
    const igst = input.interState ? tax : 0;
    return {
      billDiscountPaise: share,
      taxablePaise: taxable,
      gstRateBp: resolved.gstRateBp,
      cgstPaise: cgst,
      sgstPaise: sgst,
      igstPaise: igst,
      treatment: resolved.treatment,
    };
  });
  const subtotalPaise = nets.reduce((a, b) => a + b, 0);
  const cgstPaise = lines.reduce((a, line) => a + line.cgstPaise, 0);
  const sgstPaise = lines.reduce((a, line) => a + line.sgstPaise, 0);
  const igstPaise = lines.reduce((a, line) => a + line.igstPaise, 0);
  const preRound = lines.reduce((a, line) => a + line.taxablePaise + line.cgstPaise + line.sgstPaise + line.igstPaise, 0);
  const rounded = roundOffPaise(preRound);
  if (Math.abs(rounded.roundOffPaise) > 50) throw new BillMathError('validation', 'Round-off is more than 50 paise');
  if (preRound + rounded.roundOffPaise !== rounded.roundedPaise) {
    throw new BillMathError('validation', 'Line amounts do not add up to the total');
  }
  const docType = documentTypeFor(
    lines.map((line) => ({ treatment: line.treatment, gstRateBp: line.gstRateBp })),
    input.patientRegistered,
  );
  return {
    lines,
    subtotalPaise,
    discountPaise: input.billDiscountPaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
    roundOffPaise: rounded.roundOffPaise,
    totalPaise: rounded.roundedPaise,
    docType,
  };
}

export interface BillLineDto {
  id: string;
  lineNo: number;
  chargeId: string;
  description: string;
  qty: number;
  unitPricePaise: number;
  amountPaise: number;
  discountPaise: number;
  billDiscountPaise: number;
  taxablePaise: number;
  gstTreatment: GstTreatment;
  gstRateBp: number;
  hsnSac: string;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  serviceId: string | null;
  performingDoctorId: string | null;
  serviceDate: string;
}

export interface OpBillDto extends BillDto {
  locationId: string;
  docType: ClinicalDocType;
  payClass: PayClass;
  subtotalPaise: number;
  discountPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  roundOffPaise: number;
  balancePaise: number;
  patientName?: string;
  patientUhid?: string;
  lines?: BillLineDto[];
}

export interface DepositDto {
  id: string;
  number: string;
  patientId: string;
  encounterId: string | null;
  amountPaise: number;
  balancePaise: number;
  mode: PaymentMode;
  status: string;
  instrumentRef: string | null;
  patientName?: string;
  patientUhid?: string;
  createdAt: string;
}

export interface RefundDto {
  id: string;
  number: string;
  billId: string | null;
  depositId: string | null;
  amountPaise: number;
  reason: string;
  mode: PaymentMode;
  createdAt: string;
}

export interface ConcessionDto {
  id: string;
  billId: string;
  amountPaise: number;
  reason: string;
  status: ConcessionStatus;
  requestedBy: string | null;
  approvedBy: string | null;
}

export interface UnbilledEncounterDto {
  encounterId: string;
  patientId: string;
  encounterNumber: string;
  patientName: string;
  uhid: string;
  chargeCount: number;
  amountPaise: number;
}

export interface CashSummaryRow {
  entryType: string;
  direction: string;
  mode: string;
  refType: string;
  amountPaise: number;
  count: number;
}

export interface CashSummaryDto {
  from: string;
  to: string;
  rows: CashSummaryRow[];
  netInPaise: number;
}

export interface RevenueRow {
  docType: string;
  bills: number;
  totalPaise: number;
  taxPaise: number;
}

export interface RevenueReportDto {
  from: string;
  to: string;
  rows: RevenueRow[];
  totalPaise: number;
}

export interface DoctorSharingRow {
  doctorId: string | null;
  doctorName: string;
  lines: number;
  amountPaise: number;
}

export interface DoctorSharingDto {
  from: string;
  to: string;
  rows: DoctorSharingRow[];
}

export interface OutstandingRow {
  billId: string;
  number: string | null;
  patientId: string;
  patientName: string;
  uhid: string;
  payClass: PayClass;
  totalPaise: number;
  paidPaise: number;
  balancePaise: number;
}

export interface OutstandingReportDto {
  rows: OutstandingRow[];
  balancePaise: number;
}

export interface DepositRegisterRow {
  id: string;
  number: string;
  patientName: string;
  uhid: string;
  amountPaise: number;
  balancePaise: number;
  status: string;
  mode: string;
  createdAt: string;
}

export interface DepositRegisterDto {
  rows: DepositRegisterRow[];
}

/** OP billing visit counts. OPD's diary report uses `VisitStatisticsDto` in appointments.ts. */
export interface OpBillingVisitStatisticsDto {
  from: string;
  to: string;
  opdVisits: number;
  opBills: number;
  billedPaise: number;
}

export interface TariffDto {
  id: string;
  serviceId: string;
  locationId: string | null;
  wardClass: string | null;
  payerClass: string;
  pricePaise: number;
  effectiveFrom: string;
}

export interface ServiceMasterDto {
  id: string;
  code: string;
  name: string;
  category: string;
  doctorId: string | null;
  hsnSac: string;
  gstTreatment: GstTreatment;
  gstRateBp: number;
  active: boolean;
  tariffs: TariffDto[];
}

export const createOpBillSchema = z.object({
  encounterId: z.uuid(),
  chargeIds: z.array(z.uuid()).min(1).optional(),
  payClass: z.enum(PAY_CLASSES).default('cash'),
});
export type CreateOpBillInput = z.infer<typeof createOpBillSchema>;

export const settleSchema = z.object({
  mode: z.enum(SETTLEMENT_MODES),
  amountPaise: z.number().int().positive('Enter an amount greater than zero'),
  depositId: z.uuid().optional(),
  instrumentRef: z.string().trim().max(40).optional(),
});
export type SettleInput = z.infer<typeof settleSchema>;

export const concessionSchema = z.object({
  amountPaise: z.number().int().positive('Enter a concession greater than zero'),
  reason: z.string().trim().min(3, 'Say why this concession is given').max(300),
});
export type ConcessionInput = z.infer<typeof concessionSchema>;

export const billRefundSchema = z.object({
  amountPaise: z.number().int().positive('Enter a refund greater than zero'),
  reason: z.string().trim().min(3, 'Say why this amount is refunded').max(300),
  mode: z.enum(PAYMENT_MODES).default('cash'),
  instrumentRef: z.string().trim().max(40).optional(),
});
export type BillRefundInput = z.infer<typeof billRefundSchema>;

export const createDepositSchema = z.object({
  patientId: z.uuid(),
  encounterId: z.uuid().optional(),
  amountPaise: z.number().int().positive('Enter a deposit greater than zero'),
  mode: z.enum(PAYMENT_MODES),
  instrumentRef: z.string().trim().max(40).optional(),
});
export type CreateDepositInput = z.infer<typeof createDepositSchema>;

export const depositRefundSchema = z.object({
  amountPaise: z.number().int().positive('Enter a refund greater than zero'),
  reason: z.string().trim().min(3, 'Say why this deposit is refunded').max(300),
  mode: z.enum(PAYMENT_MODES).default('cash'),
});
export type DepositRefundInput = z.infer<typeof depositRefundSchema>;

export const serviceCreateSchema = z.object({
  code: z.string().trim().min(2).max(20).regex(/^[A-Z0-9-]+$/, 'Use letters, digits and hyphens'),
  name: z.string().trim().min(2).max(120),
  category: z.enum(SERVICE_CATEGORIES),
  hsnSac: z.string().trim().min(4).max(8).default('9993'),
  gstTreatment: z.enum(GST_TREATMENTS).default('exempt_healthcare'),
  gstRateBp: z.number().int().min(0).max(10_000).default(0),
  doctorId: z.uuid().nullable().optional(),
});
export type ServiceCreateInput = z.infer<typeof serviceCreateSchema>;

export const servicePatchSchema = serviceCreateSchema.partial().extend({
  active: z.boolean().optional(),
});
export type ServicePatchInput = z.infer<typeof servicePatchSchema>;

export const tariffCreateSchema = z.object({
  serviceId: z.uuid(),
  locationId: z.uuid().nullable().optional(),
  wardClass: z.string().trim().max(40).nullable().optional(),
  payerClass: z.enum(['general', 'corporate', 'tpa']).default('general'),
  pricePaise: z.number().int().nonnegative(),
  effectiveFrom: day,
});
export type TariffCreateInput = z.infer<typeof tariffCreateSchema>;

export const tariffPatchSchema = z.object({
  pricePaise: z.number().int().nonnegative(),
});
export type TariffPatchInput = z.infer<typeof tariffPatchSchema>;

export const billListQuery = z.object({
  status: z.enum(OP_BILL_STATUSES).optional(),
  patientId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const reportRangeQuery = z.object({
  from: day,
  to: day,
});
export type ReportRange = z.infer<typeof reportRangeQuery>;

export const DOC_TYPE_LABEL: Record<ClinicalDocType, string> = {
  bill_of_supply: 'Bill of supply',
  tax_invoice: 'Tax invoice',
  invoice_cum_bill_of_supply: 'Invoice-cum-bill of supply',
};
