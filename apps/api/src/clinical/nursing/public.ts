import type { Tx } from '@hos/db';
import type { NursingService } from '@hos/shared';
import { ApiError } from '../../http';

/** B9 replaces this. The ward board is empty until the nursing task. */
export const nursing: NursingService<Tx> = {
  async wardPatients() {
    return [];
  },
  async marFor() {
    return [];
  },
  async giveDose() {
    throw new ApiError(422, 'not_available', 'Medicine administration is not available yet');
  },
  async dietOrders() {
    return [];
  },
};
