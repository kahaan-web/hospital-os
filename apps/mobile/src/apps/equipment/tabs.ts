import { ANDROID_FEATURES } from '@hos/shared';
import type { RoleAppConfig } from '../types';

export const equipmentApp: RoleAppConfig = {
  id: 'equipment',
  androidCode: 'A2',
  title: 'Equipment maintenance',
  ready: false,
  tabs: [{ name: 'index', title: 'Equipment', icon: 'Wrench' }],
  features: [...(ANDROID_FEATURES['android-equipment'] ?? [])],
};
