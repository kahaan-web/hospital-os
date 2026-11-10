import { schema, type Tx } from '@hos/db';
import {
  DOC_SERIES,
  MAX_DOC_NUMBER_LENGTH,
  formatDocNumber,
  formatUhid,
  fyCode,
  isOpdTokenKey,
  istDateKey,
  type ClinicalCtx,
  type DocSeriesKey,
  type NumberSeries,
  type SeriesKey,
} from '@hos/shared';
import { eq, sql } from 'drizzle-orm';
import { ApiError } from '../http';

async function nextRaw(ctx: ClinicalCtx<Tx>, series: string, locationId: string | null, period: string): Promise<number> {
  const found = await ctx.tx.execute<{ n: number }>(sql`select hos_next_number(${series}, ${locationId}::uuid, ${period}) as n`);
  const n = found.rows[0]?.n;
  if (!n || n < 1) throw new ApiError(422, 'series_exhausted', 'Could not take the next number');
  return Number(n);
}

async function prefixFor(ctx: ClinicalCtx<Tx>): Promise<string> {
  if (!ctx.locationId) throw new ApiError(422, 'location_required', 'Choose a location before numbering a document');
  const [loc] = await ctx.tx.select({ docPrefix: schema.locations.docPrefix }).from(schema.locations).where(eq(schema.locations.id, ctx.locationId));
  if (!loc?.docPrefix) throw new ApiError(422, 'location_required', 'This location has no document prefix');
  return loc.docPrefix;
}

export const numbering: NumberSeries<Tx> = {
  async next(ctx, key: SeriesKey, opts) {
    const at = opts?.at ?? new Date();
    if (key === 'uhid') {
      const formatted = formatUhid(await nextRaw(ctx, 'uhid', null, ''));
      if (formatted.length > MAX_DOC_NUMBER_LENGTH) throw new ApiError(422, 'series_exhausted', 'The UHID series is exhausted');
      return formatted;
    }
    if (isOpdTokenKey(key)) {
      return String(await nextRaw(ctx, key, null, istDateKey(at)));
    }
    if (!(key in DOC_SERIES)) throw new ApiError(422, 'validation', 'Unknown number series');
    const formatted = formatDocNumber(await prefixFor(ctx), DOC_SERIES[key as DocSeriesKey], fyCode(at), await nextRaw(ctx, key, ctx.locationId, fyCode(at)));
    if (formatted.length > MAX_DOC_NUMBER_LENGTH) {
      throw new ApiError(422, 'series_exhausted', 'That number would be longer than 16 characters');
    }
    return formatted;
  },
};
