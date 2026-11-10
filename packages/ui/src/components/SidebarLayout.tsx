import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface ShellNavItem {
  id: string;
  label: ReactNode;
  href?: string;
  icon?: ReactNode;
  active?: boolean;
  locked?: boolean;
  onClick?: () => void;
}

export interface SidebarLayoutProps {
  brand?: ReactNode;
  navItems: ShellNavItem[];
  topbarStart?: ReactNode;
  topbarEnd?: ReactNode;
  locationSwitcher?: ReactNode;
  userMenu?: ReactNode;
  children: ReactNode;
  className?: string;
}

function NavItem({ item }: { item: ShellNavItem }) {
  const className = cn(
    'hos-shell__nav-item hos-focus-visible',
    item.active && 'hos-shell__nav-item--active',
    item.locked && 'hos-shell__nav-item--locked',
  );

  if (item.href) {
    return (
      <a
        href={item.href}
        className={className}
        onClick={item.onClick}
        aria-current={item.active ? 'page' : undefined}
        aria-disabled={item.locked || undefined}
      >
        {item.icon}
        <span style={{ flex: 1 }}>{item.label}</span>
        {item.locked ? <span style={{ fontSize: 'var(--hos-text-xs)' }} aria-hidden>🔒</span> : null}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={item.onClick}
      aria-current={item.active ? 'page' : undefined}
      disabled={item.locked}
    >
      {item.icon}
      <span style={{ flex: 1 }}>{item.label}</span>
      {item.locked ? <span style={{ fontSize: 'var(--hos-text-xs)' }} aria-hidden>🔒</span> : null}
    </button>
  );
}

export function SidebarLayout({
  brand,
  navItems,
  topbarStart,
  topbarEnd,
  locationSwitcher,
  userMenu,
  children,
  className,
}: SidebarLayoutProps) {
  return (
    <div className={cn('hos-shell', className)}>
      <aside className="hos-shell__sidebar" aria-label="Main navigation">
        {brand ? <div className="hos-shell__brand">{brand}</div> : null}
        <nav className="hos-shell__nav">
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hos-space-1)' }}>
            {navItems.map((item) => (
              <li key={item.id}>
                <NavItem item={item} />
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <div className="hos-shell__main">
        <header className="hos-shell__topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--hos-space-4)' }}>
            {topbarStart}
            {locationSwitcher}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--hos-space-3)' }}>
            {topbarEnd}
            {userMenu}
          </div>
        </header>
        <main className="hos-shell__content">{children}</main>
      </div>
    </div>
  );
}
