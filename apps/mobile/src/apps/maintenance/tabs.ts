import { ANDROID_FEATURES } from '@hos/shared';
import type { RoleAppConfig } from '../types';

export const maintenanceApp: RoleAppConfig = {
  id: 'maintenance',
  androidCode: 'A7',
  title: 'Maintenance tracker',
  ready: false,
  tabs: [{ name: 'index', title: 'Maintenance', icon: 'Hammer' }],
  features: [...(ANDROID_FEATURES['android-maintenance-tracker'] ?? [])],
};
