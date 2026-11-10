'use client';

import type { LocationDto, ModuleStateDto } from '@hos/shared';
import { SidebarLayout, type ShellNavItem } from '@hos/ui';
import {
  ClipboardList,
  LayoutDashboard,
  Package,
  Settings,
  Shield,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { DensityToggle } from './DensityToggle';
import { LocationSwitcher } from './LocationSwitcher';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';

export interface TenantShellProps {
  modules: ModuleStateDto[];
  locations?: LocationDto[];
  currentLocationId?: string | null;
  onLocationChange?: (locationId: string) => void;
  userName?: string;
  userEmail?: string;
  tenantDisplayName?: string;
  activePath?: string;
  onNavigate?: (href: string) => void;
  onModuleUpgrade?: (module: ModuleStateDto) => void;
  onSignOut?: () => void;
  children: ReactNode;
}

function moduleIcon(key: string) {
  const size = 18;
  if (key.includes('billing')) return <Package size={size} aria-hidden />;
  return <Package size={size} aria-hidden />;
}

export function TenantShell({
  modules,
  locations = [],
  currentLocationId,
  onLocationChange,
  userName = 'Staff user',
  userEmail,
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
      label: 'Dashboard',
      href: '/app',
      icon: <LayoutDashboard size={18} aria-hidden />,
      active: activePath === '/app',
      onClick: onNavigate ? () => onNavigate('/app') : undefined,
    },
    {
      id: 'modules',
      label: 'Modules',
      href: '/app/modules',
      icon: <Package size={18} aria-hidden />,
      active: activePath === '/app/modules',
      onClick: onNavigate ? () => onNavigate('/app/modules') : undefined,
    },
  ];

  const moduleNav: ShellNavItem[] = modules.map((mod) => {
    const locked = mod.access === 'locked' || mod.access === 'coming_soon';
    const href = locked ? `/app/modules/${mod.key}` : `/app/m/${mod.key}`;
    return {
      id: mod.id,
      label: mod.name,
      href,
      icon: moduleIcon(mod.key),
      locked,
      active: activePath === href,
      onClick: () => {
        if (locked) {
          onModuleUpgrade?.(mod);
        }
        onNavigate?.(href);
      },
    };
  });

  const settingsNav: ShellNavItem[] = [
    {
      id: 'billing',
      label: 'Billing',
      href: '/app/settings/billing',
      icon: <ClipboardList size={18} aria-hidden />,
      active: activePath === '/app/settings/billing',
      onClick: onNavigate ? () => onNavigate('/app/settings/billing') : undefined,
    },
    {
      id: 'users',
      label: 'Users',
      href: '/app/settings/users',
      icon: <Settings size={18} aria-hidden />,
      active: activePath === '/app/settings/users',
      onClick: onNavigate ? () => onNavigate('/app/settings/users') : undefined,
    },
    {
      id: 'privacy',
      label: 'Privacy',
      href: '/app/settings/privacy',
      icon: <Shield size={18} aria-hidden />,
      active: activePath === '/app/settings/privacy',
      onClick: onNavigate ? () => onNavigate('/app/settings/privacy') : undefined,
    },
  ];

  return (
    <SidebarLayout
      brand={tenantDisplayName}
      navItems={[...coreNav, ...moduleNav, ...settingsNav]}
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
