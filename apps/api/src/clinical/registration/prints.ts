import type { PatientDto, PrintDoc, PrintBlock } from '@hos/shared';
import { ageLabel, maskMobile } from '@hos/shared';
function ddMmYyyyIst(): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());
}

function kv(rows: { label: string; value: string }[]): PrintBlock {
  return { kind: 'keyValues', rows };
}

export function casePaperDoc(patient: PatientDto, head: PrintDoc['letterhead']): PrintDoc {
  const blocks: PrintBlock[] = [
    { kind: 'heading', text: 'OPD case paper' },
    kv([
      { label: 'UHID', value: patient.uhid },
      { label: 'Name', value: patient.fullName },
      { label: 'Age / sex', value: `${patient.ageLabel || '—'} / ${patient.gender}` },
      { label: 'Mobile', value: maskMobile(patient.mobile) || '—' },
      { label: 'City', value: patient.city || '—' },
    ]),
    { kind: 'spacer', mm: 6 },
    { kind: 'paragraph', text: 'Clinical notes and orders are recorded on the visit screen.' },
  ];
  return { size: 'A4', letterhead: head, blocks };
}

export function stickerDoc(patient: PatientDto, head: PrintDoc['letterhead']): PrintDoc {
  return {
    size: 'label_50x25',
    letterhead: head,
    blocks: [
      { kind: 'heading', text: patient.fullName.slice(0, 40) },
      { kind: 'barcode', value: patient.uhid },
      { kind: 'paragraph', text: `${patient.uhid} · ${patient.ageLabel || '—'} ${patient.gender.slice(0, 1).toUpperCase()}` },
    ],
  };
}

export function photoIdDoc(patient: PatientDto, head: PrintDoc['letterhead']): PrintDoc {
  const issued = ddMmYyyyIst();
  return {
    size: 'A5',
    letterhead: head,
    blocks: [
      { kind: 'heading', text: 'Patient photo ID' },
      kv([
        { label: 'UHID', value: patient.uhid },
        { label: 'Name', value: patient.fullName },
        { label: 'Age / sex', value: `${patient.ageLabel || ageLabel(patient.dob)} / ${patient.gender}` },
        { label: 'Issued', value: issued },
      ]),
      { kind: 'barcode', value: patient.uhid },
    ],
  };
}

export function barcodeDoc(patient: PatientDto, head: PrintDoc['letterhead']): PrintDoc {
  return {
    size: 'label_50x25',
    letterhead: head,
    blocks: [
      { kind: 'barcode', value: patient.uhid },
      { kind: 'paragraph', text: patient.uhid },
    ],
  };
}
