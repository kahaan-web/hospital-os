'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS: { href: string; label: string; match: (path: string) => boolean }[] = [
  { href: '/app/ot', label: 'Dashboard', match: (path) => path === '/app/ot' || path.startsWith('/app/ot/requests') || path === '/app/ot/new' },
  { href: '/app/ot/book', label: 'Booking', match: (path) => path === '/app/ot/book' },
  { href: '/app/ot/schedule', label: 'Schedule', match: (path) => path.startsWith('/app/ot/schedule') },
  { href: '/app/ot/list-status', label: 'OT list', match: (path) => path.startsWith('/app/ot/list-status') },
  { href: '/app/ot/reports', label: 'Reports', match: (path) => path.startsWith('/app/ot/reports') },
  { href: '/app/ot/masters', label: 'Masters', match: (path) => path.startsWith('/app/ot/masters') },
];

export function OtSubNav() {
  const path = usePathname() ?? '';
  return (
    <nav aria-label="OT scheduling" className="ot-no-print" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--hos-space-2)', marginBottom: 'var(--hos-space-4)' }}>
      {LINKS.map((link) => {
        const on = link.match(path);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={on ? 'page' : undefined}
            style={{
              padding: '6px 10px',
              borderRadius: 'var(--hos-radius-md)',
              textDecoration: 'none',
              fontSize: 'var(--hos-text-sm)',
              fontWeight: 500,
              color: on ? 'var(--hos-fg-inverse)' : 'var(--hos-fg-brand)',
              background: on ? 'var(--hos-brand-600)' : 'transparent',
              border: '1px solid var(--hos-border-default)',
            }}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
