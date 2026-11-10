'use client';

import { createTranslator } from '@hos/shared';
import { SidebarLayout, type ShellNavItem } from '@hos/ui';
import {
  Building2,
  Grid3x3,
  LayoutDashboard,
  Layers,
  Package,
  ScrollText,
  Settings,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { isNavActive } from '@/lib/navActive';
import { DensityToggle } from './DensityToggle';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';

const t = createTranslator('en');

export interface AdminShellProps {
  adminName?: string;
  adminEmail?: string;
  activePath?: string;
  onNavigate?: (href: string) => void;
  onSignOut?: () => void;
  children: ReactNode;
}

const ADMIN_ROUTES: { id: string; label: string; href: string; icon: ReactNode }[] = [
  { id: 'overview', label: t('admin.overview'), href: '/admin', icon: <LayoutDashboard size={18} aria-hidden strokeWidth={1.5} /> },
  { id: 'plans', label: t('admin.plans'), href: '/admin/plans', icon: <Layers size={18} aria-hidden strokeWidth={1.5} /> },
  { id: 'matrix', label: t('admin.matrix'), href: '/admin/matrix', icon: <Grid3x3 size={18} aria-hidden strokeWidth={1.5} /> },
  { id: 'modules', label: t('admin.modules'), href: '/admin/modules', icon: <Package size={18} aria-hidden strokeWidth={1.5} /> },
  { id: 'tenants', label: t('admin.tenants'), href: '/admin/tenants', icon: <Users size={18} aria-hidden strokeWidth={1.5} /> },
  { id: 'settings', label: t('admin.settings'), href: '/admin/settings', icon: <Settings size={18} aria-hidden strokeWidth={1.5} /> },
  { id: 'audit', label: t('admin.audit'), href: '/admin/audit', icon: <ScrollText size={18} aria-hidden strokeWidth={1.5} /> },
];

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
    active: isNavActive(activePath, route.href),
    onClick: onNavigate ? () => onNavigate(route.href) : undefined,
  }));

  return (
    <SidebarLayout
      brand={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--hos-space-2)' }}>
          <Building2 size={20} aria-hidden strokeWidth={1.5} />
          Hospital OS · {t('admin.title')}
        </span>
      }
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
