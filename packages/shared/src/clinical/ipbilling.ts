import { z } from 'zod';
import type { OpBillDto } from './billing';
import { PAY_CLASSES } from './billing';
import { GST_TREATMENTS, type GstTreatment } from './gst-health';

export const PAYER_KINDS = ['tpa', 'insurer', 'corporate', 'scheme'] as const;
export type PayerKind = (typeof PAYER_KINDS)[number];

export interface PayerDto {
  id: string;
  code: string;
  name: string;
  kind: PayerKind;
  gstin: string;
  stateCode: string;
  creditDays: number;
  active: boolean;
}

export interface EncounterPayerDto {
  encounterId: string;
  payerId: string;
  payerName?: string;
  policyNo: string;
  preauthAmountPaise: number;
  approvedAmountPaise: number;
  status: string;
}

export interface PayerReceivableDto {
  id: string;
  billId: string;
  payerId: string;
  payerName?: string;
  amountPaise: number;
  status: string;
}

export interface StatementLineDto {
  at: string;
  kind: 'charge' | 'bill' | 'deposit' | 'settlement' | 'receivable';
  description: string;
  debitPaise: number;
  creditPaise: number;
  balancePaise: number;
}

export interface StatementOfAccountDto {
  encounterId: string;
  patientId: string;
  patientName: string;
  uhid: string;
  encounterNumber: string;
  lines: StatementLineDto[];
  chargeTotalPaise: number;
  billedPaise: number;
  paidPaise: number;
  depositBalancePaise: number;
  receivablePaise: number;
  balancePaise: number;
}

export interface IpRunningBalanceDto {
  encounterId: string;
  encounterNumber: string;
  patientId: string;
  patientName: string;
  uhid: string;
  wardLabel: string | null;
  unbilledPaise: number;
  billedPaise: number;
  paidPaise: number;
  depositPaise: number;
  balancePaise: number;
}

export const manualChargeSchema = z.object({
  serviceId: z.uuid().optional(),
  description: z.string().trim().min(2).max(200),
  qty: z.number().positive('Enter a quantity greater than zero'),
  unitPricePaise: z.number().int().nonnegative(),
  discountPaise: z.number().int().nonnegative().default(0),
  gstTreatment: z.enum(GST_TREATMENTS).default('exempt_healthcare'),
  gstRateBp: z.number().int().min(0).max(10_000).default(0),
  hsnSac: z.string().trim().min(4).max(8).default('9993'),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  performingDoctorId: z.uuid().optional(),
});
export type ManualChargeInput = z.infer<typeof manualChargeSchema>;

export const createIpBillSchema = z.object({
  interim: z.boolean().default(false),
  chargeIds: z.array(z.uuid()).min(1).optional(),
  payClass: z.enum(PAY_CLASSES).default('cash'),
  applyDeposits: z.boolean().default(false),
});
export type CreateIpBillInput = z.infer<typeof createIpBillSchema>;

export const splitIpBillSchema = z.object({
  payerSharePaise: z.number().int().positive('Enter the payer share'),
});
export type SplitIpBillInput = z.infer<typeof splitIpBillSchema>;

export const payerCreateSchema = z.object({
  code: z.string().trim().min(2).max(20).regex(/^[A-Z0-9-]+$/, 'Use letters, digits and hyphens'),
  name: z.string().trim().min(2).max(120),
  kind: z.enum(PAYER_KINDS),
  gstin: z.string().trim().max(15).default(''),
  stateCode: z.string().trim().length(2).optional().or(z.literal('')).default(''),
  creditDays: z.number().int().min(0).max(365).default(30),
});
export type PayerCreateInput = z.infer<typeof payerCreateSchema>;

export const payerPatchSchema = payerCreateSchema.partial().extend({ active: z.boolean().optional() });
export type PayerPatchInput = z.infer<typeof payerPatchSchema>;

export const encounterPayerSchema = z.object({
  payerId: z.uuid(),
  policyNo: z.string().trim().max(40).default(''),
  preauthAmountPaise: z.number().int().nonnegative().default(0),
  approvedAmountPaise: z.number().int().nonnegative().default(0),
});
export type EncounterPayerInput = z.infer<typeof encounterPayerSchema>;

export type IpBillDto = OpBillDto;

export type { GstTreatment, OpBillDto };
export { settleSchema, concessionSchema, createDepositSchema, depositRefundSchema, reportRangeQuery } from './billing';
export type { SettleInput, ConcessionInput, CreateDepositInput, DepositRefundInput } from './billing';
