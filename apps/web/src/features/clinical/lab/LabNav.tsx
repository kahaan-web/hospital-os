import Link from 'next/link';

const links = [
  { href: '/app/lab', label: 'Worklist' },
  { href: '/app/lab/tests', label: 'Test master' },
  { href: '/app/lab/reports', label: 'Reports' },
  { href: '/app/lab/tat', label: 'TAT & critical' },
];

export function LabNav() {
  return (
    <nav aria-label="Laboratory" className="mb-4 flex gap-4 text-sm">
      {links.map((link) => (
        <Link key={link.href} href={link.href} className="hos-link">
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
