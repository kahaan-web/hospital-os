import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function sha256Hex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

export function publicId(prefix: 'order' | 'pay'): string {
  const bytes = randomBytes(14);
  let out = '';
  for (let i = 0; i < 14; i++) out += BASE62[bytes[i]! % 62];
  return `${prefix}_${out}`;
}

export function otpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Lowercase hex HMAC-SHA256 of `orderPublicId|paymentPublicId`. */
export function paymentSignature(secret: string, orderPublicId: string, paymentPublicId: string): string {
  return createHmac('sha256', secret).update(`${orderPublicId}|${paymentPublicId}`).digest('hex');
}

/** Reject webhook timestamps further than this from the server clock. */
export const WEBHOOK_MAX_SKEW_MS = 5 * 60 * 1000;

/** Unix seconds, the value that goes in `x-hos-timestamp` and under the HMAC. */
export function webhookTimestamp(at = Date.now()): string {
  return String(Math.floor(at / 1000));
}

/** True when `timestamp` is unix seconds (or ms) within {@link WEBHOOK_MAX_SKEW_MS}. */
export function webhookTimestampFresh(timestamp: string, now = Date.now()): boolean {
  if (!/^[0-9]{10,13}$/.test(timestamp)) return false;
  const raw = Number(timestamp);
  if (!Number.isFinite(raw)) return false;
  const ms = raw > 10_000_000_000 ? raw : raw * 1000;
  return Math.abs(now - ms) <= WEBHOOK_MAX_SKEW_MS;
}

/**
 * Lowercase hex HMAC-SHA256 of `${timestamp}.${canonicalJson(body)}`.
 * The timestamp is outside the body so a captured request cannot be re-signed
 * without the webhook secret, and an old signature fails the skew check.
 */
export function webhookSignature(secret: string, timestamp: string, body: unknown): string {
  return createHmac('sha256', secret).update(`${timestamp}.${canonicalJson(body)}`).digest('hex');
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = BASE32.indexOf(char);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpAt(secret: string, at = Date.now()): string {
  const counter = Math.floor(at / 30_000);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const bin = ((hmac[offset]! & 0x7f) << 24) | (hmac[offset + 1]! << 16) | (hmac[offset + 2]! << 8) | hmac[offset + 3]!;
  return String(bin % 1_000_000).padStart(6, '0');
}

export function verifyTotp(secret: string, code: string): boolean {
  const now = Date.now();
  for (let window = -1; window <= 1; window++) {
    if (safeEqual(totpAt(secret, now + window * 30_000), code)) return true;
  }
  return false;
}

export function otpauthUrl(email: string, secret: string): string {
  const label = encodeURIComponent(`Hospital OS:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent('Hospital OS')}&digits=6&period=30`;
}
