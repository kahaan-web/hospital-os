import type pg from 'pg';

export function quoteIdent(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Unexpected identifier ${name}`);
  return `"${name}"`;
}

/**
 * Insert one probe row. A second run is a no-op when the tenant already has a row.
 * Throws when the statement inserts nothing and the table is still empty for this tenant
 * (a join missed its parent, or a check rejected the values).
 */
export async function ensureRow(owner: pg.Client, table: string, tenantId: string, text: string, params: unknown[]): Promise<void> {
  let inserted = 0;
  try {
    const r = await owner.query(text, params);
    inserted = r.rowCount ?? 0;
  } catch (err) {
    throw new Error(`${table}: ${(err as Error).message}`, { cause: err });
  }
  if (inserted > 0) return;
  const have = await owner.query(`select 1 from ${quoteIdent(table)} where tenant_id = $1 limit 1`, [tenantId]);
  if ((have.rowCount ?? 0) > 0) return;
  throw new Error(`${table}: insert did not add a row (check parent fixtures and constraints)`);
}
