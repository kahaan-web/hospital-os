import Link from 'next/link';

const links = [
  { href: '/app/insurance', label: 'Pre-auth and claims' },
  { href: '/app/insurance/new', label: 'New request' },
  { href: '/app/insurance/payers', label: 'Payers' },
];

export function InsuranceNav() {
  return (
    <nav aria-label="Insurance" className="mb-4 flex gap-4 text-sm">
      {links.map((link) => (
        <Link key={link.href} href={link.href} className="hos-link">
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
