import type { CasePaperDto, ClinicalOrderDto, PatientDto, PrintBlock, PrintDoc, PrintDoc as Doc } from '@hos/shared';
import { maskMobile } from '@hos/shared';

function kv(rows: { label: string; value: string }[]): PrintBlock {
  return { kind: 'keyValues', rows };
}

export function doctorCasePaperDoc(patient: PatientDto, paper: CasePaperDto, head: Doc['letterhead']): PrintDoc {
  const blocks: PrintBlock[] = [
    { kind: 'heading', text: 'OPD case paper' },
    kv([
      { label: 'UHID', value: patient.uhid },
      { label: 'Name', value: patient.fullName },
      { label: 'Age / sex', value: `${patient.ageLabel || '—'} / ${patient.gender}` },
      { label: 'Mobile', value: maskMobile(patient.mobile) || '—' },
    ]),
    { kind: 'spacer', mm: 4 },
    { kind: 'heading', text: 'Chief complaint' },
    { kind: 'paragraph', text: paper.chiefComplaint || '—' },
    { kind: 'heading', text: 'History' },
    { kind: 'paragraph', text: paper.history || '—' },
    { kind: 'heading', text: 'Examination' },
    { kind: 'paragraph', text: paper.examination || '—' },
    {
      kind: 'table',
      columns: ['ICD-10', 'Diagnosis'],
      rows: paper.diagnoses.length ? paper.diagnoses.map((d) => [d.code, d.codeDisplay]) : [['—', '—']],
    },
    { kind: 'heading', text: 'Advice' },
    { kind: 'paragraph', text: paper.advice || '—' },
  ];
  return { size: 'A4', letterhead: head, blocks };
}

export function prescriptionDoc(
  patient: PatientDto,
  order: ClinicalOrderDto,
  head: Doc['letterhead'],
  doctor: { name: string; registrationNo: string },
): PrintDoc {
  const rows = order.items.map((line) => [
    line.drugName ?? '',
    [line.strength, line.doseForm, line.dose].filter(Boolean).join(' '),
    line.frequencyCode ?? '',
    line.durationDays ? `${line.durationDays} d` : '',
    line.instructions ?? '',
  ]);
  const blocks: PrintBlock[] = [
    { kind: 'heading', text: 'Prescription' },
    kv([
      { label: 'UHID', value: patient.uhid },
      { label: 'Patient', value: patient.fullName },
      { label: 'Order', value: order.number },
      { label: 'Doctor', value: doctor.name },
      { label: 'Reg. no.', value: doctor.registrationNo || '—' },
    ]),
    { kind: 'table', columns: ['Medicine', 'Dose', 'Frequency', 'Days', 'Notes'], rows },
    { kind: 'signature', label: doctor.name },
  ];
  return { size: 'A4', letterhead: head, blocks };
}

export function investigationDoc(patient: PatientDto, orders: ClinicalOrderDto[], head: Doc['letterhead']): PrintDoc {
  const lines = orders.flatMap((order) =>
    order.items.map((line) => [order.number, line.instructions || '', order.placedAt.slice(0, 10)]),
  );
  return {
    size: 'A4',
    letterhead: head,
    blocks: [
      { kind: 'heading', text: 'Investigation orders' },
      kv([
        { label: 'UHID', value: patient.uhid },
        { label: 'Name', value: patient.fullName },
      ]),
      { kind: 'table', columns: ['Order', 'Instructions', 'Placed'], rows: lines.length ? lines : [['—', '—', '—']] },
    ],
  };
}
