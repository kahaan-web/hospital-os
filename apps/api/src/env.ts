import { loadEnvFile } from '@hos/db';

const DEV_GATEWAY_SECRET = 'mock_secret_change_me_dev_only';
const DEV_WEBHOOK_SECRET = 'mock_webhook_secret_dev_only';

export interface ApiEnv {
  port: number;
  uploadDir: string;
  gatewayKeyId: string;
  gatewaySecret: string;
  /** Domain-separated from the capture signature. Mock webhook only. */
  webhookSecret: string;
  exposeSecrets: boolean;
  webOrigin: string;
  production: boolean;
  /**
   * Explicit local opt-in (`HOS_DEV_INSECURE=1`). Ignored when `NODE_ENV=production`.
   * Turns on OTP echoing, the payment simulator, the billing clock, and non-secure cookies.
   */
  devInsecure: boolean;
  /** `Secure` cookies unless dev-insecure mode is on. HttpOnly and SameSite=Lax always. */
  secureCookies: boolean;
  /** State-changing routes always require `x-hos-csrf: 1`. The dev flag does not turn this off. */
  csrfRequired: true;
}

export function apiEnv(): ApiEnv {
  loadEnvFile();
  const production = process.env.NODE_ENV === 'production';
  const devInsecure = !production && process.env.HOS_DEV_INSECURE === '1';
  const gatewaySecret = process.env.MOCK_GATEWAY_KEY_SECRET ?? '';
  const webhookSecret = process.env.MOCK_GATEWAY_WEBHOOK_SECRET ?? '';
  if (!devInsecure) {
    if (!gatewaySecret || gatewaySecret === DEV_GATEWAY_SECRET) {
      throw new Error('MOCK_GATEWAY_KEY_SECRET must be set to a non-default value unless HOS_DEV_INSECURE=1');
    }
    if (!webhookSecret || webhookSecret === DEV_WEBHOOK_SECRET) {
      throw new Error('MOCK_GATEWAY_WEBHOOK_SECRET must be set to a non-default value unless HOS_DEV_INSECURE=1');
    }
  }
  return {
    port: Number(process.env.API_PORT || 4400),
    uploadDir: process.env.UPLOAD_DIR || './uploads',
    gatewayKeyId: process.env.MOCK_GATEWAY_KEY_ID || 'mock_key_hospitalos_dev',
    gatewaySecret: gatewaySecret || DEV_GATEWAY_SECRET,
    webhookSecret: webhookSecret || DEV_WEBHOOK_SECRET,
    exposeSecrets: devInsecure && (process.env.MOCK_EXPOSE_SECRETS ?? 'true') !== 'false',
    webOrigin: process.env.WEB_ORIGIN || 'http://localhost:3400',
    production,
    devInsecure,
    secureCookies: !devInsecure,
    csrfRequired: true,
  };
}
