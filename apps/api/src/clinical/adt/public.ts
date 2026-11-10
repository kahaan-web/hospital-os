import type { Tx } from '@hos/db';
import type { AdmissionRequestSink } from '@hos/shared';
import { ApiError } from '../../http';

/** B4 replaces this. Admission requests are not available until that task. */
export const admissions: AdmissionRequestSink<Tx> = {
  async request() {
    throw new ApiError(422, 'not_available', 'Admission requests are not available yet');
  },
};
