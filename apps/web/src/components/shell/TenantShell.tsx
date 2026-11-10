'use client';

import type { LocationDto, ModuleStateDto } from '@hos/shared';
import { createTranslator } from '@hos/shared';
import { SidebarLayout, type ShellNavItem } from '@hos/ui';
import {
  ClipboardList,
  LayoutDashboard,
  Package,
  ScrollText,
  Settings,
  Shield,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { clinicalNavItems } from '@/features/clinical/nav';
import { isNavActive } from '@/lib/navActive';
import { moduleLucideIcon } from '@/lib/moduleLucideIcon';
import { DensityToggle } from './DensityToggle';
import { LocationSwitcher } from './LocationSwitcher';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';

const t = createTranslator('en');

export interface TenantShellProps {
  modules: ModuleStateDto[];
  locations?: LocationDto[];
  currentLocationId?: string | null;
  onLocationChange?: (locationId: string) => void;
  userName?: string;
  userEmail?: string;
  permissions?: readonly string[];
  tenantDisplayName?: string;
  activePath?: string;
  onNavigate?: (href: string) => void;
  onModuleUpgrade?: (module: ModuleStateDto) => void;
  onSignOut?: () => void;
  children: ReactNode;
}

export function TenantShell({
  modules,
  locations = [],
  currentLocationId,
  onLocationChange,
  userName = 'Staff user',
  userEmail,
  permissions,
  tenantDisplayName = 'Hospital OS',
  activePath,
  onNavigate,
  onModuleUpgrade,
  onSignOut,
  children,
}: TenantShellProps) {
  const coreNav: ShellNavItem[] = [
    {
      id: 'dashboard',
      label: t('nav.dashboard'),
      href: '/app',
      icon: <LayoutDashboard size={18} aria-hidden strokeWidth={1.5} />,
      active: isNavActive(activePath, '/app'),
      onClick: onNavigate ? () => onNavigate('/app') : undefined,
    },
    {
      id: 'modules',
      label: t('nav.modules'),
      href: '/app/modules',
      icon: <Package size={18} aria-hidden strokeWidth={1.5} />,
      active: isNavActive(activePath, '/app/modules'),
      onClick: onNavigate ? () => onNavigate('/app/modules') : undefined,
    },
  ];

  const visibleModules = modules.filter((mod) => mod.access !== 'hidden');

  const moduleNav: ShellNavItem[] = visibleModules.map((mod) => {
    const locked = mod.access === 'locked' || mod.access === 'coming_soon';
    const href = `/app/modules/${mod.key}`;
    return {
      id: mod.id,
      label: mod.name,
      href,
      icon: moduleLucideIcon(mod.icon),
      locked,
      active: isNavActive(activePath, href),
      onClick: () => {
        if (locked) {
          onModuleUpgrade?.(mod);
        }
        onNavigate?.(href);
      },
    };
  });

  const clinicalNav = clinicalNavItems({ modules, permissions, activePath, onNavigate });

  const settingsNav: ShellNavItem[] = [
    {
      id: 'billing',
      label: t('nav.billing'),
      href: '/app/settings/billing',
      icon: <ClipboardList size={18} aria-hidden strokeWidth={1.5} />,
      active: isNavActive(activePath, '/app/settings/billing'),
      onClick: onNavigate ? () => onNavigate('/app/settings/billing') : undefined,
    },
    {
      id: 'users',
      label: t('nav.users'),
      href: '/app/settings/users',
      icon: <Settings size={18} aria-hidden strokeWidth={1.5} />,
      active: isNavActive(activePath, '/app/settings/users'),
      onClick: onNavigate ? () => onNavigate('/app/settings/users') : undefined,
    },
    {
      id: 'privacy',
      label: t('nav.privacy'),
      href: '/app/settings/privacy',
      icon: <Shield size={18} aria-hidden strokeWidth={1.5} />,
      active: isNavActive(activePath, '/app/settings/privacy'),
      onClick: onNavigate ? () => onNavigate('/app/settings/privacy') : undefined,
    },
    {
      id: 'audit',
      label: t('nav.audit'),
      href: '/app/settings/audit',
      icon: <ScrollText size={18} aria-hidden strokeWidth={1.5} />,
      active: isNavActive(activePath, '/app/settings/audit'),
      onClick: onNavigate ? () => onNavigate('/app/settings/audit') : undefined,
    },
  ];

  return (
    <SidebarLayout
      brand={tenantDisplayName}
      navItems={[...coreNav, ...clinicalNav, ...moduleNav, ...settingsNav]}
      locationSwitcher={
        locations.length > 0 ? (
          <LocationSwitcher
            locations={locations}
            value={currentLocationId}
            onChange={onLocationChange}
          />
        ) : undefined
      }
      topbarEnd={
        <>
          <DensityToggle />
          <ThemeToggle />
        </>
      }
      userMenu={
        <UserMenu name={userName} email={userEmail} onSignOut={onSignOut} />
      }
    >
      {children}
    </SidebarLayout>
  );
}
