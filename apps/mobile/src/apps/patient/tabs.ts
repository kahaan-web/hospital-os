import { ANDROID_FEATURES } from '@hos/shared';
import type { RoleAppConfig } from '../types';

export const patientApp: RoleAppConfig = {
  id: 'patient',
  androidCode: 'A3',
  title: 'Patient portal',
  ready: true,
  tabs: [
    { name: 'appointments', title: 'Appointments', icon: 'CalendarDays' },
    { name: 'visits', title: 'Visits', icon: 'Stethoscope' },
    { name: 'bills', title: 'Bills', icon: 'Receipt' },
    { name: 'profile', title: 'Profile', icon: 'User' },
    { name: 'feedback', title: 'Feedback', icon: 'MessageSquare' },
  ],
  features: [...(ANDROID_FEATURES['android-patient-portal'] ?? [])],
};
