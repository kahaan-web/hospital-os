'use client';

import type { OrderDto, PayAttemptInput, PayAttemptResult, PaymentMethod } from '@hos/shared';
import { PAYMENT_OUTCOMES } from '@hos/shared';
import { Button, Dialog, Field, Input, Select, Tabs, useToast } from '@hos/ui';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
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
  const { toast: showToast } = useToast();
  const formId = useId();
  const [method, setMethod] = useState<PaymentMethod>('upi');
  const [outcome, setOutcome] = useState<PayOutcome>('success');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [vpa, setVpa] = useState('demo@upi');
  const [cardLast4, setCardLast4] = useState('1111');
  const [bank, setBank] = useState('hdfc');
  const payKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (open && order) {
      payKeyRef.current = `${idempotencySeed ?? purpose}-${order.id}-${crypto.randomUUID()}`;
      setPending(false);
    }
  }, [open, order?.id, idempotencySeed, purpose, order]);

  const paymentDetails = useCallback((): PayAttemptInput['details'] => {
    if (method === 'upi') return { vpa: vpa.trim() || 'demo@upi' };
    if (method === 'card') return { cardLast4: cardLast4.replace(/\D/g, '').slice(-4) || '1111', cardNetwork: 'visa' };
    return { bank };
  }, [method, vpa, cardLast4, bank]);

  const pay = useCallback(async () => {
    if (!order || !payKeyRef.current) return;
    setBusy(true);
    try {
      const result = await apiPost<PayAttemptResult>(
        `/billing/orders/${order.id}/pay`,
        { method, outcome, details: paymentDetails() },
        payKeyRef.current,
      );
      if (result.payment.status === 'captured' && result.checkout) {
        const verified = await apiPost<OrderDto>(
          '/billing/verify',
          {
            orderId: result.checkout.orderId,
            paymentId: result.checkout.paymentId,
            signature: result.checkout.signature,
          },
          `${payKeyRef.current}-verify`,
        );
        showToast({ tone: 'success', title: 'Payment recorded', description: 'Your subscription is active.' });
        onPaid(verified);
        onClose();
      } else if (result.payment.status === 'pending') {
        setPending(true);
        showToast({ tone: 'default', title: 'Payment pending', description: 'The mock gateway webhook confirms this payment.' });
      } else {
        showToast({ tone: 'error', title: 'Payment failed', description: result.payment.failureReason ?? 'Try again.' });
      }
    } catch (e) {
      showToast({
        tone: 'error',
        title: 'Checkout error',
        description: e instanceof ApiError ? e.message : 'Could not process payment',
      });
    } finally {
      setBusy(false);
    }
  }, [order, method, outcome, paymentDetails, onPaid, onClose, showToast]);

  const amount = order?.amountPaise ?? 0;
  const tax = order?.quote.totals;

  const methodFields =
    method === 'upi' ? (
      <Field label="UPI ID" hint="Any value works in mock mode">
        <Input value={vpa} onChange={(e) => setVpa(e.target.value)} name={`${formId}-upi`} autoComplete="off" />
      </Field>
    ) : method === 'card' ? (
      <>
        <Field label="Card number">
          <Input defaultValue="4111 1111 1111 1111" inputMode="numeric" readOnly />
        </Field>
        <Row>
          <Field label="Last 4 digits" hint="Sent to mock gateway">
            <Input
              value={cardLast4}
              onChange={(e) => setCardLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
            />
          </Field>
          <Field label="Expiry">
            <Input defaultValue="12/28" readOnly />
          </Field>
        </Row>
      </>
    ) : (
      <Field label="Bank">
        <Select value={bank} onChange={(e) => setBank(e.target.value)}>
          <option value="hdfc">HDFC Bank</option>
          <option value="sbi">State Bank of India</option>
          <option value="icici">ICICI Bank</option>
        </Select>
      </Field>
    );

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
      {tax ? (
        <dl
          style={{
            margin: '0 0 var(--hos-space-4)',
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 'var(--hos-space-1) var(--hos-space-3)',
            fontSize: 'var(--hos-text-sm)',
          }}
        >
          <dt style={{ color: 'var(--hos-fg-muted)' }}>Taxable</dt>
          <dd style={{ margin: 0 }}>{formatINR(tax.taxablePaise)}</dd>
          {tax.interState ? (
            <>
              <dt style={{ color: 'var(--hos-fg-muted)' }}>IGST</dt>
              <dd style={{ margin: 0 }}>{formatINR(tax.igstPaise)}</dd>
            </>
          ) : (
            <>
              <dt style={{ color: 'var(--hos-fg-muted)' }}>CGST</dt>
              <dd style={{ margin: 0 }}>{formatINR(tax.cgstPaise)}</dd>
              <dt style={{ color: 'var(--hos-fg-muted)' }}>SGST</dt>
              <dd style={{ margin: 0 }}>{formatINR(tax.sgstPaise)}</dd>
            </>
          )}
        </dl>
      ) : null}
      {pending ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hos-space-3)' }}>
          <p style={{ margin: 0 }}>
            Payment is pending. The hospital cannot confirm it. The mock gateway webhook captures or fails this attempt.
          </p>
          <Row>
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>
          </Row>
        </div>
      ) : (
        <>
          <Tabs
            tabs={[
              { value: 'upi', label: 'UPI', content: method === 'upi' ? <Stack>{methodFields}</Stack> : null },
              { value: 'card', label: 'Card', content: method === 'card' ? <Stack>{methodFields}</Stack> : null },
              {
                value: 'netbanking',
                label: 'Net banking',
                content: method === 'netbanking' ? <Stack>{methodFields}</Stack> : null,
              },
            ]}
            value={method}
            onValueChange={(v) => setMethod(v as PaymentMethod)}
          />
          <Stack style={{ marginTop: 'var(--hos-space-4)' }}>
            <Field label="Simulate outcome" hint="The server captures the payment. This choice applies only when the dev simulator is on.">
              <Select value={outcome} onChange={(e) => setOutcome(e.target.value as PayOutcome)}>
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
