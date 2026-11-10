import { loadEnvFile } from '@hos/db';

export interface ApiEnv {
  port: number;
  uploadDir: string;
  gatewayKeyId: string;
  gatewaySecret: string;
  exposeSecrets: boolean;
  webOrigin: string;
  production: boolean;
}

export function apiEnv(): ApiEnv {
  loadEnvFile();
  const production = process.env.NODE_ENV === 'production';
  return {
    port: Number(process.env.API_PORT || 4400),
    uploadDir: process.env.UPLOAD_DIR || './uploads',
    gatewayKeyId: process.env.MOCK_GATEWAY_KEY_ID || 'mock_key_hospitalos_dev',
    gatewaySecret: process.env.MOCK_GATEWAY_KEY_SECRET || 'mock_secret_change_me_dev_only',
    exposeSecrets: (process.env.MOCK_EXPOSE_SECRETS || 'true') === 'true',
    webOrigin: process.env.WEB_ORIGIN || 'http://localhost:3400',
    production,
  };
}
