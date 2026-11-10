import type { Tx } from '@hos/db';
import type { DischargeClearance } from '@hos/shared';

/** B6 replaces this. Until then discharge is not blocked by a balance. */
export const discharge: DischargeClearance<Tx> = {
  async check() {
    return { ok: true, balancePaise: 0, reasons: [] };
  },
};
