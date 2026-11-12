import type { Tx } from '@hos/db';
import type { SQL } from 'drizzle-orm';
import { ApiError } from '../../http';

function textOf(error: unknown, depth = 0): string {
  if (!error || typeof error !== 'object' || depth > 6) return '';
  const record = error as { message?: unknown; cause?: unknown };
  const own = typeof record.message === 'string' ? record.message : '';
  return `${own} ${textOf(record.cause, depth + 1)}`;
}

/** Run a billing SECURITY DEFINER call and map its hos: errors onto API status codes. */
export async function billingDefiner(tx: Tx, query: SQL): Promise<void> {
  try {
    await tx.execute(query);
  } catch (error) {
    const text = textOf(error);
    if (
      text.includes('hos:bill_not_found')
      || text.includes('hos:deposit_not_found')
      || text.includes('hos:cash_not_found')
      || text.includes('hos:credit_note_not_found')
    ) {
      throw new ApiError(404, 'not_found', 'That record was not found');
    }
    if (text.includes('hos:bad_transition')) {
      throw new ApiError(409, 'conflict', 'That billing change is not allowed');
    }
    if (text.includes('hos:forbidden')) {
      throw new ApiError(403, 'forbidden', 'You cannot do that');
    }
    throw error;
  }
}
