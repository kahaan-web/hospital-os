import type { Tx } from '@hos/db';
import type { BillingStatusReader, ChargeSource } from '@hos/shared';

/** B5 replaces this. Until then every source is treated as settled and there are no bills. */
export const billing: BillingStatusReader<Tx> = {
  async settledSources(_ctx, sources: ChargeSource[]) {
    return new Set(sources.map((source) => `${source.type}:${source.id}:${source.line ?? ''}`));
  },
  async billsForPatient() {
    return [];
  },
};
