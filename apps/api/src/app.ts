import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import { attachPlatformDb, createDb, dbEnv } from '@hos/db';
import Fastify, { type FastifyInstance } from 'fastify';
import { jsonSchemaTransform, serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { apiEnv } from './env';
import { installErrorHandler } from './http';
import { mockEmailSender, mockPaymentGateway, mockSmsSender } from './providers';
import { registerClinical } from './clinical';
import { registerAdmin } from './routes/admin';
import { registerAuth } from './routes/auth';
import { registerBilling } from './routes/billing';
import { registerOnboarding } from './routes/onboarding';
import { registerPublic } from './routes/public';
import { registerTenant } from './routes/tenant';

export async function buildApp(): Promise<FastifyInstance> {
  const env = apiEnv();
  const urls = dbEnv();
  const handle = createDb(urls.appUrl, { max: 6 });
  const platform = createDb(urls.platformUrl, { max: 2 });
  attachPlatformDb(handle.db, platform.db);
  const app = Fastify({
    logger: process.env.VITEST ? false : { level: process.env.LOG_LEVEL || 'info' },
    trustProxy: false,
    bodyLimit: 1_048_576,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  installErrorHandler(app);

  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(multipart, { limits: { fileSize: 1_048_576, files: 1 } });
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: 'Hospital OS API', version: '0.1.0' },
      servers: [{ url: 'http://127.0.0.1:4400' }],
    },
    transform: jsonSchemaTransform,
  });

  app.addHook('onRequest', async (req, reply) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return;
    if (req.headers['x-hos-csrf'] !== '1') {
      return reply.status(403).send({ error: { code: 'csrf', message: 'Send header x-hos-csrf: 1' } });
    }
  });

  const logLine = (line: string) => app.log.info(line);
  const deps = {
    db: handle.db,
    env,
    sms: mockSmsSender({ logCodes: !env.production, log: logLine }),
    email: mockEmailSender(),
    gateway: mockPaymentGateway(env.gatewayKeyId, env.gatewaySecret),
  };
  registerPublic(app, deps);
  registerAuth(app, deps);
  registerOnboarding(app, deps);
  registerBilling(app, deps);
  registerTenant(app, deps);
  registerClinical(app, deps);
  registerAdmin(app, deps);

  app.get('/api/docs/json', async () => app.swagger());

  app.addHook('onClose', async () => {
    const close = (fn: () => Promise<void>) => Promise.race([fn(), new Promise((resolve) => setTimeout(resolve, 2000))]);
    await close(() => handle.close());
    await close(() => platform.close());
  });

  return app;
}
