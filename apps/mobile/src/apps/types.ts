import type { ComponentType } from 'react';
import type { MobileRole } from '@hos/shared';

export type TabIconName =
  | 'CalendarDays'
  | 'Stethoscope'
  | 'Receipt'
  | 'User'
  | 'MessageSquare'
  | 'CalendarClock'
  | 'ClipboardPlus'
  | 'LayoutDashboard'
  | 'Wrench'
  | 'Users'
  | 'Hammer'
  | 'HeartPulse';

export interface AppTab {
  name: string;
  title: string;
  icon: TabIconName;
}

export interface RoleAppConfig {
  id: MobileRole;
  androidCode: 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6' | 'A7';
  title: string;
  ready: boolean;
  tabs: AppTab[];
  features: { name: string; sourceName: string }[];
}

export type IconMap = Record<TabIconName, ComponentType<{ size?: number; color?: string; strokeWidth?: number }>>;
