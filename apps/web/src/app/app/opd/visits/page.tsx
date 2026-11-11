'use client';

import { Suspense } from 'react';
import { PageLoading } from '@/features/common/LoadState';
import { VisitScreen } from '@/features/clinical/appointments/VisitScreen';

export default function OpdVisitsPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <VisitScreen />
    </Suspense>
  );
}
