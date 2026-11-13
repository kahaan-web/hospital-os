'use client';

import { useParams } from 'next/navigation';
import { OtSubNav } from '@/features/clinical/ot/OtSubNav';
import { RequestForm } from '@/features/clinical/ot/RequestForm';

export default function EditOtRequestPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';
  return (
    <>
      <OtSubNav />
      <RequestForm mode="edit" requestId={id} />
    </>
  );
}
