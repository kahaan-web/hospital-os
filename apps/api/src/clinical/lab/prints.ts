import type { LabReportDto, LetterheadDto, PrintDoc } from '@hos/shared';
import { formatDateTime } from '@hos/shared';

/** Diagnostic reports are clinical documents. The charge itself is exempt healthcare (SAC 9993). */
export function labReportPrint(report: LabReportDto, letterhead: LetterheadDto): PrintDoc {
  return {
    size: 'A4',
    letterhead,
    blocks: [
      { kind: 'heading', text: report.immutable ? 'Laboratory report' : 'Laboratory report (not verified)' },
      {
        kind: 'keyValues',
        rows: [
          { label: 'Accession', value: report.number },
          { label: 'Patient', value: `${report.patientName} · ${report.uhid}` },
          { label: 'Age / sex', value: [report.ageLabel, report.sex].filter(Boolean).join(' · ') || '—' },
          { label: 'Test', value: report.testName },
          { label: 'Specimen', value: report.specimen },
          { label: 'Collected', value: report.collectedAt ? formatDateTime(report.collectedAt) : '—' },
          { label: 'Verified', value: report.verifiedAt ? formatDateTime(report.verifiedAt) : 'Not verified' },
          { label: 'Version', value: String(report.version) },
        ],
      },
      { kind: 'barcode', value: report.barcode },
      {
        kind: 'table',
        columns: ['Parameter', 'Result', 'Unit', 'Flag', 'Reference'],
        rows: report.lines.map((line) => [line.name, line.value || '—', line.unit || '—', line.flagLabel || '—', line.rangeLabel]),
      },
      {
        kind: 'paragraph',
        text: 'Diagnostic services are exempt healthcare (SAC 9993). Confirm the tax treatment with your CA. Critical low and critical high values need a clinician to see them before the report is filed.',
      },
      { kind: 'signature', label: report.immutable ? 'Authorised signatory' : 'Results not yet verified' },
    ],
  };
}
