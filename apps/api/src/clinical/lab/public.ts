import type { Tx } from '@hos/db';
import type { LabReportListItem, LabResultSummaryDto, LabResultsReader } from '@hos/shared';
import type { ClinicalCtx } from '@hos/shared';
import { reportsForPatient as listReportsForPatient, summariesFor } from './service';

/** Laboratory results for other modules. Callers pass a ClinicalCtx; this does not open a session. */
export const labResults: LabResultsReader<Tx> = {
  async summaries(ctx: ClinicalCtx<Tx>, orderItemIds: string[]): Promise<Map<string, LabResultSummaryDto>> {
    return summariesFor(ctx, orderItemIds);
  },
  async reportsForPatient(ctx: ClinicalCtx<Tx>, patientId: string): Promise<LabReportListItem[]> {
    return listReportsForPatient(ctx, patientId);
  },
};
