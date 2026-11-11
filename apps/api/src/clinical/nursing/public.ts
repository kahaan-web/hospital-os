import type { Tx } from '@hos/db';
import type { ClinicalCtx, NursingService } from '@hos/shared';
import {
  dietOrders as dietOrdersSvc,
  giveDose as giveDoseSvc,
  marForEncounter,
  wardPatients as wardPatientsSvc,
} from './service';

export const nursing: NursingService<Tx> = {
  wardPatients(ctx, q) {
    return wardPatientsSvc(ctx as ClinicalCtx<Tx>, q);
  },
  marFor(ctx, encounterId, date) {
    return marForEncounter(ctx as ClinicalCtx<Tx>, encounterId, date);
  },
  giveDose(ctx, doseId, input) {
    return giveDoseSvc(ctx as ClinicalCtx<Tx>, doseId, input);
  },
  dietOrders(ctx, q) {
    return dietOrdersSvc(ctx as ClinicalCtx<Tx>, q);
  },
};
