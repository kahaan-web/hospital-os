'use client';

import { useParams } from 'next/navigation';
import { PostOpScreen } from '@/features/clinical/ot/gknm2/PostOpScreen';

export default function PostOpPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';
  if (!id) return null;
  return <PostOpScreen bookingId={id} />;
}
