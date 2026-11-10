import type { Tx } from '@hos/db';
import type { AdmissionRequestSink } from '@hos/shared';
import { requestAdmission } from './service';

/** Admission requests from the doctor workspace (CPOE) and from the ADT counter. */
export const admissions: AdmissionRequestSink<Tx> = {
  async request(ctx, input) {
    return requestAdmission(ctx, input);
  },
};
