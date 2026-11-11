import type { AdmissionDto, DischargeSummaryDto, PatientDto, PrintDoc } from '@hos/shared';
import { ageLabel, maskMobile } from '@hos/shared';

function ddMmYyyy(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

export function admissionStickerDoc(admission: AdmissionDto, patient: PatientDto, head: PrintDoc['letterhead']): PrintDoc {
  const bed = [...admission.assignments].reverse().find((row) => row.toAt == null) ?? admission.assignments.at(-1);
  return {
    size: 'label_50x25',
    letterhead: head,
    blocks: [
      { kind: 'heading', text: patient.fullName.slice(0, 28) },
      { kind: 'barcode', value: patient.uhid },
      { kind: 'paragraph', text: `${patient.uhid} · ${bed ? `${bed.wardCode} ${bed.bedLabel}` : admission.number}` },
    ],
  };
}

export function summaryDoc(admission: AdmissionDto, summary: DischargeSummaryDto, patient: PatientDto, head: PrintDoc['letterhead']): PrintDoc {
  const sections = summary.sections;
  return {
    size: 'A4',
    letterhead: head,
    blocks: [
      { kind: 'heading', text: 'Discharge summary' },
      {
        kind: 'keyValues',
        rows: [
          { label: 'UHID', value: patient.uhid },
          { label: 'Name', value: patient.fullName },
          { label: 'Age / sex', value: `${ageLabel(patient.dob) || '—'} / ${patient.gender}` },
          { label: 'Mobile', value: maskMobile(patient.mobile) || '—' },
          { label: 'IP number', value: admission.number },
          { label: 'Admitted', value: ddMmYyyy(admission.admittedAt) },
          { label: 'Discharged', value: ddMmYyyy(admission.dischargedAt) },
          { label: 'Doctor', value: admission.doctorName || '—' },
        ],
      },
      { kind: 'heading', text: 'Diagnosis' },
      { kind: 'paragraph', text: sections.diagnosis || '—' },
      { kind: 'heading', text: 'Course in hospital' },
      { kind: 'paragraph', text: sections.course || '—' },
      { kind: 'heading', text: 'Treatment' },
      { kind: 'paragraph', text: sections.treatment || '—' },
      { kind: 'heading', text: 'Condition at discharge' },
      { kind: 'paragraph', text: sections.condition || '—' },
      { kind: 'heading', text: 'Advice' },
      { kind: 'paragraph', text: sections.advice || '—' },
      { kind: 'heading', text: 'Follow-up' },
      { kind: 'paragraph', text: sections.followUp || '—' },
      { kind: 'signature', label: 'Doctor' },
    ],
  };
}
