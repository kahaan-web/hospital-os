'use client';

import type { AuditEntryDto, AuditVerifyDto } from '@hos/shared';
import { Badge, Button, DataTable, PageHeader } from '@hos/ui';
import { useCallback, useEffect, useState } from 'react';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { listItems, type Paged } from '@/lib/lists';
import { apiGet } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

export default function AdminAuditPage() {
  const [rows, setRows] = useState<AuditEntryDto[]>([]);
  const [verify, setVerify] = useState<AuditVerifyDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiGet<AuditEntryDto[] | Paged<AuditEntryDto>>('/admin/audit'),
      apiGet<AuditVerifyDto>('/admin/audit/verify').catch(() => null),
    ])
      .then(([audit, v]) => {
        setRows(listItems(audit));
        setVerify(v);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <PageLoading />;
  if (error) return <PageError error={error} onRetry={load} />;

  return (
    <>
      <PageHeader
        title="Platform audit"
        description="Catalogue, pricing, and cross-tenant admin actions."
        actions={
          verify ? (
            <Badge tone={verify.ok ? 'success' : 'error'}>{verify.ok ? 'Platform chain OK' : 'Chain broken'}</Badge>
          ) : (
            <Button type="button" variant="secondary" onClick={load}>
              Refresh
            </Button>
          )
        }
      />
      <DataTable
        data={rows}
        getRowId={(r) => r.id}
        pageSize={25}
        columns={[
          { id: 'seq', header: 'Seq', accessor: (r) => r.seq },
          { id: 'when', header: 'When', accessor: (r) => formatDateTime(r.createdAt) },
          { id: 'actor', header: 'Actor', accessor: (r) => r.actorLabel },
          { id: 'action', header: 'Action', accessor: (r) => r.action },
          { id: 'tenant', header: 'Tenant', accessor: (r) => r.tenantId ?? 'platform' },
        ]}
      />
    </>
  );
}
