// DB-level tenant isolation (audit P0-3). Connects as hos_app, the API's role, and proves that Postgres itself (row-level
// security plus grants) keeps two tenants apart for EVERY table that carries tenant data. The table list is discovered
// from the catalogue at run time, so a table added by a later migration is covered without editing this file.
import { afterAll, describe, expect, it } from 'vitest';
import { PROBE_SLUG, SUNRISE_SLUG, ensureProbeTenant, tenantIdBySlug } from './fixtures';
import { APP_ROLE, type Attempt, type Denial, attempt, close, connectBoth, denial, ident, inTx } from './helpers';

const { owner, app, database } = await connectBoth();

const sunriseId = await tenantIdBySlug(owner, SUNRISE_SLUG);
if (!sunriseId) {
  throw new Error(
    `Demo tenant "${SUNRISE_SLUG}" is missing in database ${database}. ` +
      'Run: npm run db:migrate && npm run db:seed && npm run db:seed:demo (same HOS_DB_NAME). See tests/db-rls/README.md.',
  );
}
const probeId = await ensureProbeTenant(owner);

interface TableInfo {
  name: string;
  kind: 'r' | 'p' | 'v' | 'm' | 'f';
  rls: boolean;
  force: boolean;
  owner: string;
  securityInvoker: boolean;
  /** Column holding the tenant id: `tenant_id`, or `id` for the tenants table itself. */
  key: string;
  priv: { select: boolean; insert: boolean; update: boolean; delete: boolean };
}

/** Every relation in `public` that holds tenant-keyed rows: has a tenant_id column, or is `tenants`. */
const tables = (
  await owner.query<TableInfo & { priv_select: boolean; priv_insert: boolean; priv_update: boolean; priv_delete: boolean }>(
    `select c.relname as name, c.relkind as kind, c.relrowsecurity as rls, c.relforcerowsecurity as force,
            pg_get_userbyid(c.relowner) as owner,
            coalesce('security_invoker=true' = any (c.reloptions), false) as "securityInvoker",
            case when c.relname = 'tenants' then 'id' else 'tenant_id' end as key,
            has_table_privilege($1, c.oid, 'SELECT') as priv_select,
            has_table_privilege($1, c.oid, 'INSERT') as priv_insert,
            has_table_privilege($1, c.oid, 'UPDATE') or exists (
              select 1 from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
                and has_column_privilege($1, c.oid, a.attnum, 'UPDATE')) as priv_update,
            has_table_privilege($1, c.oid, 'DELETE') as priv_delete
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
        and (c.relname = 'tenants' or exists (
              select 1 from pg_attribute a
               where a.attrelid = c.oid and a.attname = 'tenant_id' and a.attnum > 0 and not a.attisdropped))
      order by c.relname`,
    [APP_ROLE],
  )
).rows.map((r) => ({
  ...r,
  priv: { select: r.priv_select, insert: r.priv_insert, update: r.priv_update, delete: r.priv_delete },
}));

/** Per-table outcome, printed after the run (which operations were stopped by RLS vs by a missing GRANT). */
const report: Record<string, Record<string, string>> = {};
function note(table: string, op: string, outcome: string): void {
  (report[table] ??= {})[op] = outcome;
}

/** Outcome of a write attempt that must not touch another tenant: denied (RLS or privilege) or 0 rows. */
function expectNoEffect(table: string, op: string, a: Attempt, record = true): void {
  const d = denial(a);
  if (d) {
    if (record) note(table, op, `denied (${d})`);
    return;
  }
  expect(a.ok, `${table} ${op}: unexpected error ${a.ok ? '' : `${a.code} ${a.message}`}`).toBe(true);
  expect(a.ok && a.rowCount, `${table} ${op} touched another tenant's rows`).toBe(0);
  if (record) note(table, op, '0 rows');
}

function expectDenied(table: string, op: string, a: Attempt, allowed: Denial[] = ['rls', 'privilege']): void {
  const d = denial(a);
  expect(d, `${table} ${op}: expected 42501, got ${a.ok ? `success (${a.rowCount} rows)` : `${a.code} ${a.message}`}`).not.toBeNull();
  expect(allowed).toContain(d);
  note(table, op, `denied (${d})`);
}

