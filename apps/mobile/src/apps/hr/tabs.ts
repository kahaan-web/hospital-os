import { ANDROID_FEATURES } from '@hos/shared';
import type { RoleAppConfig } from '../types';

export const hrApp: RoleAppConfig = {
  id: 'hr',
  androidCode: 'A6',
  title: 'HR & Payroll',
  ready: false,
  tabs: [{ name: 'index', title: 'HR', icon: 'Users' }],
  features: [...(ANDROID_FEATURES['android-hr-payroll'] ?? [])],
};
