import { z } from 'zod';
import { SPECIMENS, type ClinicalGender, type Specimen } from './codes';
import { ageLabel } from './patient';

/** Result flags. LL/HH are critical and must be labelled, not shown by colour alone. */
export const LAB_FLAGS = ['N', 'L', 'H', 'LL', 'HH'] as const;
export type LabFlag = (typeof LAB_FLAGS)[number];

export const LAB_VALUE_TYPES = ['numeric', 'text', 'coded'] as const;
export type LabValueType = (typeof LAB_VALUE_TYPES)[number];

export const LAB_ACCESSION_STATUSES = [
  'ordered',
  'collected',
  'received',
  'resulted',
  'verified',
  'reported',
  'rejected',
] as const;
export type LabAccessionStatus = (typeof LAB_ACCESSION_STATUSES)[number];

export const LAB_SEXES = ['male', 'female', 'other', 'any'] as const;
export type LabSex = (typeof LAB_SEXES)[number];

/** Reference band. Age is in whole years. `ageMaxYears` null means no upper bound. */
export interface LabRefBand {
  sex: LabSex;
  ageMinYears: number;
  ageMaxYears: number | null;
  low: number | null;
  high: number | null;
}

export const labRefBandSchema = z
  .object({
    sex: z.enum(LAB_SEXES),
    ageMinYears: z.number().int().min(0).max(150),
    ageMaxYears: z.number().int().min(0).max(150).nullable(),
    low: z.number().nullable(),
    high: z.number().nullable(),
  })
  .superRefine((band, ctx) => {
    if (band.ageMaxYears != null && band.ageMaxYears < band.ageMinYears) {
      ctx.addIssue({ code: 'custom', message: 'Age to must be on or after age from', path: ['ageMaxYears'] });
    }
    if (band.low != null && band.high != null && band.high < band.low) {
      ctx.addIssue({ code: 'custom', message: 'High must be at least the low', path: ['high'] });
    }
  });

const FLAG_RANK: Record<LabFlag, number> = { N: 1, L: 2, H: 3, LL: 4, HH: 5 };

export function worstLabFlag(flags: Array<LabFlag | null | undefined>): LabFlag | null {
  let best: LabFlag | null = null;
  for (const flag of flags) {
    if (!flag) continue;
    if (!best || FLAG_RANK[flag] > FLAG_RANK[best]) best = flag;
  }
  return best;
}

export function flagLabel(flag: LabFlag | null | undefined): string {
  switch (flag) {
    case 'LL':
      return 'Critical low';
    case 'HH':
      return 'Critical high';
    case 'L':
      return 'Low';
    case 'H':
      return 'High';
    case 'N':
      return 'Normal';
    default:
      return '';
  }
}

export function isCriticalFlag(flag: LabFlag | null | undefined): boolean {
  return flag === 'LL' || flag === 'HH';
}

/** Whole years for reference bands. Under one year is 0. Falls back to the age recorded at registration. */
export function ageYearsForLab(
  dob: string | Date | null | undefined,
  ageYearsAtReg: number | null | undefined,
  at: Date = new Date(),
): number | null {
  if (dob) {
    const label = ageLabel(dob, at);
    const years = /^(\d+) Y$/.exec(label);
    if (years) return Number(years[1]);
    if (label.endsWith(' M') || label.endsWith(' D')) return 0;
  }
  if (ageYearsAtReg != null && ageYearsAtReg >= 0) return ageYearsAtReg;
  return null;
}

function bandSpan(band: LabRefBand): number {
  return (band.ageMaxYears ?? 200) - band.ageMinYears;
}

function ageMatches(band: LabRefBand, ageYears: number | null): boolean {
  if (ageYears == null) return band.ageMinYears === 0 && band.ageMaxYears == null;
  if (ageYears < band.ageMinYears) return false;
  if (band.ageMaxYears != null && ageYears > band.ageMaxYears) return false;
  return true;
}

/** Narrowest matching band. A sex-specific band wins over `any`. */
export function pickRefBand(bands: readonly LabRefBand[], sex: ClinicalGender, ageYears: number | null): LabRefBand | null {
  const matching = bands.filter((band) => ageMatches(band, ageYears));
  const specific = matching.filter((band) => band.sex === sex);
  const pool = specific.length > 0 ? specific : matching.filter((band) => band.sex === 'any');
  if (pool.length === 0) return null;
  return pool.slice().sort((a, b) => bandSpan(a) - bandSpan(b))[0] ?? null;
}

