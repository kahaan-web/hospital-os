import type { ClinicalOrderDto, PatientDto, PrintDoc } from '@hos/shared';
import { ageLabel, maskMobile } from '@hos/shared';

export function medicinePrescriptionDoc(patient: PatientDto, orders: ClinicalOrderDto[], head: PrintDoc['letterhead']): PrintDoc {
  const lines = orders.flatMap((order) =>
    order.items.map((item) => ({
      drug: item.drugName ?? item.genericCode ?? '—',
      dose: [item.dose, item.frequencyCode, item.routeCode].filter(Boolean).join(' · ') || '—',
      days: item.durationDays == null ? '—' : String(item.durationDays),
      note: item.instructions ?? '',
    })),
  );
  return {
    size: 'A5',
    letterhead: head,
    blocks: [
      { kind: 'heading', text: 'Medicine prescription' },
      {
        kind: 'keyValues',
        rows: [
          { label: 'UHID', value: patient.uhid },
          { label: 'Name', value: patient.fullName },
          { label: 'Age / sex', value: `${ageLabel(patient.dob) || '—'} / ${patient.gender}` },
          { label: 'Mobile', value: maskMobile(patient.mobile) || '—' },
        ],
      },
      {
        kind: 'table',
        columns: ['Medicine', 'Dose / frequency', 'Days', 'Instructions'],
        rows: lines.map((line) => [line.drug, line.dose, line.days, line.note]),
      },
      { kind: 'signature', label: 'Doctor' },
    ],
  };
}

export function investigationPrescriptionDoc(patient: PatientDto, orders: ClinicalOrderDto[], head: PrintDoc['letterhead']): PrintDoc {
  const lines = orders.flatMap((order) => order.items.map((item) => ({ test: item.serviceId ? 'Investigation' : 'Test', note: item.instructions ?? '' })));
  return {
    size: 'A5',
    letterhead: head,
    blocks: [
      { kind: 'heading', text: 'Investigation prescription' },
      {
        kind: 'keyValues',
        rows: [
          { label: 'UHID', value: patient.uhid },
          { label: 'Name', value: patient.fullName },
          { label: 'Age / sex', value: `${ageLabel(patient.dob) || '—'} / ${patient.gender}` },
        ],
      },
      {
        kind: 'table',
        columns: ['Investigation', 'Note'],
        rows: lines.map((line) => [line.test, line.note]),
      },
      { kind: 'signature', label: 'Doctor' },
    ],
  };
}
