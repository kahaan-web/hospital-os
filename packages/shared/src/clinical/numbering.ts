// Document numbers: {docPrefix}{docCode}/{yy}{yy}/{5-digit seq}, at most 16 characters (GST Rules 46/49).
// The series resets on 1 April, Asia/Kolkata. UHID is tenant-wide and has no period.

export const DOC_SERIES = {
  opd_visit: 'OV',
  ip_admission: 'IP',
  op_bill: 'OB',
  ip_bill: 'IB',
  receipt: 'RC',
  deposit: 'DP',
  refund: 'RF',
  credit_note: 'CN',
  pharmacy_sale: 'PS',
  pharmacy_return: 'PR',
  grn: 'GR',
  lab_accession: 'LA',
  mlc: 'ML',
  clinical_order: 'OR',
} as const;

export type DocSeriesKey = keyof typeof DOC_SERIES;

export const SERIES_KEYS = [...Object.keys(DOC_SERIES), 'uhid'] as const;
export type NamedSeriesKey = (typeof SERIES_KEYS)[number];

/** `opd_token:<doctorId>` uses the calendar date as its period and returns a plain integer. */
export type SeriesKey = NamedSeriesKey | `opd_token:${string}`;

export const MAX_DOC_NUMBER_LENGTH = 16;

const IST = 'Asia/Kolkata';

export function istDateParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: pick('year'), month: pick('month'), day: pick('day') };
}

/** Financial-year code. 31 March 23:59 IST is the previous FY (`2526` for 2025-26). 1 April is the new FY. */
export function fyCode(date: Date): string {
  const { year, month } = istDateParts(date);
  const startYear = month < 4 ? year - 1 : year;
  return `${String(startYear).slice(-2)}${String(startYear + 1).slice(-2)}`;
}

/** Calendar date in Asia/Kolkata, `YYYY-MM-DD`, used as the OPD token period. */
export function istDateKey(date: Date): string {
  const { year, month, day } = istDateParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function formatDocNumber(docPrefix: string, docCode: string, fy: string, seq: number): string {
  return `${docPrefix}${docCode}/${fy}/${String(seq).padStart(5, '0')}`;
}

export function formatUhid(seq: number): string {
  return `UH${String(seq).padStart(9, '0')}`;
}

export function isOpdTokenKey(key: string): key is `opd_token:${string}` {
  return key.startsWith('opd_token:') && key.length > 'opd_token:'.length;
}

export function docCodeFor(key: DocSeriesKey): string {
  return DOC_SERIES[key];
}
