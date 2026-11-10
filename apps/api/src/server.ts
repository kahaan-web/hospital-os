import { buildApp } from './app';
import { apiEnv } from './env';

const app = await buildApp();
const env = apiEnv();

await app.listen({ port: env.port, host: '127.0.0.1' });
app.log.info({ routes: app.printRoutes({ commonPrefix: false }) }, 'routes');

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
