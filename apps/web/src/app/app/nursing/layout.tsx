import Link from 'next/link';
import type { ReactNode } from 'react';

const LINKS = [
  { href: '/app/nursing', label: 'Ward census' },
  { href: '/app/nursing/handover', label: 'Shift handover' },
  { href: '/app/nursing/diet', label: 'Diet list' },
];

export default function NursingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <nav
        aria-label="Nurse station"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--hos-space-4)', marginBottom: 'var(--hos-space-4)', borderBottom: '1px solid var(--hos-border-default)', paddingBottom: 'var(--hos-space-2)' }}
      >
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="hos-link">
            {link.label}
          </Link>
        ))}
      </nav>
      {children}
    </>
  );
}
