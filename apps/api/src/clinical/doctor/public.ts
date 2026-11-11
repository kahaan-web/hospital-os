import type { PatientAlertDto } from '@hos/shared';
import { ApiError } from '../../http';

const PENICILLIN_DRUGS = new Set(['AMOXICILLIN', 'AMOXICILLIN_CLAV']);

/** Blocks amoxicillin-class medicines when an active penicillin allergy is on file. */
export function assertPrescriptionAllergyClear(
  alerts: PatientAlertDto[],
  genericCodes: string[],
  overrideReason?: string,
): void {
  const penicillinAllergy = alerts.some(
    (a) => a.kind === 'allergy' && !a.inactiveAt && /penicillin/i.test(a.text),
  );
  if (!penicillinAllergy) return;
  const conflict = genericCodes.some((code) => PENICILLIN_DRUGS.has(code.toUpperCase()));
  if (!conflict) return;
  if (overrideReason?.trim()) return;
  throw new ApiError(422, 'allergy_conflict', 'Penicillin allergy on file — add an override reason to prescribe amoxicillin');
}