function formatBound(value: number): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 }).format(value);
}

export function labRangeLabel(bands: readonly LabRefBand[], sex: ClinicalGender, ageYears: number | null, unit: string): string {
  const band = pickRefBand(bands, sex, ageYears);
  if (!band) return unit ? `No reference range · ${unit}` : 'No reference range';
  const span =
    band.low != null && band.high != null ? `${formatBound(band.low)}–${formatBound(band.high)}`
    : band.low != null ? `≥ ${formatBound(band.low)}`
    : band.high != null ? `≤ ${formatBound(band.high)}`
    : '—';
  const who = band.sex === 'male' ? 'Male' : band.sex === 'female' ? 'Female' : band.sex === 'other' ? 'Other' : '';
  const age = band.ageMaxYears == null ? `${band.ageMinYears}+ y` : `${band.ageMinYears}–${band.ageMaxYears} y`;
  return [span, unit, who, age].filter((part) => part.length > 0).join(' · ');
}

/**
 * Numeric values are flagged against the sex and age band, then critical limits.
 * Critical limits win. Text and coded values are not flagged.
 * A critical bound is inclusive (`<=` low, `>=` high).
 */
export function flagLabValue(input: {
  valueType: LabValueType;
  valueNum: number | null;
  sex: ClinicalGender;
  ageYears: number | null;
  refRanges: readonly LabRefBand[];
  criticalLow: number | null;
  criticalHigh: number | null;
}): LabFlag | null {
  if (input.valueType !== 'numeric' || input.valueNum == null || Number.isNaN(input.valueNum)) return null;
  const value = input.valueNum;
  if (input.criticalLow != null && value <= input.criticalLow) return 'LL';
  if (input.criticalHigh != null && value >= input.criticalHigh) return 'HH';
  const band = pickRefBand(input.refRanges, input.sex, input.ageYears);
  if (!band) return 'N';
  if (band.low != null && value < band.low) return 'L';
  if (band.high != null && value > band.high) return 'H';
  return 'N';
}

/** OPD samples wait for a settled charge unless the lab allows collection before payment. IPD does not. */
export function opdCollectionAllowed(encounterKind: string, settled: boolean, collectBeforePayment: boolean): boolean {
  if (encounterKind !== 'opd') return true;
  if (collectBeforePayment) return true;
  return settled;
}

export const labTestCreateSchema = z.object({
  serviceId: z.uuid(),
  specimen: z.enum(SPECIMENS),
  container: z.string().trim().min(1, 'Enter the container').max(80),
  tatHours: z.number().int().min(1, 'TAT must be at least 1 hour').max(720),
  active: z.boolean().optional(),
});
export type LabTestCreateInput = z.infer<typeof labTestCreateSchema>;

