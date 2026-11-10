// India-specific formats and reference data: ₹ / en-IN numbers, DD/MM/YYYY, GST state codes, GSTIN, mobile.

export interface IndianState {
  /** Two-digit GST state code (first two characters of a GSTIN). */
  code: string;
  name: string;
  ut: boolean;
}

export const INDIAN_STATES: readonly IndianState[] = [
  { code: '01', name: 'Jammu and Kashmir', ut: true },
  { code: '02', name: 'Himachal Pradesh', ut: false },
  { code: '03', name: 'Punjab', ut: false },
  { code: '04', name: 'Chandigarh', ut: true },
  { code: '05', name: 'Uttarakhand', ut: false },
  { code: '06', name: 'Haryana', ut: false },
  { code: '07', name: 'Delhi', ut: true },
  { code: '08', name: 'Rajasthan', ut: false },
  { code: '09', name: 'Uttar Pradesh', ut: false },
  { code: '10', name: 'Bihar', ut: false },
  { code: '11', name: 'Sikkim', ut: false },
  { code: '12', name: 'Arunachal Pradesh', ut: false },
  { code: '13', name: 'Nagaland', ut: false },
  { code: '14', name: 'Manipur', ut: false },
  { code: '15', name: 'Mizoram', ut: false },
  { code: '16', name: 'Tripura', ut: false },
  { code: '17', name: 'Meghalaya', ut: false },
  { code: '18', name: 'Assam', ut: false },
  { code: '19', name: 'West Bengal', ut: false },
  { code: '20', name: 'Jharkhand', ut: false },
  { code: '21', name: 'Odisha', ut: false },
  { code: '22', name: 'Chhattisgarh', ut: false },
  { code: '23', name: 'Madhya Pradesh', ut: false },
  { code: '24', name: 'Gujarat', ut: false },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu', ut: true },
  { code: '27', name: 'Maharashtra', ut: false },
  { code: '29', name: 'Karnataka', ut: false },
  { code: '30', name: 'Goa', ut: false },
  { code: '31', name: 'Lakshadweep', ut: true },
  { code: '32', name: 'Kerala', ut: false },
  { code: '33', name: 'Tamil Nadu', ut: false },
  { code: '34', name: 'Puducherry', ut: true },
  { code: '35', name: 'Andaman and Nicobar Islands', ut: true },
  { code: '36', name: 'Telangana', ut: false },
  { code: '37', name: 'Andhra Pradesh', ut: false },
  { code: '38', name: 'Ladakh', ut: true },
];

const STATE_BY_CODE = new Map(INDIAN_STATES.map((s) => [s.code, s]));

export function stateName(code: string | null | undefined): string {
  return (code && STATE_BY_CODE.get(code)?.name) || '—';
}

export function isStateCode(code: string): boolean {
  return STATE_BY_CODE.has(code);
}

export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** GSTIN check digit (mod-36 Luhn variant) for the first 14 characters. */
export function gstinCheckDigit(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = GSTIN_CHARS.indexOf(first14[i] ?? '');
    if (v < 0) return '';
    const p = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36] ?? '';
}

export interface GstinCheck {
  valid: boolean;
  /** Format and state code are right but the check digit does not match (soft warning in the UI). */
  checksumValid: boolean;
  stateCode: string | null;
  error?: string;
}

export function checkGstin(raw: string): GstinCheck {
  const gstin = raw.trim().toUpperCase();
  if (!GSTIN_REGEX.test(gstin)) {
    return { valid: false, checksumValid: false, stateCode: null, error: 'GSTIN must be 15 characters, like 27ABCDE1234F1Z5' };
  }
  const stateCode = gstin.slice(0, 2);
  if (!isStateCode(stateCode)) {
    return { valid: false, checksumValid: false, stateCode: null, error: `GSTIN starts with an unknown state code (${stateCode})` };
  }
  return { valid: true, checksumValid: gstinCheckDigit(gstin.slice(0, 14)) === gstin[14], stateCode };
}

