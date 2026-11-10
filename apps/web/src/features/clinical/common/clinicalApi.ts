import type { PageDto, PatientDto, PatientSummaryDto } from '@hos/shared';
import { apiRequest } from '@/lib/api';

export const clinicalApi = {
  searchPatients(q: string, page = 1): Promise<PageDto<PatientSummaryDto>> {
    const query = new URLSearchParams({ q, page: String(page) });
    return apiRequest<PageDto<PatientSummaryDto>>(`/tenant/clinical/patients?${query}`);
  },
  patient(id: string): Promise<PatientDto> {
    return apiRequest<PatientDto>(`/tenant/clinical/patients/${id}`);
  },
};
