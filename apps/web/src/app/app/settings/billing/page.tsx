'use client';

import type { ChangeConfigInput, InvoiceListItem, OrderDto, QuoteDto, SubscriptionDto } from '@hos/shared';
import { Button, DataTable, PageHeader, useToast } from '@hos/ui';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { CheckoutModal } from '@/features/billing/CheckoutModal';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { formatINR, isoToDDMMYYYY } from '@/lib/format';
import { listItems, type Paged } from '@/lib/lists';
import { apiGet, apiPost } from '@/lib/api';
import type { TenantMe } from '@hos/shared';
import { fetchMe, isTenantMe } from '@/lib/auth';

export default function BillingSettingsPage() {
  const params = useSearchParams();
  const moduleHint = params.get('module');
  const toast = useToast();
  const [me, setMe] = useState<TenantMe | null>(null);
  const [sub, setSub] = useState<SubscriptionDto | null>(null);
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [quote, setQuote] = useState<QuoteDto | null>(null);
  const [order, setOrder] = useState<OrderDto | null>(null);
  const [modal, setModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetchMe(),
      apiGet<SubscriptionDto>('/billing/subscription'),
      apiGet<InvoiceListItem[] | Paged<InvoiceListItem>>('/billing/invoices'),
    ])
      .then(([session, subscription, inv]) => {
        if (session && isTenantMe(session)) setMe(session);
        setSub(subscription);
        setInvoices(listItems(inv));
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const requestQuote = async (config: ChangeConfigInput) => {
    const q = await apiPost<QuoteDto>('/billing/change-quote', config);
    setQuote(q);
    return q;
  };

  const checkout = async () => {
    if (!quote || quote.change?.noPayment) {
      toast.toast({ tone: 'success', title: 'Plan updated', description: 'No payment due for this change.' });
      load();
      return;
    }
    const o = await apiPost<OrderDto>('/billing/orders', { purpose: 'change', config: quote.config }, `change-${Date.now()}`);
    setOrder(o);
    setModal(true);
  };

  if (loading) return <PageLoading />;
  if (error) return <PageError error={error} onRetry={load} />;

  return (
    <>
      <PageHeader
        title="Billing"
        description="Change plan or add-ons with prorated mock checkout."
        actions={
          sub && me ? (
            <Button
              type="button"
              onClick={() =>
                requestQuote({
                  planId: sub.planId,
                  locationCount: sub.locationCount,
                  addonModuleIds: sub.addons.map((a) => a.moduleId),
                })
              }
            >
              Refresh quote
            </Button>
          ) : undefined
        }
      />
      {moduleHint ? (
        <p style={{ fontSize: 'var(--hos-text-sm)', color: 'var(--hos-fg-muted)' }}>
          Upsell path for module <code>{moduleHint}</code>.
        </p>
      ) : null}
      {sub ? (
        <p style={{ fontSize: 'var(--hos-text-sm)' }}>
          Current plan: <strong>{sub.planName}</strong> · {sub.cycle} · {sub.locationCount} location(s)
        </p>
      ) : null}
      {quote ? (
        <div style={{ marginTop: 'var(--hos-space-4)', fontSize: 'var(--hos-text-sm)' }}>
          Prorated net: {formatINR(quote.change?.netPaise ?? quote.totals.totalPaise)}
          <Button type="button" style={{ marginLeft: 'var(--hos-space-3)' }} onClick={checkout}>
            Mock pay
          </Button>
        </div>
      ) : null}
      <div style={{ marginTop: 'var(--hos-space-6)' }}>
        <DataTable
          columns={[
            { id: 'number', header: 'Invoice', accessor: (r) => r.number },
            { id: 'date', header: 'Date', accessor: (r) => isoToDDMMYYYY(r.issueDate) },
            { id: 'total', header: 'Total', accessor: (r) => formatINR(r.totalPaise) },
            { id: 'status', header: 'Status', accessor: (r) => r.status },
          ]}
          data={invoices}
          getRowId={(r) => r.id}
          emptyMessage="No invoices yet"
        />
      </div>
      <CheckoutModal open={modal} onClose={() => setModal(false)} order={order} onPaid={() => { setModal(false); load(); }} purpose="change" />
    </>
  );
}
