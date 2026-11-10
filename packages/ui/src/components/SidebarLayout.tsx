'use client';

import { Lock, Menu, X } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import { useState } from 'react';
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

export type ShellNavLinkRenderer = (props: {
  href: string;
  className: string;
  children: ReactNode;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  'aria-current'?: 'page';
}) => ReactNode;

export interface SidebarLayoutProps {
  brand?: ReactNode;
  navItems: ShellNavItem[];
  topbarStart?: ReactNode;
  topbarEnd?: ReactNode;
  locationSwitcher?: ReactNode;
  userMenu?: ReactNode;
  children: ReactNode;
  className?: string;
  renderNavLink?: ShellNavLinkRenderer;
}

function NavItem({
  item,
  renderNavLink,
  onNavigate,
}: {
  item: ShellNavItem;
  renderNavLink?: ShellNavLinkRenderer;
  onNavigate?: () => void;
}) {
  const className = cn(
    'hos-shell__nav-item hos-focus-visible',
    item.active && 'hos-shell__nav-item--active',
    item.locked && 'hos-shell__nav-item--locked',
  );

  const onActivate = (event?: MouseEvent<HTMLAnchorElement>) => {
    if (item.onClick) {
      event?.preventDefault();
      item.onClick();
    }
    onNavigate?.();
  };

  const lockedHint = item.locked ? (
    <>
      <Lock size={14} aria-hidden strokeWidth={1.5} />
      <span className="hos-sr-only">Locked; upgrade available</span>
    </>
  ) : null;

  if (item.href) {
    const linkProps = {
      href: item.href,
      className,
      onClick: (event: MouseEvent<HTMLAnchorElement>) => onActivate(event),
      'aria-current': item.active ? ('page' as const) : undefined,
    };
    const body = (
      <>
        {item.icon}
        <span style={{ flex: 1 }}>{item.label}</span>
        {lockedHint}
      </>
    );
    if (renderNavLink) {
      return renderNavLink({ ...linkProps, children: body });
    }
    return <a {...linkProps}>{body}</a>;
  }

  return (
    <button
      type="button"
      className={className}
      onClick={() => onActivate()}
      aria-current={item.active ? 'page' : undefined}
    >
      {item.icon}
      <span style={{ flex: 1 }}>{item.label}</span>
      {lockedHint}
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
  renderNavLink,
}: SidebarLayoutProps) {
  const [navOpen, setNavOpen] = useState(false);

  const closeNav = () => setNavOpen(false);

  return (
    <div className={cn('hos-shell', navOpen && 'hos-shell--nav-open', className)}>
      {navOpen ? (
        <button
          type="button"
          className="hos-shell__sidebar-backdrop"
          aria-label="Close navigation"
          onClick={closeNav}
        />
      ) : null}
      <aside className="hos-shell__sidebar" aria-label="Main navigation">
        {brand ? <div className="hos-shell__brand">{brand}</div> : null}
        <nav className="hos-shell__nav" id="hos-main-nav">
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--hos-space-1)',
            }}
          >
            {navItems.map((item) => (
              <li key={item.id}>
                <NavItem item={item} renderNavLink={renderNavLink} onNavigate={closeNav} />
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <div className="hos-shell__main">
        <header className="hos-shell__topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--hos-space-4)' }}>
            <button
              type="button"
              className="hos-shell__nav-toggle hos-icon-btn hos-icon-btn--md hos-focus-visible"
              aria-expanded={navOpen}
              aria-controls="hos-main-nav"
              onClick={() => setNavOpen((v) => !v)}
            >
              {navOpen ? <X size={20} strokeWidth={1.5} /> : <Menu size={20} strokeWidth={1.5} />}
              <span className="hos-sr-only">{navOpen ? 'Close menu' : 'Open menu'}</span>
            </button>
            {topbarStart}
            {locationSwitcher}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--hos-space-3)' }}>
            {topbarEnd}
            {userMenu}
          </div>
        </header>
        <main className="hos-shell__content" id="hos-main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
