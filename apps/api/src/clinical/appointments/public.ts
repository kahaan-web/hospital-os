import type { Tx } from '@hos/db';
import type { DiaryReader } from '@hos/shared';
import { ApiError } from '../../http';

/** B2 replaces this. The diary is empty until appointments are built. */
export const diary: DiaryReader<Tx> = {
  async diary() {
    return [];
  },
  async slots() {
    return [];
  },
  async book() {
    throw new ApiError(422, 'not_available', 'Appointment booking is not available yet');
  },
  async cancel() {
    throw new ApiError(422, 'not_available', 'Appointment booking is not available yet');
  },
};
