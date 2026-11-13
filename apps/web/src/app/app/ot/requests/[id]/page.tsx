'use client';

import { useParams } from 'next/navigation';
import { OtSubNav } from '@/features/clinical/ot/OtSubNav';
import { RequestDetail } from '@/features/clinical/ot/RequestDetail';

export default function OtRequestDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';
  return (
    <>
      <OtSubNav />
      <RequestDetail requestId={id} />
    </>
  );
}