export const labTestPatchSchema = z
  .object({
    serviceId: z.uuid().optional(),
    specimen: z.enum(SPECIMENS).optional(),
    container: z.string().trim().min(1, 'Enter the container').max(80).optional(),
    tatHours: z.number().int().min(1, 'TAT must be at least 1 hour').max(720).optional(),
    active: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update');
export type LabTestPatchInput = z.infer<typeof labTestPatchSchema>;

export const labParamSchema = z
  .object({
    code: z.string().trim().min(1).max(20),
    name: z.string().trim().min(1).max(80),
    unit: z.string().trim().max(20).optional(),
    valueType: z.enum(LAB_VALUE_TYPES),
    decimals: z.number().int().min(0).max(4).optional(),
    refRanges: z.array(labRefBandSchema).max(12).optional(),
    criticalLow: z.number().nullable().optional(),
    criticalHigh: z.number().nullable().optional(),
    options: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
    sortOrder: z.number().int().min(0).max(999).optional(),
  })
  .superRefine((body, ctx) => {
    if (body.criticalLow != null && body.criticalHigh != null && body.criticalHigh <= body.criticalLow) {
      ctx.addIssue({ code: 'custom', message: 'Critical high must be above critical low', path: ['criticalHigh'] });
    }
    if (body.valueType === 'coded' && (body.options?.length ?? 0) < 1) {
      ctx.addIssue({ code: 'custom', message: 'Add at least one coded option', path: ['options'] });
    }
  });
export type LabParamInput = z.infer<typeof labParamSchema>;

export const labParamPatchSchema = z
  .object({
    code: z.string().trim().min(1).max(20).optional(),
    name: z.string().trim().min(1).max(80).optional(),
    unit: z.string().trim().max(20).optional(),
    valueType: z.enum(LAB_VALUE_TYPES).optional(),
    decimals: z.number().int().min(0).max(4).optional(),
    refRanges: z.array(labRefBandSchema).max(12).optional(),
    criticalLow: z.number().nullable().optional(),
    criticalHigh: z.number().nullable().optional(),
    options: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
    sortOrder: z.number().int().min(0).max(999).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update');

export const collectSampleSchema = z.object({
  orderItemId: z.uuid(),
  collectedAt: z.iso.datetime().optional(),
  specimen: z.enum(SPECIMENS).optional(),
});
export type CollectSampleInput = z.infer<typeof collectSampleSchema>;

export const rejectSampleSchema = z.object({
  reason: z.string().trim().min(2, 'Say why this sample is rejected').max(300),
});

export const labResultValueSchema = z.object({
  paramId: z.uuid(),
  valueNum: z.number().nullable().optional(),
  valueText: z.string().trim().max(200).nullable().optional(),
});

export const saveResultsSchema = z.object({
  values: z.array(labResultValueSchema).min(1, 'Enter at least one value'),
  amendReason: z.string().trim().min(2).max(300).optional(),
});
export type SaveResultsInput = z.infer<typeof saveResultsSchema>;

export const emailResultSchema = z.object({
  to: z.email().optional(),
});

export const labMisQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a calendar date'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a calendar date'),
});

export const labWorklistQuery = z.object({
  status: z.enum(['actionable', ...LAB_ACCESSION_STATUSES, 'pending']).optional(),
});

export const analyzerResultSchema = z.object({
  accessionNumber: z.string().trim().min(4).max(20),
  values: z
    .array(
      z.object({
        paramCode: z.string().trim().min(1).max(20),
        valueNum: z.number().nullable().optional(),
        valueText: z.string().trim().max(200).nullable().optional(),
      }),
    )
    .min(1, 'Send at least one result'),
});
export type AnalyzerResultInput = z.infer<typeof analyzerResultSchema>;

export interface LabTestDto {
  id: string;
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  specimen: Specimen;
  container: string;
  tatHours: number;
  active: boolean;
}

export interface LabParamDto {
  id: string;
  testId: string;
  code: string;
  name: string;
  unit: string;
  valueType: LabValueType;
  decimals: number;
  refRanges: LabRefBand[];
  criticalLow: number | null;
  criticalHigh: number | null;
  options: string[];
  sortOrder: number;
}

export interface LabWorklistItemDto {
  orderItemId: string;
  orderId: string;
  orderNumber: string;
  patientId: string;
  patientName: string;
  uhid: string;
  encounterKind: string;
  priority: string;
  testName: string;
  serviceId: string | null;
  accessionId: string | null;
  accessionNumber: string | null;
  status: string;
  placedAt: string;
  tatHours: number | null;
}

export interface LabResultLineDto {
  paramId: string;
  code: string;
  name: string;
  unit: string;
  valueType: LabValueType;
  decimals: number;
  options: string[];
  refRanges: LabRefBand[];
  rangeLabel: string;
  criticalLow: number | null;
  criticalHigh: number | null;
  valueNum: number | null;
  valueText: string | null;
  flag: LabFlag | null;
  flagLabel: string;
  critical: boolean;
  version: number;
}

export interface LabAccessionDetailDto {
  id: string;
  number: string;
  barcode: string;
  status: LabAccessionStatus;
  specimen: Specimen;
  patientId: string;
  patientName: string;
  uhid: string;
  sex: ClinicalGender;
  ageLabel: string;
  ageYears: number | null;
  testName: string;
  orderItemId: string;
  collectedAt: string | null;
  receivedAt: string | null;
  verifiedAt: string | null;
  reportedAt: string | null;
  rejectReason: string | null;
  version: number;
  immutable: boolean;
  lines: LabResultLineDto[];
}

export interface LabReportDto {
  accessionId: string;
  number: string;
  barcode: string;
  status: string;
  patientName: string;
  uhid: string;
  sex: string;
  ageLabel: string;
  testName: string;
  specimen: string;
  collectedAt: string | null;
  verifiedAt: string | null;
  version: number;
  immutable: boolean;
  lines: Array<{
    name: string;
    value: string;
    unit: string;
    flag: LabFlag | null;
    flagLabel: string;
    rangeLabel: string;
    critical: boolean;
  }>;
}

export interface LabMisDto {
  from: string;
  to: string;
  total: number;
  byStatus: Record<string, number>;
  criticalCount: number;
  tatBreaches: number;
}
