import { ANDROID_FEATURES } from '@hos/shared';
import { copy } from '../../copy';
import type { RoleAppConfig } from '../types';

export const doctorApp: RoleAppConfig = {
  id: 'doctor',
  androidCode: 'A4',
  title: 'Doctor’s medical portal',
  ready: true,
  tabs: [
    { name: 'diary', title: copy.diaryTab, icon: 'CalendarClock' },
    { name: 'orders', title: copy.orders, icon: 'ClipboardPlus' },
    { name: 'account', title: copy.account, icon: 'User' },
  ],
  features: [...(ANDROID_FEATURES['android-doctor-portal'] ?? [])],
};
