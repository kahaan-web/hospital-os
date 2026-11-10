'use client';

import { PageHeader } from '@hos/ui';
import { MatrixEditor } from '@/features/admin/MatrixEditor';

export default function AdminMatrixPage() {
  return (
    <>
      <PageHeader
        title="Plan × module matrix"
        description="Toggle which features each tier includes. Bulk actions per module; save sends PATCH /admin/matrix."
      />
      <MatrixEditor />
    </>
  );
}
