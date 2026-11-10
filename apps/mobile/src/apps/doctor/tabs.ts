import { ANDROID_FEATURES } from '@hos/shared';
import type { RoleAppConfig } from '../types';

export const doctorApp: RoleAppConfig = {
  id: 'doctor',
  androidCode: 'A4',
  title: 'Doctor’s medical portal',
  ready: true,
  tabs: [
    { name: 'diary', title: 'Diary', icon: 'CalendarClock' },
    { name: 'orders', title: 'Orders', icon: 'ClipboardPlus' },
    { name: 'account', title: 'Account', icon: 'User' },
  ],
  features: [...(ANDROID_FEATURES['android-doctor-portal'] ?? [])],
};
