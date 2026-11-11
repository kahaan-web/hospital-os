'use client';

import { PageHeader } from '@hos/ui';

export default function IpBillingReportsPage() {
  return (
    <PageHeader
      title="IP billing reports"
      description="Bill register, revenue, cash summary and outstanding are available from the API under /tenant/m/ip-billing/reports."
    />
  );
}
