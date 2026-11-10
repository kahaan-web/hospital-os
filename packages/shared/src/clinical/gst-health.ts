// Healthcare GST. Clinical services are exempt; room rent and counter sales follow the rules below.
// Rates are configuration. The UI must label them "confirm with CA". This is not a tax opinion.

/** SAC 9993, Notification 12/2017-CT(Rate) Sl. 74, covers clinical services at 0%. */
export const HEALTHCARE_SAC = '9993';

/** Room rent above ₹5,000 per day per patient is 5% without ITC. At or below is 0%. */
export const ROOM_RENT_THRESHOLD_PAISE = 500_000;
export const ROOM_RENT_RATE_BP = 500;

export const GST_TREATMENTS = ['exempt_healthcare', 'taxable', 'room_rent_rule'] as const;
export type GstTreatment = (typeof GST_TREATMENTS)[number];

export const CLINICAL_DOC_TYPES = ['bill_of_supply', 'tax_invoice', 'invoice_cum_bill_of_supply'] as const;
export type ClinicalDocType = (typeof CLINICAL_DOC_TYPES)[number];

export interface ResolvedGst {
  treatment: GstTreatment;
  /** Basis points actually applied. 1800 = 18%. */
  gstRateBp: number;
}

/**
 * Resolve the rate for one line.
 * `configuredRateBp` is the item or service rate (pharmacy HSN, or the service rate for taxable work).
 * `unitPricePaise` is the bed-day price when treatment is `room_rent_rule`.
 */
export function resolveLineGst(input: {
  treatment: GstTreatment;
  configuredRateBp?: number;
  unitPricePaise?: number;
}): ResolvedGst {
  if (input.treatment === 'exempt_healthcare') return { treatment: input.treatment, gstRateBp: 0 };
  if (input.treatment === 'room_rent_rule') {
    const over = (input.unitPricePaise ?? 0) > ROOM_RENT_THRESHOLD_PAISE;
    return { treatment: input.treatment, gstRateBp: over ? ROOM_RENT_RATE_BP : 0 };
  }
  const rate = input.configuredRateBp ?? 0;
  if (!Number.isInteger(rate) || rate < 0 || rate > 10_000) {
    throw new Error('GST rate must be a whole number of basis points from 0 to 10000');
  }
  return { treatment: 'taxable', gstRateBp: rate };
}

/** A line is an exempt supply for document-type purposes when no tax is charged and it is not a taxable item. */
export function lineIsExemptSupply(line: { treatment: GstTreatment; gstRateBp: number }): boolean {
  if (line.treatment === 'taxable') return false;
  return line.gstRateBp === 0;
}

/**
 * MRP includes GST. Split it into taxable value and tax, rounding half-up to the paise.
 * Example: ₹112.00 at 12% → ₹100.00 taxable and ₹12.00 tax.
 */
export function splitInclusive(grossPaise: number, gstRateBp: number): { taxablePaise: number; taxPaise: number } {
  if (!Number.isInteger(grossPaise) || grossPaise < 0) throw new Error('Gross amount must be a non-negative whole number of paise');
  if (!Number.isInteger(gstRateBp) || gstRateBp < 0) throw new Error('GST rate must be a non-negative whole number of basis points');
  if (gstRateBp === 0 || grossPaise === 0) return { taxablePaise: grossPaise, taxPaise: 0 };
  const taxPaise = Math.round((grossPaise * gstRateBp) / (10_000 + gstRateBp));
  return { taxablePaise: grossPaise - taxPaise, taxPaise };
}

/**
 * Rule 49 bill of supply when every line is exempt.
 * Tax invoice when every line is taxable.
 * Rule 46A invoice-cum-bill of supply when an unregistered patient has a mix.
 * A registered recipient with a mix gets a tax invoice.
 */
export function documentTypeFor(
  lines: readonly { treatment: GstTreatment; gstRateBp: number }[],
  patientRegistered: boolean,
): ClinicalDocType {
  if (lines.length === 0) return 'bill_of_supply';
  const exempt = lines.filter((line) => lineIsExemptSupply(line)).length;
  if (exempt === lines.length) return 'bill_of_supply';
  if (exempt === 0) return 'tax_invoice';
  return patientRegistered ? 'tax_invoice' : 'invoice_cum_bill_of_supply';
}

/**
 * The hospital location's state is the place of supply, so tax is CGST + SGST.
 * IGST applies only when a registered corporate or TPA is billed and their GSTIN is in another state.
 */
export function placeOfSupply(input: { locationStateCode: string; payerGstin?: string | null }): {
  stateCode: string;
  interState: boolean;
} {
  const gstin = (input.payerGstin ?? '').trim().toUpperCase();
  if (/^[0-9]{2}[A-Z0-9]{13}$/.test(gstin)) {
    const payerState = gstin.slice(0, 2);
    if (payerState !== input.locationStateCode) return { stateCode: payerState, interState: true };
  }
  return { stateCode: input.locationStateCode, interState: false };
}

/** Round a bill total to the nearest rupee. The difference is a separate round-off line, at most 50 paise. */
export function roundOffPaise(totalPaise: number): { roundedPaise: number; roundOffPaise: number } {
  const roundedPaise = Math.round(totalPaise / 100) * 100;
  return { roundedPaise, roundOffPaise: roundedPaise - totalPaise };
}
