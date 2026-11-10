import type { Me, MobileRole } from '@hos/shared';
import { mobileAppForRole } from '@hos/shared';
import { doctorApp } from './doctor/tabs';
import { equipmentApp } from './equipment/tabs';
import { hrApp } from './hr/tabs';
import { maintenanceApp } from './maintenance/tabs';
import { misApp } from './mis/tabs';
import { nurseApp } from './nurse/tabs';
import { patientApp } from './patient/tabs';
import type { RoleAppConfig } from './types';

export const roleApps: Record<MobileRole, RoleAppConfig> = {
  patient: patientApp,
  doctor: doctorApp,
  nurse: nurseApp,
  mis: misApp,
  equipment: equipmentApp,
  hr: hrApp,
  maintenance: maintenanceApp,
};

export function appForMe(me: Me): RoleAppConfig | null {
  if (me.kind !== 'tenant') return null;
  for (const role of me.roles) {
    const id = mobileAppForRole(role.roleKey);
    if (id) return roleApps[id];
  }
  return null;
}

export function hrefForMe(me: Me): string {
  if (me.kind === 'platform') return '/coming-soon';
  const app = appForMe(me);
  switch (app?.id) {
    case 'patient':
      return '/patient/appointments';
    case 'doctor':
      return '/doctor/diary';
    case 'nurse':
      return '/nurse';
    case 'mis':
      return '/mis';
    case 'equipment':
      return '/equipment';
    case 'hr':
      return '/hr';
    case 'maintenance':
      return '/maintenance';
    default:
      return '/coming-soon';
  }
}

export type { RoleAppConfig, AppTab, TabIconName } from './types';
