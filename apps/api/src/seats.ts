import { schema, type Tx } from '@hos/db';
import { eq, inArray, sql } from 'drizzle-orm';
import { ApiError } from './http';

/**
 * Users included with each purchased location.
 * Decision: Basic 8, Medium 25, Premium 80. Active and pending users count.
 * Disabled users do not, so reactivating one needs a free seat.
 */
export const SEATS_PER_LOCATION: Record<string, number> = {
  basic: 8,
  medium: 25,
  premium: 80,
};

export async function assertSeatAvailable(tx: Tx, adding: number): Promise<void> {
  if (adding <= 0) return;
  const [sub] = await tx.select().from(schema.subscriptions);
  if (!sub) throw new ApiError(422, 'no_subscription', 'There is no subscription yet');
  const [plan] = await tx.select().from(schema.plans).where(eq(schema.plans.id, sub.planId));
  const perLocation = SEATS_PER_LOCATION[plan?.key ?? ''] ?? 8;
  const cap = perLocation * Math.max(1, sub.locationCount);
  const counted = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.users)
    .where(inArray(schema.users.status, ['active', 'pending']));
  const used = Number(counted[0]?.n ?? 0);
  if (used + adding > cap) {
    throw new ApiError(403, 'seat_limit', `This plan includes ${cap} users (${perLocation} per location).`);
  }
}