async function ownerCount(t: TableInfo, tenantId: string): Promise<number> {
  const r = await owner.query<{ n: number }>(`select count(*)::int as n from ${ident(t.name)} where ${ident(t.key)} = $1`, [tenantId]);
  return r.rows[0]!.n;
}

/** Columns an INSERT may name explicitly (no generated / GENERATED ALWAYS identity columns). */
async function insertableColumns(t: TableInfo): Promise<string[]> {
  const r = await owner.query<{ attname: string }>(
    `select attname from pg_attribute
      where attrelid = $1::regclass and attnum > 0 and not attisdropped and attgenerated = '' and attidentity <> 'a'
      order by attnum`,
    [t.name],
  );
  return r.rows.map((x) => x.attname);
}

/** A column hos_app may UPDATE, preferring the tenant key (so a successful update would be a real tenant move). */
async function updatableColumn(t: TableInfo): Promise<string> {
  const r = await owner.query<{ attname: string }>(
    `select attname from pg_attribute
      where attrelid = $1::regclass and attnum > 0 and not attisdropped and attgenerated = ''
        and has_column_privilege($2, attrelid, attnum, 'UPDATE')
      order by (attname = $3) desc, attnum limit 1`,
    [t.name, APP_ROLE, t.key],
  );
  return r.rows[0]?.attname ?? t.key;
}

afterAll(async () => {
  const rows = Object.entries(report).map(([table, ops]) => ({ table, ...ops }));
  console.log(`\nDB RLS report (${database}; A=${SUNRISE_SLUG}, B=${PROBE_SLUG})`);
  console.table(rows);
  await close(owner);
  await close(app);
});

