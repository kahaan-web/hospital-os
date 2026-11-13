import { schema, type Tx } from '@hos/db';
import { and, asc, count, desc, eq, gt, gte, inArray, lte, lt, ne, or, sql } from 'drizzle-orm';
import type { TenantGate } from '../../guard';
import { ApiError } from '../../http';

export const MODULE = 'ot-scheduling';
export const PREFIX = `/api/v1/tenant/m/${MODULE}`;

export function locationOf(gate: TenantGate): string {
  if (!gate.locationId) throw new ApiError(422, 'location_required', 'Choose a location');
  return gate.locationId;
}

export function tenantOf(gate: TenantGate): string {
  const tenantId = gate.actor.tenantId;
  if (!tenantId) throw new ApiError(422, 'location_required', 'Choose a location');
  return tenantId;
}

function parseHm(hm: string): { h: number; m: number } {
  const parts = hm.split(':');
  const h = Number.parseInt(parts[0] ?? '', 10);
  const m = Number.parseInt(parts[1] ?? '', 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) throw new ApiError(422, 'validation', 'Invalid time');
  return { h, m };
}

export function hmToLabel(t: string | null): string {
  if (!t) return '17:00';
  const raw = String(t).slice(0, 5);
  return /^\d{2}:\d{2}$/.test(raw) ? raw : '17:00';
}

export function combineIstDateTime(date: string, timeHm: string): Date {
  const { h, m } = parseHm(timeHm);
  const [ys, mos, ds] = date.split('-');
  const y = Number.parseInt(ys ?? '', 10);
  const mo = Number.parseInt(mos ?? '', 10);
  const d = Number.parseInt(ds ?? '', 10);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) throw new ApiError(422, 'validation', 'Invalid date');
  // IST = UTC+5:30
  return new Date(Date.UTC(y, mo - 1, d, h - 5, m - 30, 0, 0));
}

export function dateOnlyKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function nextRequestNumber(tx: Tx, tenantId: string): Promise<string> {
  const rows = await tx
    .select({ n: count() })
    .from(schema.otRequests)
    .where(eq(schema.otRequests.tenantId, tenantId));
  const seq = Number(rows[0]?.n ?? 0) + 1;
  return `REQ-${String(seq).padStart(6, '0')}`;
}

export async function nextApptNo(tx: Tx, tenantId: string, resourceId: string, bookingDate: string): Promise<string> {
  const rows = await tx
    .select({ n: count() })
    .from(schema.otBookings)
    .where(and(eq(schema.otBookings.tenantId, tenantId), eq(schema.otBookings.resourceId, resourceId), eq(schema.otBookings.bookingDate, bookingDate)));
  const seq = Number(rows[0]?.n ?? 0) + 1;
  return String(900 + seq);
}

export type CutoffPolicy = { cutoffTime: string; minLeadDays: number; emergencyBypass: boolean };

export async function loadCutoffPolicy(tx: Tx, tenantId: string, resourceId: string): Promise<CutoffPolicy> {
  const [settings] = await tx.select().from(schema.otSettings).where(eq(schema.otSettings.tenantId, tenantId));
  const [resource] = await tx.select().from(schema.otResources).where(eq(schema.otResources.id, resourceId));
  const cutoffTime = resource?.cutoffTime ? hmToLabel(String(resource.cutoffTime)) : hmToLabel(settings?.cutoffTime ? String(settings.cutoffTime) : null);
  const minLeadDays = resource?.minLeadDays ?? settings?.minLeadDays ?? 1;
  const emergencyBypass = settings?.emergencyBypass ?? true;
  return { cutoffTime, minLeadDays, emergencyBypass };
}

/** Booking cutoff: after cutoff today, refuse bookings within minLeadDays (unless emergency + bypass). */
export function assertBookingCutoff(policy: CutoffPolicy, bookingDate: string, caseType: 'elective' | 'emergency', now = new Date()): void {
  if (caseType === 'emergency' && policy.emergencyBypass) return;
  const istNow = new Date(now.getTime() + 5.5 * 3_600_000);
  const today = istNow.toISOString().slice(0, 10);
  const { h, m } = parseHm(policy.cutoffTime);
  const cutoffMinutes = h * 60 + m;
  const nowMinutes = istNow.getUTCHours() * 60 + istNow.getUTCMinutes();
  if (bookingDate <= today) {
    throw new ApiError(422, 'booking_cutoff', `Bookings for ${bookingDate} are not allowed after the cutoff (${policy.cutoffTime})`);
  }
  if (nowMinutes >= cutoffMinutes) {
    const leadEnd = addIstDays(today, policy.minLeadDays);
    if (bookingDate <= leadEnd) {
      throw new ApiError(
        422,
        'booking_cutoff',
        `After ${policy.cutoffTime}, bookings are not allowed until ${leadEnd} (minimum lead ${policy.minLeadDays} day(s); OT override may apply)`,
      );
    }
  }
}

function addIstDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function assertNoOverlap(
  tx: Tx,
  tenantId: string,
  resourceId: string,
  start: Date,
  end: Date,
  excludeId?: string,
): Promise<void> {
  const [resource] = await tx.select().from(schema.otResources).where(eq(schema.otResources.id, resourceId));
  if (!resource) throw new ApiError(404, 'not_found', 'OT resource not found');
  const overlapping = await tx
    .select({ id: schema.otBookings.id })
    .from(schema.otBookings)
    .where(
      and(
        eq(schema.otBookings.tenantId, tenantId),
        eq(schema.otBookings.resourceId, resourceId),
        eq(schema.otBookings.status, 'booked'),
        excludeId ? ne(schema.otBookings.id, excludeId) : undefined,
        lt(schema.otBookings.scheduledStart, end),
        gt(schema.otBookings.scheduledEnd, start),
      ),
    );
  const n = overlapping.length;
  if (n === 0) return;
  if (!resource.overlapAllowed || n >= resource.maxOverlap) {
    throw new ApiError(409, 'slot_overlap', `This OT slot overlaps ${n} existing booking(s)`);
  }
}

export async function doctorNames(tx: Tx, tenantId: string, ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const rows = await tx
    .select({ id: schema.doctors.id, name: schema.doctors.name })
    .from(schema.doctors)
    .where(and(eq(schema.doctors.tenantId, tenantId), inArray(schema.doctors.id, ids)));
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}

export function patientAgeYears(dob: Date | null): string {
  if (!dob) return '';
  const now = new Date();
  let y = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) y -= 1;
  return String(Math.max(0, y));
}
