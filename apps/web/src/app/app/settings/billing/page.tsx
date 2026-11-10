import { Suspense } from 'react';
import { PageLoading } from '@/features/common/LoadState';
import { BillingSettingsContent } from './BillingSettingsContent';

export default function BillingSettingsPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading billing…" />}>
      <BillingSettingsContent />
    </Suspense>
  );
}
