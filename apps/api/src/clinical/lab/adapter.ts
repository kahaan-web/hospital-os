import type { AnalyzerResultInput } from '@hos/shared';
import { analyzerResultSchema } from '@hos/shared';
import { ApiError } from '../../http';

/** Mock ASTM adapter. A real instrument protocol replaces `parse` without changing the ingest route. */
export interface LabAnalyzerAdapter {
  kind: 'mock_astm';
  parse(body: unknown): AnalyzerResultInput;
}

export const mockAstmAdapter: LabAnalyzerAdapter = {
  kind: 'mock_astm',
  parse(body) {
    const parsed = analyzerResultSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'The analyser payload is not valid';
      throw new ApiError(400, 'validation', message);
    }
    return parsed.data;
  },
};
