'use client';

import { OtSubNav } from '@/features/clinical/ot/OtSubNav';
import { RequestForm } from '@/features/clinical/ot/RequestForm';

export default function NewOtRequestPage() {
  return (
    <>
      <OtSubNav />
      <RequestForm mode="new" />
    </>
  );
}
