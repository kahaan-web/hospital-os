import { schema } from '@hos/db';
import type { PrivacyNoticeDto } from '@hos/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { loadCatalog } from '../catalog';
import type { Deps } from '../guard';
import { ApiError } from '../http';

export function registerPublic(app: FastifyInstance, deps: Deps): void {
  app.get('/api/v1/health', async () => ({ ok: true as const }));

  app.get('/api/v1/catalog', async () => loadCatalog(deps.db, { activePlansOnly: true, hideHidden: true }));

  app.get('/api/v1/privacy-notice/current', async (): Promise<PrivacyNoticeDto> => {
    const [row] = await deps.db.select().from(schema.privacyNotices).where(eq(schema.privacyNotices.isCurrent, true));
    if (!row) throw new ApiError(404, 'not_found', 'No privacy notice is published');
    return {
      id: row.id,
      version: row.version,
      title: row.title,
      summary: row.summary,
      body: row.body,
      purposes: row.purposes,
      effectiveFrom: String(row.effectiveFrom),
    };
  });
}
