import Link from 'next/link';
import { Button, Card, CardBody, CardHeader } from '@hos/ui';

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--hos-page-pad)',
        background:
          'radial-gradient(ellipse at top, color-mix(in srgb, var(--hos-brand-500) 12%, transparent), transparent 55%)',
      }}
    >
      <Card style={{ maxWidth: '28rem', width: '100%' }}>
        <CardHeader
          title="Hospital OS"
          description="Calm, modern HMIS for Indian nursing homes and clinics. Phase A scaffolding is live."
        />
        <CardBody style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hos-space-3)' }}>
          <Button asChild style={{ width: '100%' }}>
            <Link href="/design">View design system</Link>
          </Button>
          <p style={{ margin: 0, fontSize: 'var(--hos-text-sm)', color: 'var(--hos-fg-muted)', textAlign: 'center' }}>
            Setup wizard and tenant app are wired by the admin-wizard worker.
          </p>
        </CardBody>
      </Card>
    </main>
  );
}
