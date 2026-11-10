import { schema } from '@hos/db';
import { changeConfigSchema, createOrderSchema, payAttemptSchema, resolvePendingSchema, verifyPaymentSchema } from '@hos/shared';
import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { applySubscriptionChange, createOrder, payOrder, resolvePending, verifyPayment } from '../billing';
import { invoiceDto, invoiceListItem, quoteFor, subscriptionDto } from '../catalog';
import { invoiceHtml, invoicePdf } from '../documents';
import { openTenant, type Deps, type TenantGate } from '../guard';
import { ApiError, idempotencyKey } from '../http';

export function registerBilling(app: FastifyInstance, deps: Deps): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const run = <T>(req: FastifyRequest, reply: FastifyReply, fn: (gate: TenantGate) => Promise<T>) => openTenant(deps, req, reply, fn);

  r.post('/api/v1/billing/orders', { schema: { body: createOrderSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      gate.requirePermission('billing.manage');
      const key = idempotencyKey(req);
      if (!key) throw new ApiError(400, 'idempotency_key_required', 'Send an Idempotency-Key header (8–128 letters, numbers, _ or -)');
      const config = req.body.purpose === 'change' ? { ...req.body.config, cycle: 'monthly' as const } : null;
      return createOrder(gate.tx, gate.actor, req.body.purpose, config, key, deps.gateway);
    }),
  );

  r.post('/api/v1/billing/orders/:orderId/pay', { schema: { params: z.object({ orderId: z.string().min(1) }), body: payAttemptSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      gate.requirePermission('billing.manage');
      return payOrder(gate.tx, gate.actor, req.params.orderId, req.body, deps.gateway);
    }),
  );

  r.post('/api/v1/billing/verify', { schema: { body: verifyPaymentSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      gate.requirePermission('billing.manage');
      const order = await verifyPayment(gate.tx, gate.actor, req.body, deps.gateway);
      if (!order) {
        reply.status(400);
        return { error: { code: 'signature_invalid', message: 'The payment signature does not match' } };
      }
      return order;
    }),
  );

  r.post('/api/v1/billing/payments/:paymentId/resolve', { schema: { params: z.object({ paymentId: z.string().min(1) }), body: resolvePendingSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      gate.requirePermission('billing.manage');
      return resolvePending(gate.tx, gate.actor, req.params.paymentId, req.body.outcome, deps.gateway);
    }),
  );

  r.get('/api/v1/billing/subscription', async (req, reply) =>
    run(req, reply, async (gate) => {
      gate.requirePermission('billing.view');
      const sub = await subscriptionDto(gate.tx);
      if (!sub) throw new ApiError(404, 'not_found', 'No subscription yet');
      return sub;
    }),
  );

  r.post('/api/v1/billing/change-quote', { schema: { body: changeConfigSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      gate.requirePermission('billing.manage');
      const [sub] = await gate.tx.select().from(schema.subscriptions);
      if (!sub) throw new ApiError(422, 'no_subscription', 'There is no subscription to change');
      return quoteFor(gate.tx, { ...req.body, cycle: sub.billingCycle as 'monthly' | 'annual' }, 'change');
    }),
  );

  r.post('/api/v1/billing/change-apply', { schema: { body: changeConfigSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      gate.requirePermission('billing.manage');
      const [sub] = await gate.tx.select().from(schema.subscriptions);
      if (!sub) throw new ApiError(422, 'no_subscription', 'There is no subscription to change');
      const quote = await quoteFor(gate.tx, { ...req.body, cycle: sub.billingCycle as 'monthly' | 'annual' }, 'change');
      if (!quote.change?.noPayment) throw new ApiError(422, 'payment_required', 'This change needs a payment. Create an order instead.');
      await applySubscriptionChange(gate.tx, quote);
      await gate.audit('billing.subscription.change', 'subscription', sub.id, null, { planId: req.body.planId, noPayment: true });
      return quote;
    }),
  );

  r.get('/api/v1/billing/invoices', async (req, reply) =>
    run(req, reply, async (gate) => {
      gate.requirePermission('billing.view');
      const rows = await gate.tx.select().from(schema.invoices).orderBy(asc(schema.invoices.createdAt));
      return rows.map(invoiceListItem);
    }),
  );

  r.get('/api/v1/billing/invoices/:id', { schema: { params: z.object({ id: z.uuid() }) } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      gate.requirePermission('billing.view');
      return invoiceDto(gate.tx, req.params.id);
    }),
  );

  r.get('/api/v1/billing/invoices/:id/pdf', { schema: { params: z.object({ id: z.uuid() }) } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      gate.requirePermission('billing.view');
      const invoice = await invoiceDto(gate.tx, req.params.id);
      const pdf = await invoicePdf(invoice);
      return reply.header('content-disposition', `attachment; filename="${invoice.number.replaceAll('/', '-')}.pdf"`).type('application/pdf').send(Buffer.from(pdf));
    }),
  );

  r.get('/api/v1/billing/invoices/:id/html', { schema: { params: z.object({ id: z.uuid() }) } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      gate.requirePermission('billing.view');
      const invoice = await invoiceDto(gate.tx, req.params.id);
      return reply.type('text/html; charset=utf-8').send(invoiceHtml(invoice));
    }),
  );
}
