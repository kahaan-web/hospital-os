import { ANDROID_FEATURES } from '@hos/shared';
import type { RoleAppConfig } from '../types';

export const nurseApp: RoleAppConfig = {
  id: 'nurse',
  androidCode: 'A5',
  title: 'Nurses workbench',
  ready: false,
  tabs: [{ name: 'index', title: 'Workbench', icon: 'HeartPulse' }],
  features: [...(ANDROID_FEATURES['android-nurses-workbench'] ?? [])],
};
