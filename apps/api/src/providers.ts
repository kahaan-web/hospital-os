import { schema, type Tx } from '@hos/db';
import { paymentSignature, safeEqual, webhookSignature, webhookTimestampFresh } from './crypto';

/** Outbound SMS. The mock records `outbox_messages` inside the request transaction. */
export interface SmsSender {
  send(tx: Tx, message: { tenantId: string; to: string; template: string; body: string }): Promise<void>;
}

/** Outbound email. The mock records `outbox_messages` inside the request transaction. */
export interface EmailSender {
  send(tx: Tx, message: { tenantId: string; to: string; subject: string; template: string; body: string }): Promise<void>;
}

/**
 * Mock payment gateway. `signCapture` is the gateway side (returned from a successful pay).
 * `verifySignature` is the merchant side (`POST /billing/verify`).
 */
export interface PaymentGateway {
  readonly keyId: string;
  signCapture(orderPublicId: string, paymentPublicId: string): string;
  verifySignature(orderPublicId: string, paymentPublicId: string, signature: string): boolean;
  /** HMAC of `timestamp.canonicalJson(body)` with the webhook secret. The tenant never sees this secret. */
  signWebhook(timestamp: string, body: unknown): string;
  verifyWebhook(timestamp: string, body: unknown, signature: string): boolean;
}

export function mockSmsSender(opts: { logCodes: boolean; log: (line: string) => void }): SmsSender {
  return {
    async send(tx, message) {
      await tx.insert(schema.outboxMessages).values({
        tenantId: message.tenantId,
        channel: 'sms',
        recipient: message.to,
        template: message.template,
        body: message.body,
      });
      if (opts.logCodes) opts.log(`[otp] sms ${message.to} ${message.body}`);
    },
  };
}

export function mockEmailSender(): EmailSender {
  return {
    async send(tx, message) {
      await tx.insert(schema.outboxMessages).values({
        tenantId: message.tenantId,
        channel: 'email',
        recipient: message.to,
        subject: message.subject,
        template: message.template,
        body: message.body,
      });
    },
  };
}

export function mockPaymentGateway(keyId: string, secret: string, webhookSecret: string): PaymentGateway {
  return {
    keyId,
    signCapture(orderPublicId, paymentPublicId) {
      return paymentSignature(secret, orderPublicId, paymentPublicId);
    },
    verifySignature(orderPublicId, paymentPublicId, signature) {
      return safeEqual(paymentSignature(secret, orderPublicId, paymentPublicId), signature);
    },
    signWebhook(timestamp, body) {
      return webhookSignature(webhookSecret, timestamp, body);
    },
    verifyWebhook(timestamp, body, signature) {
      if (!webhookTimestampFresh(timestamp)) return false;
      return safeEqual(webhookSignature(webhookSecret, timestamp, body), signature);
    },
  };
}
