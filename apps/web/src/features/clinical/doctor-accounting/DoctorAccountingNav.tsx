import Link from 'next/link';

const links = [
  { href: '/app/doctor-accounting', label: 'Share rules' },
  { href: '/app/doctor-accounting/payouts', label: 'Payout statement' },
];

export function DoctorAccountingNav() {
  return (
    <nav aria-label="Doctors accounting" className="mb-4 flex gap-4 text-sm">
      {links.map((link) => (
        <Link key={link.href} href={link.href} className="hos-link">
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
