import type { Tx } from '@hos/db';
import type { LabResultsReader } from '@hos/shared';

/** B8 replaces this. No results until the laboratory task. */
export const labResults: LabResultsReader<Tx> = {
  async summaries() {
    return new Map();
  },
  async reportsForPatient() {
    return [];
  },
};
