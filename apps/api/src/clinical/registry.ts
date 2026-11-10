import type { Tx } from '@hos/db';
import type { ClinicalServices } from '@hos/shared';
import type { TenantGate } from '../guard';
import { admissions } from './adt/public';
import { diary } from './appointments/public';
import { billing } from './billing/public';
import { cash } from './cash';
import { charges, prices } from './charges';
import { encounterService } from './encounters';
import { discharge } from './ipbilling/public';
import { labResults } from './lab/public';
import { numbering } from './numbering';
import { nursing } from './nursing/public';
import { orders } from './orders';

/** The only way tasks call each other. Implementations close over nothing from the gate; callers pass a ClinicalCtx. */
export function clinical(_gate: TenantGate): ClinicalServices<Tx> {
  return {
    charges,
    prices,
    numbering,
    encounters: encounterService,
    orders,
    cash,
    billing,
    discharge,
    admissions,
    diary,
    labResults,
    nursing,
  };
}