describe('roles', () => {
  it('hos_app is not superuser, cannot bypass RLS, owns nothing and is not a member of any role', async () => {
    const role = await owner.query(
      'select rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolinherit from pg_roles where rolname = $1',
      [APP_ROLE],
    );
    expect(role.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false, rolinherit: false });
    const owned = await owner.query(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and pg_get_userbyid(c.relowner) = $1`,
      [APP_ROLE],
    );
    expect(owned.rows).toEqual([]);
    const member = await owner.query(
      `select r.rolname from pg_auth_members m join pg_roles r on r.oid = m.roleid
        where m.member = (select oid from pg_roles where rolname = $1)`,
      [APP_ROLE],
    );
    expect(member.rows).toEqual([]);
  });

  it('discovers the known tenant tables (sanity check on the catalogue query)', () => {
    const names = tables.map((t) => t.name);
    for (const known of ['tenants', 'users', 'locations', 'invoices', 'payments', 'subscriptions', 'audit_log', 'sessions']) {
      expect(names).toContain(known);
    }
    expect(sunriseId).not.toBe(probeId);
  });
});

for (const t of tables) {
  describe(`${t.name}`, () => {
    it('has row-level security enabled and forced (or is not readable by hos_app)', () => {
      expect(t.owner, `${t.name} must not be owned by ${APP_ROLE}`).not.toBe(APP_ROLE);
      if (t.kind === 'r' || t.kind === 'p') {
        expect(t.rls, `${t.name}: ALTER TABLE ... ENABLE ROW LEVEL SECURITY is missing`).toBe(true);
        expect(t.force, `${t.name}: ALTER TABLE ... FORCE ROW LEVEL SECURITY is missing`).toBe(true);
      } else if (t.kind === 'v') {
        // A view runs with its owner's rights unless security_invoker is set, which would bypass RLS.
        expect(t.securityInvoker || !t.priv.select, `${t.name}: view readable by ${APP_ROLE} needs security_invoker=true`).toBe(true);
      } else {
        expect(t.priv.select, `${t.name}: ${t.kind === 'm' ? 'materialized view' : 'foreign table'} has no RLS`).toBe(false);
      }
    });

    it('keeps tenants apart: SELECT, INSERT, UPDATE and DELETE from the other tenant', async () => {
      const inSunrise = await ownerCount(t, sunriseId);
      const inProbe = await ownerCount(t, probeId);
      expect(
        inSunrise + inProbe,
        `${t.name} has no rows for either test tenant: seed sample rows (db:seed:demo) or add a probe fixture in tests/db-rls/fixtures.ts`,
      ).toBeGreaterThan(0);
      // Victim = a tenant that has rows here; attacker = the other one.
      const [victim, attacker, victimRows, attackerRows] =
        inSunrise > 0 ? [sunriseId, probeId, inSunrise, inProbe] : [probeId, sunriseId, inProbe, inSunrise];
      const T = ident(t.name);
      const K = ident(t.key);
      const victimRow = (await owner.query(`select to_jsonb(x) as j from ${T} x where ${K} = $1 limit 1`, [victim])).rows[0]!.j;
      const cols = (await insertableColumns(t)).map(ident).join(', ');
      const updCol = ident(await updatableColumn(t));

      // Sanity: the victim sees its own rows, so "0 rows" below is a real result, not a broken query.
      if (t.priv.select) {
        const own = await inTx(app, { scope: 'tenant', tenantId: victim }, () =>
          app.query<{ n: number }>(`select count(*)::int as n from ${T} where ${K} = $1`, [victim]),
        );
        expect(own.rows[0]!.n, `${t.name}: tenant cannot see its own rows`).toBe(victimRows);
      }

      await inTx(app, { scope: 'tenant', tenantId: attacker }, async () => {
        // SELECT: nothing of the victim, and nothing of any tenant other than the attacker.
        const sel = await attempt(app, `select count(*)::int as n from ${T} where ${K} is distinct from $1 and ${K} is not null`, [attacker]);
        if (denial(sel) === 'privilege') note(t.name, 'select', 'denied (privilege)');
        else {
          expect(sel.ok, `${t.name} select: ${sel.ok ? '' : sel.message}`).toBe(true);
          expect(sel.ok && sel.rows[0]!.n, `${t.name}: tenant sees other tenants' rows`).toBe(0);
          note(t.name, 'select', '0 rows');
        }

        // INSERT a copy of a victim row (tenant key = victim). RLS WITH CHECK runs before unique/FK checks.
        const ins = await attempt(
          app,
          `insert into ${T} (${cols}) select ${cols} from jsonb_populate_record(null::${T}, $1::jsonb)`,
          [victimRow],
        );
        expectDenied(t.name, 'insert', ins);

        expectNoEffect(t.name, 'update', await attempt(app, `update ${T} set ${updCol} = ${updCol} where ${K} = $1`, [victim]));
        expectNoEffect(t.name, 'delete', await attempt(app, `delete from ${T} where ${K} = $1`, [victim]));

        // Re-home the attacker's own rows into the victim tenant.
        if (attackerRows > 0) {
          const move = await attempt(app, `update ${T} set ${K} = $1 where ${K} = $2`, [victim, attacker]);
          expectDenied(t.name, 'move-own-row', move);
        } else {
          note(t.name, 'move-own-row', 'n/a (attacker has no rows)');
        }
      });
    });

    it('returns no tenant rows without a tenant context', async () => {
      const T = ident(t.name);
      const K = ident(t.key);
      const contexts = [
        ['no settings', null],
        ['tenant, empty id', { scope: 'tenant', tenantId: null }],
        ['platform, no tenant', { scope: 'platform', tenantId: null }],
      ] as const;
      for (const [label, ctx] of contexts) {
        await inTx(app, ctx, async () => {
          const sel = await attempt(app, `select count(*)::int as n from ${T} where ${K} is not null`);
          if (denial(sel) === 'privilege') {
            note(t.name, label, 'denied (privilege)');
            return;
          }
          expect(sel.ok, `${t.name} (${label}): ${sel.ok ? '' : sel.message}`).toBe(true);
          expect(sel.ok && sel.rows[0]!.n, `${t.name} leaks tenant rows with context ${label}`).toBe(0);
          // UPDATE / DELETE must also touch nothing (asserted, not tabulated).
          expectNoEffect(t.name, `${label} update`, await attempt(app, `update ${T} set ${K} = ${K} where ${K} is not null`), false);
          expectNoEffect(t.name, `${label} delete`, await attempt(app, `delete from ${T} where ${K} is not null`), false);
          note(t.name, label, '0 rows');
        });
      }
    });
  });
}
