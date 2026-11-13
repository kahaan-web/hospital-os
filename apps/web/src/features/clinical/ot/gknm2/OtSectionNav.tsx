'use client';

import Link from 'next/link';

const LINKS = [
  { href: '/app/ot', label: 'OT home' },
  { href: '/app/ot/schedule', label: 'Schedule' },
  { href: '/app/ot/list-status', label: 'List status' },
  { href: '/app/ot/reports', label: 'Reports' },
  { href: '/app/ot/masters', label: 'Masters' },
] as const;

export function OtSectionNav({ current }: { current?: string }) {
  return (
    <nav className="mb-4 flex flex-wrap gap-2 text-sm" aria-label="OT scheduling sections">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={current === link.href ? 'hos-btn hos-btn--sm hos-btn--primary' : 'hos-btn hos-btn--sm hos-btn--secondary'}
          aria-current={current === link.href ? 'page' : undefined}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
