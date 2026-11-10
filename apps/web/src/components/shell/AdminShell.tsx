'use client';

import { SidebarLayout, type ShellNavItem } from '@hos/ui';
import {
  Building2,
  Grid3x3,
  LayoutDashboard,
  Layers,
  ScrollText,
  Settings,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { DensityToggle } from './DensityToggle';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';

export interface AdminShellProps {
  adminName?: string;
  adminEmail?: string;
  activePath?: string;
  onNavigate?: (href: string) => void;
  onSignOut?: () => void;
  children: ReactNode;
}

const ADMIN_ROUTES: { id: string; label: string; href: string; icon: ReactNode }[] = [
  { id: 'overview', label: 'Overview', href: '/admin', icon: <LayoutDashboard size={18} aria-hidden /> },
  { id: 'plans', label: 'Plans', href: '/admin/plans', icon: <Layers size={18} aria-hidden /> },
  { id: 'matrix', label: 'Feature matrix', href: '/admin/matrix', icon: <Grid3x3 size={18} aria-hidden /> },
  { id: 'modules', label: 'Modules', href: '/admin/modules', icon: <PackageIcon /> },
  { id: 'tenants', label: 'Tenants', href: '/admin/tenants', icon: <Users size={18} aria-hidden /> },
  { id: 'settings', label: 'Settings', href: '/admin/settings', icon: <Settings size={18} aria-hidden /> },
  { id: 'audit', label: 'Audit log', href: '/admin/audit', icon: <ScrollText size={18} aria-hidden /> },
];

function PackageIcon() {
  return <Building2 size={18} aria-hidden />;
}

export function AdminShell({
  adminName = 'App Admin',
  adminEmail,
  activePath,
  onNavigate,
  onSignOut,
  children,
}: AdminShellProps) {
  const navItems: ShellNavItem[] = ADMIN_ROUTES.map((route) => ({
    id: route.id,
    label: route.label,
    href: route.href,
    icon: route.icon,
    active: activePath === route.href,
    onClick: onNavigate ? () => onNavigate(route.href) : undefined,
  }));

  return (
    <SidebarLayout
      brand="Hospital OS · Admin"
      navItems={navItems}
      topbarEnd={
        <>
          <DensityToggle />
          <ThemeToggle />
        </>
      }
      userMenu={<UserMenu name={adminName} email={adminEmail} onSignOut={onSignOut} />}
    >
      {children}
    </SidebarLayout>
  );
}
