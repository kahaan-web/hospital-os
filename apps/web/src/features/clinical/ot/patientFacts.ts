import type { PatientDto } from '@hos/shared';
import { clinicalApi } from '@/features/clinical/common/clinicalApi';
import { otSchedulingApi, type OtFutureItem, type OtPatientContext } from './api';

export interface PatientOtFacts {
  context: OtPatientContext | null;
  patient: PatientDto | null;
  future: OtFutureItem[];
  futureError: string;
  contextError: string;
}

export async function loadPatientOtFacts(patientId: string): Promise<PatientOtFacts> {
  const [contextResult, patientResult, futureResult] = await Promise.allSettled([
    otSchedulingApi.patientContext(patientId),
    clinicalApi.patient(patientId),
    otSchedulingApi.future(patientId),
  ]);
  return {
    context: contextResult.status === 'fulfilled' ? contextResult.value : null,
    patient: patientResult.status === 'fulfilled' ? patientResult.value : null,
    future: futureResult.status === 'fulfilled' ? futureResult.value : [],
    futureError: futureResult.status === 'rejected' ? 'Future OT list could not be loaded.' : '',
    contextError: contextResult.status === 'rejected' ? 'Ward and bed could not be loaded.' : '',
  };
}
