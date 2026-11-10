import { ANDROID_FEATURES } from '@hos/shared';
import type { RoleAppConfig } from '../types';

export const misApp: RoleAppConfig = {
  id: 'mis',
  androidCode: 'A1',
  title: 'MIS / Dashboard',
  ready: false,
  tabs: [{ name: 'index', title: 'MIS', icon: 'LayoutDashboard' }],
  features: [...(ANDROID_FEATURES['android-mis'] ?? [])],
};
