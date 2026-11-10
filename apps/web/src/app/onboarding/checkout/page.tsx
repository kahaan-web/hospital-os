'use client';

import type { OnboardingState, OrderDto, QuoteDto } from '@hos/shared';
import { Button, Card, CardBody, PageHeader, useToast } from '@hos/ui';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { CheckoutModal } from '@/features/billing/CheckoutModal';
import { OnboardingGate } from '@/features/onboarding/OnboardingGate';
import { OnboardingWizardShell } from '@/features/onboarding/OnboardingWizardShell';
import { formatINR } from '@/lib/format';
import { ApiError, apiGet, apiPost } from '@/lib/api';

export default function CheckoutPage() {
  const router = useRouter();
  const toast = useToast();
  const [quote, setQuote] = useState<QuoteDto | null>(null);
  const [order, setOrder] = useState<OrderDto | null>(null);
  const [modal, setModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadQuote = useCallback(() => {
    setLoading(true);
    apiGet<QuoteDto>('/onboarding/quote')
      .then(setQuote)
      .catch(() => toast.toast({ tone: 'error', title: 'Could not load quote' }))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => {
    loadQuote();
  }, [loadQuote]);

  const createOrder = useCallback(async () => {
    try {
      const o = await apiPost<OrderDto>('/billing/orders', { purpose: 'onboarding' }, `onboarding-${Date.now()}`);
      setOrder(o);
      setModal(true);
    } catch (e) {
      toast.toast({ tone: 'error', title: 'Order failed', description: e instanceof ApiError ? e.message : '' });
    }
  }, [toast]);

  const onPaid = useCallback(() => {
    router.push('/onboarding/invoice');
  }, [router]);

  return (
    <OnboardingWizardShell currentHref="/onboarding/checkout">
      <OnboardingGate allowedHrefs={['/onboarding/checkout']}>
        {() => (
          <>
            <PageHeader title="Review and pay" description="Mock Razorpay-style checkout with UPI, card, and net banking." />
            <Card style={{ maxWidth: '32rem' }}>
              <CardBody>
                {loading ? <p>Loading server quote…</p> : null}
                {quote ? (
                  <dl style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 'var(--hos-space-2)', fontSize: 'var(--hos-text-sm)' }}>
                    <dt>Plan</dt>
                    <dd style={{ margin: 0 }}>{quote.config.planName}</dd>
                    <dt>Locations</dt>
                    <dd style={{ margin: 0 }}>{quote.config.locationCount}</dd>
                    <dt>Taxable</dt>
                    <dd style={{ margin: 0 }}>{formatINR(quote.totals.taxablePaise)}</dd>
                    <dt>Total</dt>
                    <dd style={{ margin: 0, fontWeight: 600 }}>{formatINR(quote.totals.totalPaise)}</dd>
                  </dl>
                ) : null}
                <Button type="button" style={{ marginTop: 'var(--hos-space-4)' }} onClick={createOrder} disabled={!quote}>
                  Open mock checkout
                </Button>
              </CardBody>
            </Card>
            <CheckoutModal
              open={modal}
              onClose={() => setModal(false)}
              order={order}
              onPaid={onPaid}
              purpose="onboarding"
            />
          </>
        )}
      </OnboardingGate>
    </OnboardingWizardShell>
  );
}
