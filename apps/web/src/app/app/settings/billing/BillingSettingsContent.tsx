'use client';

import type { Catalog, ChangeConfigInput, InvoiceListItem, OrderDto, QuoteDto, SubscriptionDto } from '@hos/shared';
import { Button, Checkbox, DataTable, Field, Input, PageHeader, Select, useToast } from '@hos/ui';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckoutModal } from '@/features/billing/CheckoutModal';
import { PageError, PageLoading } from '@/features/common/LoadState';
import { formatINR, isoToDDMMYYYY } from '@/lib/format';
import { listItems, type Paged } from '@/lib/lists';
import { ApiError, apiGet, apiPost } from '@/lib/api';
import type { TenantMe } from '@hos/shared';
import { fetchMe, isTenantMe } from '@/lib/auth';

export function BillingSettingsContent() {
  const params = useSearchParams();
  const moduleHint = params.get('module');
  const { toast: showToast } = useToast();
  const [me, setMe] = useState<TenantMe | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [sub, setSub] = useState<SubscriptionDto | null>(null);
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [draft, setDraft] = useState<ChangeConfigInput | null>(null);
  const [quote, setQuote] = useState<QuoteDto | null>(null);
  const [order, setOrder] = useState<OrderDto | null>(null);
  const [modal, setModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const orderKeyRef = useRef<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetchMe(),
      apiGet<SubscriptionDto>('/billing/subscription'),
      apiGet<InvoiceListItem[] | Paged<InvoiceListItem>>('/billing/invoices'),
      apiGet<Catalog>('/catalog'),
    ])
      .then(([session, subscription, inv, cat]) => {
        if (session && isTenantMe(session)) setMe(session);
        setSub(subscription);
        setInvoices(listItems(inv));
        setCatalog(cat);
        setDraft({
          planId: subscription.planId,
          locationCount: subscription.locationCount,
          addonModuleIds: subscription.addons.map((a) => a.moduleId),
        });
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const hintModule = moduleHint ? me?.modules.find((m) => m.key === moduleHint) : null;

  const requestQuote = async () => {
    if (!draft) return;
    setQuoteBusy(true);
    try {
      const q = await apiPost<QuoteDto>('/billing/change-quote', draft);
      setQuote(q);
    } catch (e) {
      showToast({
        tone: 'error',
        title: 'Quote failed',
        description: e instanceof ApiError ? e.message : 'Could not price this change',
      });
    } finally {
      setQuoteBusy(false);
    }
  };

  const checkout = async () => {
    if (!quote) return;
    if (quote.change?.noPayment) {
      try {
        await apiPost('/billing/orders', { purpose: 'change', config: quote.config }, `change-apply-${crypto.randomUUID()}`);
        showToast({ tone: 'success', title: 'Plan updated', description: 'No payment due for this change.' });
        load();
      } catch (e) {
        showToast({ tone: 'error', title: 'Update failed', description: e instanceof ApiError ? e.message : '' });
      }
      return;
    }
    try {
      if (!orderKeyRef.current) orderKeyRef.current = `change-${crypto.randomUUID()}`;
      const o = await apiPost<OrderDto>(
        '/billing/orders',
        { purpose: 'change', config: quote.config },
        orderKeyRef.current,
      );
      setOrder(o);
      setModal(true);
    } catch (e) {
      showToast({ tone: 'error', title: 'Checkout failed', description: e instanceof ApiError ? e.message : '' });
    }
  };

  const toggleAddon = (moduleId: string) => {
    setDraft((d) => {
      if (!d) return d;
      const on = d.addonModuleIds.includes(moduleId);
      return {
        ...d,
        addonModuleIds: on ? d.addonModuleIds.filter((id) => id !== moduleId) : [...d.addonModuleIds, moduleId],
      };
    });
    setQuote(null);
  };

  if (loading) return <PageLoading />;
  if (error) return <PageError error={error} onRetry={load} />;

  const plans = catalog?.plans.filter((p) => p.status === 'active').sort((a, b) => a.sortOrder - b.sortOrder) ?? [];
  const purchasableAddons =
    catalog?.modules.filter((m) => m.addonPurchasable && m.status === 'available') ?? [];

  return (
    <>
      <PageHeader title="Billing" description="Change plan or add-ons with prorated mock checkout." />
      {hintModule ? (
        <p style={{ fontSize: 'var(--hos-text-sm)', color: 'var(--hos-fg-muted)', marginBottom: 'var(--hos-space-4)' }}>
          Upgrade path: <strong>{hintModule.name}</strong>
        </p>
      ) : null}
      {sub ? (
        <p style={{ fontSize: 'var(--hos-text-sm)', marginBottom: 'var(--hos-space-4)' }}>
          Current plan: <strong>{sub.planName}</strong> · {sub.cycle} · {sub.locationCount} location(s)
        </p>
      ) : null}

      {draft ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hos-space-3)', maxWidth: '32rem', marginBottom: 'var(--hos-space-6)' }}>
          <Field label="Plan">
            <Select value={draft.planId} onChange={(e) => { setDraft((d) => (d ? { ...d, planId: e.target.value } : d)); setQuote(null); }}>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Billable locations">
            <Input
              type="number"
              min={1}
              value={draft.locationCount}
              onChange={(e) => {
                setDraft((d) => (d ? { ...d, locationCount: Number(e.target.value) || 1 } : d));
                setQuote(null);
              }}
            />
          </Field>
          <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend style={{ fontWeight: 600, fontSize: 'var(--hos-text-sm)', marginBottom: 'var(--hos-space-2)' }}>Add-on modules</legend>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hos-space-2)' }}>
              {purchasableAddons.map((m) => (
                <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--hos-space-2)', fontSize: 'var(--hos-text-sm)' }}>
                  <Checkbox
                    checked={draft.addonModuleIds.includes(m.id)}
                    onCheckedChange={() => toggleAddon(m.id)}
                    aria-label={`Add-on ${m.name}`}
                  />
                  {m.name}
                </label>
              ))}
            </div>
          </fieldset>
          <Button type="button" onClick={requestQuote} loading={quoteBusy}>
            Get prorated quote
          </Button>
        </div>
      ) : null}

      {quote ? (
        <div style={{ marginBottom: 'var(--hos-space-6)', fontSize: 'var(--hos-text-sm)' }}>
          Prorated net: {formatINR(quote.change?.netPaise ?? quote.totals.totalPaise)}
          {quote.change?.noPayment ? (
            <span style={{ color: 'var(--hos-fg-muted)' }}> · No payment due</span>
          ) : null}
          <Button type="button" style={{ marginLeft: 'var(--hos-space-3)' }} onClick={checkout}>
            {quote.change?.noPayment ? 'Apply change' : 'Mock pay'}
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
      <CheckoutModal
        open={modal}
        onClose={() => setModal(false)}
        order={order}
        onPaid={() => {
          setModal(false);
          orderKeyRef.current = null;
          load();
        }}
        purpose="change"
      />
    </>
  );
}
