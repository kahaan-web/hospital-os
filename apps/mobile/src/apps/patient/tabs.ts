import { ANDROID_FEATURES } from '@hos/shared';
import { copy } from '../../copy';
import type { RoleAppConfig } from '../types';

export const patientApp: RoleAppConfig = {
  id: 'patient',
  androidCode: 'A3',
  title: 'Patient portal',
  ready: true,
  tabs: [
    { name: 'appointments', title: copy.appointments, icon: 'CalendarDays' },
    { name: 'visits', title: copy.visits, icon: 'Stethoscope' },
    { name: 'bills', title: copy.bills, icon: 'Receipt' },
    { name: 'profile', title: copy.profile, icon: 'User' },
    { name: 'feedback', title: copy.feedback, icon: 'MessageSquare' },
  ],
  features: [...(ANDROID_FEATURES['android-patient-portal'] ?? [])],
};
