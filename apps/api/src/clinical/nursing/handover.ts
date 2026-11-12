import type { Tx } from '@hos/db';
import { istDateKey, type ClinicalCtx, type VitalSignsDto } from '@hos/shared';
import { dietOrders, marForEncounter, vitalsChart, wardPatients } from './service';

export interface HandoverPatient {
  encounterId: string;
  uhid: string;
  fullName: string;
  ageLabel: string;
  gender: string;
  wardCode: string | null;
  bedLabel: string | null;
  doctorName: string | null;
  latestVitals: Pick<VitalSignsDto, 'recordedAt' | 'bpSystolic' | 'bpDiastolic' | 'pulse' | 'spo2' | 'tempC' | 'respRate'> | null;
  dosesDue: number;
  dosesGiven: number;
  dosesOther: number;
  diet: string | null;
}

export interface HandoverSheet {
  generatedAt: string;
  date: string;
  patients: HandoverPatient[];
}

/** Read-only shift handover sheet: one row per in-patient, built from the live ward, vitals, MAR and diet data. */
export async function handoverSheet(ctx: ClinicalCtx<Tx>, q: { wardCode?: string }): Promise<HandoverSheet> {
  const date = istDateKey(new Date());
  const ward = await wardPatients(ctx, q);
  const diets = await dietOrders(ctx, q);
  const patients: HandoverPatient[] = [];
  for (const p of ward) {
    const vitals = await vitalsChart(ctx, p.encounterId);
    const last = vitals[vitals.length - 1];
    const mar = await marForEncounter(ctx, p.encounterId, date);
    patients.push({
      encounterId: p.encounterId,
      uhid: p.uhid,
      fullName: p.fullName,
      ageLabel: p.ageLabel,
      gender: p.gender,
      wardCode: p.wardCode,
      bedLabel: p.bedLabel,
      doctorName: p.doctorName,
      latestVitals: last
        ? {
            recordedAt: last.recordedAt,
            bpSystolic: last.bpSystolic,
            bpDiastolic: last.bpDiastolic,
            pulse: last.pulse,
            spo2: last.spo2,
            tempC: last.tempC,
            respRate: last.respRate,
          }
        : null,
      dosesDue: mar.filter((d) => d.status === 'due').length,
      dosesGiven: mar.filter((d) => d.status === 'given' || d.status === 'self').length,
      dosesOther: mar.filter((d) => d.status === 'held' || d.status === 'refused' || d.status === 'missed').length,
      diet: diets.find((d) => d.encounterId === p.encounterId)?.dietCode ?? null,
    });
  }
  return { generatedAt: new Date().toISOString(), date, patients };
}
