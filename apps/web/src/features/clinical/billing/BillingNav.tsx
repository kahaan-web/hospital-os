'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/app/billing', label: 'Desk' },
  { href: '/app/billing/deposits', label: 'Deposits' },
  { href: '/app/billing/refunds', label: 'Refunds' },
  { href: '/app/billing/services', label: 'Services' },
  { href: '/app/billing/summary', label: 'Summary' },
  { href: '/app/billing/reports', label: 'Reports' },
];

export function BillingNav() {
  const path = usePathname();
  return (
    <nav aria-label="OP billing" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--hos-space-4)', marginBottom: 'var(--hos-space-4)', borderBottom: '1px solid var(--hos-border-default)', paddingBottom: 'var(--hos-space-2)' }}>
      {LINKS.map((link) => {
        const current = link.href === '/app/billing' ? path === '/app/billing' : path.startsWith(link.href);
        return (
          <Link key={link.href} href={link.href} className="hos-link" aria-current={current ? 'page' : undefined} style={{ fontWeight: current ? 600 : 400 }}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
