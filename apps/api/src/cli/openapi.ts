import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../app';

const app = await buildApp();
await app.ready();
const file = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'openapi.json');
writeFileSync(file, JSON.stringify(app.swagger(), null, 2));
await app.close();
process.exit(0);
