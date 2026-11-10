'use client';

import type { OrderDto, PayAttemptResult, PaymentMethod } from '@hos/shared';
import { PAYMENT_OUTCOMES } from '@hos/shared';
import { Button, Dialog, Field, Input, Select, Tabs, useToast } from '@hos/ui';
import { useCallback, useId, useState } from 'react';
import { ApiError, apiPost } from '@/lib/api';
import { formatINR } from '@/lib/format';

type PayOutcome = (typeof PAYMENT_OUTCOMES)[number];

export interface CheckoutModalProps {
  open: boolean;
  onClose: () => void;
  order: OrderDto | null;
  onPaid: (order: OrderDto) => void;
  purpose: 'onboarding' | 'change';
  idempotencySeed?: string;
}

export function CheckoutModal({ open, onClose, order, onPaid, purpose, idempotencySeed }: CheckoutModalProps) {
  const toast = useToast();
  const formId = useId();
  const [method, setMethod] = useState<PaymentMethod>('upi');
  const [outcome, setOutcome] = useState<PayOutcome>('success');
  const [busy, setBusy] = useState(false);
  const [lastPaymentId, setLastPaymentId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const pay = useCallback(async () => {
    if (!order) return;
    setBusy(true);
    try {
      const key = `${idempotencySeed ?? purpose}-${order.id}-${Date.now()}`;
      const result = await apiPost<PayAttemptResult>(
        `/billing/orders/${order.id}/pay`,
        { method, outcome, details: {} },
        key,
      );
      if (result.payment.status === 'captured' && result.checkout) {
        const verified = await apiPost<OrderDto>('/billing/verify', {
          orderId: result.checkout.orderId,
          paymentId: result.checkout.paymentId,
          signature: result.checkout.signature,
        });
        toast.toast({ tone: 'success', title: 'Payment recorded', description: 'Your subscription is active.' });
        onPaid(verified);
        onClose();
      } else if (result.payment.status === 'pending') {
        setLastPaymentId(result.payment.id);
        setPending(true);
        toast.toast({ tone: 'default', title: 'Payment pending', description: 'Resolve when your bank confirms.' });
      } else {
        toast.toast({ tone: 'error', title: 'Payment failed', description: result.payment.failureReason ?? 'Try again.' });
      }
    } catch (e) {
      toast.toast({
        tone: 'error',
        title: 'Checkout error',
        description: e instanceof ApiError ? e.message : 'Could not process payment',
      });
    } finally {
      setBusy(false);
    }
  }, [order, method, outcome, idempotencySeed, purpose, onPaid, onClose, toast]);

  const resolvePending = useCallback(
    async (resolveOutcome: 'success' | 'failure') => {
      if (!lastPaymentId) return;
      setBusy(true);
      try {
        await apiPost(`/billing/payments/${lastPaymentId}/resolve`, { outcome: resolveOutcome });
        if (resolveOutcome === 'success' && order) {
          const refreshed = await apiPost<PayAttemptResult>(`/billing/orders/${order.id}/pay`, {
            method,
            outcome: 'success',
            details: {},
          });
          if (refreshed.checkout) {
            const verified = await apiPost<OrderDto>('/billing/verify', refreshed.checkout);
            onPaid(verified);
            onClose();
          }
        } else {
          toast.toast({ tone: 'error', title: 'Payment failed', description: 'The pending payment did not clear.' });
          setPending(false);
        }
      } catch (e) {
        toast.toast({
          tone: 'error',
          title: 'Could not resolve',
          description: e instanceof ApiError ? e.message : 'Try again',
        });
      } finally {
        setBusy(false);
      }
    },
    [lastPaymentId, order, method, onPaid, onClose, toast],
  );

  const amount = order?.amountPaise ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Mock payment checkout"
      description="Sample Razorpay-style flow. No real money is charged."
    >
      <p style={{ margin: '0 0 var(--hos-space-4)', fontSize: 'var(--hos-text-sm)', color: 'var(--hos-fg-muted)' }}>
        Pay {formatINR(amount)} incl. GST (mock)
      </p>
      {pending ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hos-space-3)' }}>
          <p style={{ margin: 0 }}>Payment is pending. Simulate bank confirmation:</p>
          <Row>
            <Button type="button" disabled={busy} onClick={() => resolvePending('success')}>
              Mark success
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => resolvePending('failure')}>
              Mark failure
            </Button>
            <Button type="button" variant="ghost" onClick={() => setPending(false)}>
              Retry payment
            </Button>
          </Row>
        </div>
      ) : (
        <>
          <Tabs
            tabs={[
              { value: 'upi', label: 'UPI', content: null },
              { value: 'card', label: 'Card', content: null },
              { value: 'netbanking', label: 'Net banking', content: null },
            ]}
            value={method}
            onValueChange={(v) => setMethod(v as PaymentMethod)}
          />
          <Stack style={{ marginTop: 'var(--hos-space-4)' }}>
            {method === 'upi' && (
              <Field label="UPI ID" hint="Any value works in mock mode">
                <Input defaultValue="demo@upi" name={`${formId}-upi`} autoComplete="off" />
              </Field>
            )}
            {method === 'card' && (
              <>
                <Field label="Card number">
                  <Input defaultValue="4111 1111 1111 1111" inputMode="numeric" />
                </Field>
                <Row>
                  <Field label="Expiry">
                    <Input defaultValue="12/28" />
                  </Field>
                  <Field label="CVV">
                    <Input defaultValue="123" type="password" />
                  </Field>
                </Row>
              </>
            )}
            {method === 'netbanking' && (
              <Field label="Bank">
                <Select defaultValue="hdfc">
                  <option value="hdfc">HDFC Bank</option>
                  <option value="sbi">State Bank of India</option>
                  <option value="icici">ICICI Bank</option>
                </Select>
              </Field>
            )}
            <Field label="Simulate outcome" hint="For demo only">
              <Select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value as PayOutcome)}
              >
                {PAYMENT_OUTCOMES.map((o) => (
                  <option key={o} value={o}>
                    {o.charAt(0).toUpperCase() + o.slice(1)}
                  </option>
                ))}
              </Select>
            </Field>
          </Stack>
          <Row style={{ marginTop: 'var(--hos-space-5)', justifyContent: 'flex-end' }}>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" disabled={busy || !order} onClick={pay}>
              Pay {formatINR(amount)}
            </Button>
          </Row>
        </>
      )}
    </Dialog>
  );
}

function Row({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ display: 'flex', gap: 'var(--hos-space-3)', flexWrap: 'wrap', alignItems: 'flex-end', ...style }}>
      {children}
    </div>
  );
}

function Stack({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hos-space-3)', ...style }}>{children}</div>;
}