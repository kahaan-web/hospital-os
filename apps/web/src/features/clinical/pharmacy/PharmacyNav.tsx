'use client';

import { PHARMACY_GST_NOTE } from '@hos/shared';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/app/pharmacy', label: 'Queue' },
  { href: '/app/pharmacy/sales/new', label: 'Counter sale' },
  { href: '/app/pharmacy/ip-issues', label: 'IP issues' },
  { href: '/app/pharmacy/grn', label: 'Goods receipt' },
  { href: '/app/pharmacy/stock', label: 'Stock' },
  { href: '/app/pharmacy/items', label: 'Items' },
  { href: '/app/pharmacy/reports', label: 'Reports' },
];

export function PharmacyNav() {
  const path = usePathname();
  return (
    <nav aria-label="Pharmacy" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem 1rem', marginBottom: '1rem' }}>
      {LINKS.map((link) => {
        const current = link.href === '/app/pharmacy' ? path === link.href : path === link.href || path.startsWith(`${link.href}/`);
        return (
          <Link key={link.href} href={link.href} className="hos-link" aria-current={current ? 'page' : undefined} style={{ fontWeight: current ? 600 : 400 }}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function GstNote() {
  return <p style={{ color: 'var(--hos-fg-muted)', fontSize: 'var(--hos-text-sm)', marginTop: '0.75rem' }}>{PHARMACY_GST_NOTE}</p>;
}
