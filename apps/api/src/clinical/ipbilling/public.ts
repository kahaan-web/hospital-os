import type { Tx } from '@hos/db';
import type { ClinicalCtx, DischargeClearance } from '@hos/shared';
import { computeDischargeBalance } from './engine';

export type IpBillHook<TX = Tx> = {
  id: string;
  beforeFinalise?: (ctx: ClinicalCtx<TX>, billId: string) => Promise<void>;
};

const hooks: IpBillHook<Tx>[] = [];

export function registerIpBillHook(hook: IpBillHook<Tx>): void {
  hooks.push(hook);
}

export function ipBillHooks(): readonly IpBillHook<Tx>[] {
  return hooks;
}

/** Discharge is allowed when every charge is billed and the patient share is cleared. */
export const discharge: DischargeClearance<Tx> = {
  async check(ctx, encounterId) {
    return computeDischargeBalance(ctx, encounterId);
  },
};