export const MOBILE_REGEX = /^[6-9][0-9]{9}$/;

/** Normalises "+91 98765 43210" style input to the 10-digit number, or null when invalid. */
export function normaliseMobile(raw: string): string | null {
  const digits = raw.replace(/[\s\-()]/g, '').replace(/^(\+?91|0)(?=[6-9][0-9]{9}$)/, '');
  return MOBILE_REGEX.test(digits) ? digits : null;
}

export const PINCODE_REGEX = /^[1-9][0-9]{5}$/;

const inrWhole = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inrPaise = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numIN = new Intl.NumberFormat('en-IN');

/** Format an amount held in paise as ₹ with Indian digit grouping (₹1,23,456.00). */
export function formatINR(paise: number, opts: { decimals?: 'auto' | 'always' | 'never' } = {}): string {
  const mode = opts.decimals ?? 'auto';
  const whole = paise % 100 === 0;
  if (mode === 'never' || (mode === 'auto' && whole)) return inrWhole.format(Math.round(paise / 100));
  return inrPaise.format(paise / 100);
}

export function formatNumberIN(n: number): string {
  return numIN.format(n);
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** DD/MM/YYYY in India Standard Time. */
export function formatDate(input: Date | string | number | null | undefined): string {
  if (input === null || input === undefined || input === '') return '—';
  const d = toIst(input);
  if (!d) return '—';
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/** DD/MM/YYYY, hh:mm AM/PM in IST. */
export function formatDateTime(input: Date | string | number | null | undefined): string {
  if (input === null || input === undefined || input === '') return '—';
  const d = toIst(input);
  if (!d) return '—';
  const h = d.getUTCHours();
  return `${formatDate(input)}, ${pad(h % 12 === 0 ? 12 : h % 12)}:${pad(d.getUTCMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
}

const IST_OFFSET_MS = 330 * 60 * 1000;
function toIst(input: Date | string | number): Date | null {
  // Date-only strings (YYYY-MM-DD) are calendar dates; do not shift them.
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) return new Date(`${input}T00:00:00Z`);
  const t = new Date(input).getTime();
  return Number.isNaN(t) ? null : new Date(t + IST_OFFSET_MS);
}

/** Parse DD/MM/YYYY (also D/M/YYYY, with / - or .) into an ISO date (YYYY-MM-DD). */
export function parseDDMMYYYY(text: string): string | null {
  const m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(text.trim());
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

export function isoToDDMMYYYY(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** Indian financial year (1 April – 31 March) label for invoice series, e.g. "26-27". */
export function financialYear(date: Date): string {
  const d = new Date(date.getTime() + IST_OFFSET_MS);
  const y = d.getUTCFullYear();
  const start = d.getUTCMonth() >= 3 ? y : y - 1;
  return `${String(start % 100).padStart(2, '0')}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** GST rule 46: invoice numbers are consecutive, unique per financial year and at most 16 characters. */
export function formatInvoiceNumber(prefix: string, fy: string, serial: number): string {
  const head = `${prefix}/${fy}/`;
  const width = Math.max(1, Math.min(6, 16 - head.length));
  const number = `${head}${String(serial).padStart(width, '0')}`;
  if (number.length > 16) throw new Error(`Invoice number "${number}" exceeds 16 characters`);
  return number;
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n] ?? '';
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;
}
function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return `${h ? `${ONES[h]} Hundred${rest ? ' ' : ''}` : ''}${rest ? twoDigits(rest) : ''}`;
}

/** Amount in words using the Indian system (lakh, crore), as printed on tax invoices. */
export function amountInWords(paise: number): string {
  const rupees = Math.floor(Math.abs(paise) / 100);
  const p = Math.abs(paise) % 100;
  const parts: string[] = [];
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const rest = rupees % 1000;
  if (crore) parts.push(`${crore > 99 ? threeDigits(crore) : twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));
  const r = parts.length ? parts.join(' ') : 'Zero';
  return `Rupees ${r}${p ? ` and ${twoDigits(p)} Paise` : ''} Only`;
}
