// DB-level tenant isolation (audit P0-3). Connects as hos_app — the API's role — and proves Postgres itself
// (row-level security plus grants) keeps two tenants apart. The table list comes from pg_catalog at run time.
//
// Database is hos_u1 (HOS_RLS_DATABASE_URL), never hos_test. Fixtures create both tenants. If Postgres is down
// the suite skips; a missing policy, a missing FORCE, or a missing fixture row fails the run.
import { afterAll, describe, expect, it } from 'vitest';
import { TENANT_A, TENANT_B } from './fixtures';
import {
  APP_ROLE,
  type Attempt,
  type Denial,
  type RlsReady,
  type TenantFixture,
  attempt,
  close,
  denial,
  fingerprint,
  ident,
  inTx,
  setScope,
  tryStartRls,
} from './helpers';

const ready = await tryStartRls();

if (!ready.ok) {
  describe.skip(ready.reason, () => {
    it('Postgres is unreachable', () => {});
  });
} else {
  await runSuite(ready);
}

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

/** Tables the catalogue query must keep finding. A new tenant table is still tested; it fails until it has a fixture. */
const KNOWN_TABLES = [
  'tenants',
  'locations',
  'departments',
  'doctors',
  'users',
  'user_location_roles',
  'roles',
  'invitations',
  'otp_challenges',
  'subscriptions',
  'subscription_items',
  'orders',
  'payments',
  'invoices',
  'invoice_lines',
  'tenant_entitlement_overrides',
  'consents',
  'data_principal_requests',
  'checklist_items',
  'outbox_messages',
  'idempotency_keys',
  'sessions',
  'audit_log',
  'number_series',
  'patients',
  'patient_alerts',
  'encounters',
  'services',
  'tariffs',
  'clinical_orders',
  'clinical_order_items',
  'vital_signs',
  'clinical_notes',
  'charges',
  'cash_ledger',
] as const;

async function runSuite(ready: Extract<RlsReady, { ok: true }>): Promise<void> {
  const { owner, app, database, tenantA, tenantB } = ready;

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

  const report: Record<string, Record<string, string>> = {};
  function note(table: string, op: string, outcome: string): void {
    (report[table] ??= {})[op] = outcome;
  }

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
    expect(d, `${table} ${op}: expected a rejection, got ${a.ok ? `success (${a.rowCount} rows)` : `${a.code} ${a.message}`}`).not.toBeNull();
    expect(allowed, `${table} ${op}: rejection was ${d}`).toContain(d);
    note(table, op, `denied (${d})`);
  }

  async function insertableColumns(t: TableInfo): Promise<string[]> {
    const r = await owner.query<{ attname: string }>(
      `select attname from pg_attribute
        where attrelid = $1::regclass and attnum > 0 and not attisdropped and attgenerated = '' and attidentity <> 'a'
        order by attnum`,
      [t.name],
    );
    return r.rows.map((x) => x.attname);
  }

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
    console.log(`\nDB RLS report (${database}; A=${TENANT_A.slug}, B=${TENANT_B.slug})`);
    console.table(rows);
    await close(owner);
    await close(app);
  });

  describe('roles and catalogue', () => {
    it('hos_app is not superuser, cannot bypass RLS, owns nothing and is not a member of any role', async () => {
      const role = await app.query(
        'select rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolinherit from pg_roles where rolname = current_user',
      );
      expect(role.rows[0]).toEqual({
        rolsuper: false,
        rolbypassrls: false,
        rolcreaterole: false,
        rolcreatedb: false,
        rolinherit: false,
      });
      const owned = await app.query(
        `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and pg_get_userbyid(c.relowner) = current_user`,
      );
      expect(owned.rows).toEqual([]);
      const member = await app.query(
        `select r.rolname from pg_auth_members m join pg_roles r on r.oid = m.roleid
          where m.member = current_user::regrole`,
      );
      expect(member.rows).toEqual([]);
      expect(tenantA.id).not.toBe(tenantB.id);
    });

    it('discovers every known tenant table from pg_catalog', () => {
      const names = tables.map((t) => t.name);
      expect(names.length).toBeGreaterThan(0);
      for (const known of KNOWN_TABLES) expect(names, `catalogue query missed ${known}`).toContain(known);
    });

    it('cannot assume the migrator role, disable RLS, or turn row_security off to read another tenant', async () => {
      await inTx(app, { scope: 'tenant', tenantId: tenantA.id }, async () => {
        expectDenied('session', 'set role', await attempt(app, 'set role hos_migrator'));
        expectDenied('locations', 'disable rls', await attempt(app, 'alter table locations disable row level security'));
        await app.query('set local row_security = off');
        const sel = await attempt(app, 'select count(*)::int as n from locations');
        expect(sel.ok, 'row_security=off must not return rows').toBe(false);
        if (!sel.ok) expect(sel.message.toLowerCase()).toMatch(/row-level security/);
      });
    });

    it('cannot read sessions, invoice_sequences or _migrations', async () => {
      await inTx(app, { scope: 'tenant', tenantId: tenantA.id }, async () => {
        for (const table of ['sessions', 'invoice_sequences', '_migrations']) {
          expectDenied(table, 'select', await attempt(app, `select * from ${ident(table)}`));
        }
      });
    });

    it('drops the transaction-local tenant id when the transaction ends', async () => {
      await inTx(app, { scope: 'tenant', tenantId: tenantA.id }, async () => {
        const inside = await app.query<{ t: string | null }>("select current_setting('app.tenant_id', true) as t");
        expect(inside.rows[0]!.t).toBe(tenantA.id);
      });
      const outside = await app.query<{ t: string | null }>("select current_setting('app.tenant_id', true) as t");
      expect(outside.rows[0]!.t ?? '').toBe('');
    });
  });

  for (const t of tables) {
    describe(t.name, () => {
      it('has row-level security enabled and forced (or is not readable by hos_app)', () => {
        expect(t.owner, `${t.name} must not be owned by ${APP_ROLE}`).not.toBe(APP_ROLE);
        if (t.kind === 'r' || t.kind === 'p') {
          expect(t.rls, `${t.name}: ENABLE ROW LEVEL SECURITY is missing`).toBe(true);
          expect(t.force, `${t.name}: FORCE ROW LEVEL SECURITY is missing`).toBe(true);
        } else if (t.kind === 'v') {
          expect(t.securityInvoker || !t.priv.select, `${t.name}: view readable by ${APP_ROLE} needs security_invoker=true`).toBe(true);
        } else {
          expect(t.priv.select, `${t.name}: ${t.kind === 'm' ? 'materialized view' : 'foreign table'} has no RLS`).toBe(false);
        }
      });

      it('keeps tenants apart: SELECT, INSERT, UPDATE and DELETE', async () => {
        if (t.kind !== 'r' && t.kind !== 'p') return;
        const beforeA = await fingerprint(owner, t.name, t.key, tenantA.id);
        const beforeB = await fingerprint(owner, t.name, t.key, tenantB.id);
        expect(beforeA.n, `${t.name} has no fixture row for tenant A (${TENANT_A.slug}). Add one under tests/db-rls/fixtures/ and register it from fixtures/index.ts`).toBeGreaterThan(0);
        expect(beforeB.n, `${t.name} has no fixture row for tenant B (${TENANT_B.slug}). Add one under tests/db-rls/fixtures/ and register it from fixtures/index.ts`).toBeGreaterThan(0);

        const T = ident(t.name);
        const K = ident(t.key);
        const cols = (await insertableColumns(t)).map(ident).join(', ');
        const updCol = ident(await updatableColumn(t));
        const pairs: [TenantFixture, TenantFixture, { n: number; fp: string }][] = [
          [tenantA, tenantB, beforeB],
          [tenantB, tenantA, beforeA],
        ];

        for (const [attacker, victim, beforeVictim] of pairs) {
          const victimRow = (await owner.query(`select to_jsonb(x) as j from ${T} x where ${K} = $1 limit 1`, [victim.id])).rows[0]!.j;
          const record = attacker.id === tenantA.id;
          await inTx(app, { scope: 'tenant', tenantId: attacker.id }, async () => {
            if (t.priv.select) {
              const own = await app.query<{ n: number }>(`select count(*)::int as n from ${T} where ${K} = $1`, [attacker.id]);
              expect(own.rows[0]!.n, `${t.name}: tenant cannot see its own rows`).toBe(attacker.id === tenantA.id ? beforeA.n : beforeB.n);
            }

            const sel = await attempt(
              app,
              `select count(*)::int as n from ${T} where ${K} = $1`,
              [victim.id],
            );
            if (denial(sel) === 'privilege') {
              if (record) note(t.name, 'select', 'denied (privilege)');
            } else {
              expect(sel.ok, `${t.name} select: ${sel.ok ? '' : sel.message}`).toBe(true);
              expect(sel.ok && sel.rows[0]!.n, `${t.name}: tenant sees the other tenant's rows`).toBe(0);
              if (record) note(t.name, 'select', '0 rows');
            }

            // Copy of the victim row, so tenant_id (or tenants.id) stays the other tenant's. RLS runs before unique checks.
            const ins = await attempt(
              app,
              `insert into ${T} (${cols}) select ${cols} from jsonb_populate_record(null::${T}, $1::jsonb)`,
              [victimRow],
            );
            expectDenied(t.name, 'insert', ins);

            // 0 rows when RLS hides the victim. 42501 when UPDATE/DELETE was revoked (table or column).
            // A trigger rejection (append-only, immutable, P0001) is the same pass. The fingerprint below
            // still has to match, so a denial that changed the victim's rows fails the test.
            expectNoEffect(t.name, 'update', await attempt(app, `update ${T} set ${updCol} = ${updCol} where ${K} = $1`, [victim.id]), record);
            expectNoEffect(t.name, 'delete', await attempt(app, `delete from ${T} where ${K} = $1`, [victim.id]), record);

            // 42501 when WITH CHECK sees the row (typical tenant policy). 0 rows when USING hides it first,
            // which is how tenant_entitlement_overrides behaves outside platform scope: the row stays put.
            const move = await attempt(app, `update ${T} set ${K} = $1 where ${K} = $2`, [victim.id, attacker.id]);
            expectNoEffect(t.name, 'move-own-row', move, record);

            // Same transaction, now as the victim: uncommitted writes would be visible here. Rollback follows.
            await setScope(app, 'tenant', victim.id);
            if (t.priv.select) {
              const after = await fingerprint(app, t.name, t.key, victim.id);
              expect(after.n, `${t.name}: victim row count changed`).toBe(beforeVictim.n);
              expect(after.fp, `${t.name}: victim rows changed`).toBe(beforeVictim.fp);
              if (record) note(t.name, 'unchanged as victim', 'matched');
            } else if (record) {
              note(t.name, 'unchanged as victim', 'no SELECT grant; writes were rejected');
            }
          });
        }
      });

      it('returns no tenant rows without a tenant context', async () => {
        if (t.kind !== 'r' && t.kind !== 'p') return;
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
            } else {
              expect(sel.ok, `${t.name} (${label}): ${sel.ok ? '' : sel.message}`).toBe(true);
              expect(sel.ok && sel.rows[0]!.n, `${t.name} leaks tenant rows with context ${label}`).toBe(0);
              note(t.name, label, '0 rows');
            }
            expectNoEffect(t.name, `${label} update`, await attempt(app, `update ${T} set ${K} = ${K} where ${K} is not null`), false);
            expectNoEffect(t.name, `${label} delete`, await attempt(app, `delete from ${T} where ${K} is not null`), false);
          });
        }
        await inTx(app, null, async () => {
          await app.query("select set_config('app.tenant_id', 'not-a-uuid', true)");
          const sel = await attempt(app, `select count(*)::int as n from ${T}`);
          expect(sel.ok, `${t.name} accepted a garbage tenant id`).toBe(false);
          if (!sel.ok && t.priv.select) expect(sel.code, `${t.name} garbage tenant id: ${sel.message}`).toBe('22P02');
        });
      });
    });
  }

  describe('audit_log triggers', () => {
    it('keeps the append-only triggers, and the chain trigger overwrites client hashes', async () => {
      const triggers = await app.query<{ tgname: string; tgenabled: string }>(
        `select tgname, tgenabled::text as tgenabled from pg_trigger
          where tgrelid = 'public.audit_log'::regclass and not tgisinternal`,
      );
      const enabled = new Map(triggers.rows.map((r) => [r.tgname, r.tgenabled]));
      for (const name of ['audit_log_chain', 'audit_log_no_truncate', 'audit_log_no_update']) {
        expect(enabled.get(name), `${name} is missing or disabled`).toBe('O');
      }

      const before = await fingerprint(owner, 'audit_log', 'tenant_id', tenantB.id);
      await inTx(app, { scope: 'tenant', tenantId: tenantA.id }, async () => {
        // hos_app has no UPDATE/DELETE grant, so the reject trigger is not reached. The grant is what stops the write.
        // A future grant would hit audit_log_reject (42501, 'append-only') instead. Either rejection is correct.
        for (const sql of [
          ['update', 'update audit_log set action = action where tenant_id = $1', [tenantB.id]],
          ['delete', 'delete from audit_log where tenant_id = $1', [tenantB.id]],
          ['truncate', 'truncate audit_log', []],
        ] as const) {
          const a = await attempt(app, sql[1], [...sql[2]]);
          expect(['privilege', 'append-only'], `audit_log ${sql[0]}: ${a.ok ? 'succeeded' : a.message}`).toContain(denial(a));
        }
        const cross = await attempt(
          app,
          `insert into audit_log (tenant_id, actor_type, action, entity_type)
           values ($1, 'system', 'rls.probe.cross', 'tenant')`,
          [tenantB.id],
        );
        expectDenied('audit_log', 'insert other tenant', cross);

        const ins = await app.query<{
          seq: string;
          prev_hash: string;
          hash: string;
          chain_key: string;
          created_at: Date;
        }>(
          `insert into audit_log (tenant_id, actor_type, actor_label, action, entity_type, seq, prev_hash, hash, chain_key, created_at)
           values ($1, 'system', 'RLS chain (Sample)', 'rls.probe.chain', 'tenant', 424242, repeat('a', 64), repeat('b', 64), 'forged-chain', '2000-01-01T00:00:00Z')
           returning seq::text, prev_hash, hash, chain_key, created_at`,
          [tenantA.id],
        );
        const row = ins.rows[0]!;
        expect(row.seq).not.toBe('424242');
        expect(row.prev_hash).not.toBe('a'.repeat(64));
        expect(row.hash).not.toBe('b'.repeat(64));
        expect(row.hash).toMatch(/^[0-9a-f]{64}$/);
        expect(row.prev_hash).toMatch(/^[0-9a-f]{64}$/);
        expect(row.chain_key).toBe(tenantA.id);
        expect(new Date(row.created_at).getUTCFullYear()).toBeGreaterThan(2000);

        await setScope(app, 'tenant', tenantB.id);
        const after = await fingerprint(app, 'audit_log', 'tenant_id', tenantB.id);
        expect(after).toEqual(before);
      });
    });
  });

  describe('security definer functions', () => {
    it('login, otp and invite return only the documented identifiers', async () => {
      await inTx(app, { scope: 'tenant', tenantId: tenantA.id }, async () => {
        const lookupB = await app.query<Record<string, unknown>>('select * from hos_login_lookup($1)', [tenantB.spec.email]);
        expect(lookupB.rows).toHaveLength(1);
        expect(Object.keys(lookupB.rows[0]!).sort()).toEqual(['tenant_id', 'user_id']);
        expect(lookupB.rows[0]).toEqual({ tenant_id: tenantB.id, user_id: tenantB.userId });

        const lookupA = await app.query<{ tenant_id: string; user_id: string }>('select * from hos_login_lookup($1)', [tenantA.spec.email]);
        expect(lookupA.rows[0]).toEqual({ tenant_id: tenantA.id, user_id: tenantA.userId });

        const missing = await app.query('select * from hos_login_lookup($1)', ['nobody.rls@sbx']);
        expect(missing.rows).toHaveLength(0);
        const wildcard = await app.query('select * from hos_login_lookup($1)', [`${tenantB.spec.email}%`]);
        expect(wildcard.rows).toHaveLength(0);

        const otp = await app.query<{ tenant_id: string | null }>('select hos_otp_tenant($1) as tenant_id', [tenantB.otpId]);
        expect(Object.keys(otp.rows[0]!).sort()).toEqual(['tenant_id']);
        expect(otp.rows[0]!.tenant_id).toBe(tenantB.id);
        const otpMiss = await app.query<{ tenant_id: string | null }>(
          'select hos_otp_tenant($1) as tenant_id',
          ['00000000-0000-4000-8000-000000000099'],
        );
        expect(otpMiss.rows[0]!.tenant_id).toBeNull();

        const invite = await app.query<{ tenant_id: string | null }>('select hos_invite_tenant($1) as tenant_id', [tenantB.inviteToken]);
        expect(invite.rows[0]!.tenant_id).toBe(tenantB.id);
        const inviteMiss = await app.query<{ tenant_id: string | null }>("select hos_invite_tenant('not-a-real-invite') as tenant_id");
        expect(inviteMiss.rows[0]!.tenant_id).toBeNull();
      });
    });

    it('session resolve needs the exact token and does not list another tenant', async () => {
      await inTx(app, { scope: 'tenant', tenantId: tenantA.id }, async () => {
        const hit = await app.query<Record<string, unknown>>('select * from hos_session_resolve($1)', [tenantB.sessionToken]);
        expect(hit.rows).toHaveLength(1);
        expect(Object.keys(hit.rows[0]!).sort()).toEqual([
          'expires_at',
          'id',
          'kind',
          'location_id',
          'platform_admin_id',
          'tenant_id',
          'user_id',
        ]);
        expect(hit.rows[0]!.tenant_id).toBe(tenantB.id);
        expect(hit.rows[0]!.user_id).toBe(tenantB.userId);
        expect(hit.rows[0]!.kind).toBe('tenant');
        expect(hit.rows[0]).not.toHaveProperty('token_hash');

        for (const token of [tenantB.expiredSessionToken, tenantB.revokedSessionToken, 'no-such-token', tenantB.sessionToken.slice(0, 8)]) {
          const miss = await app.query('select * from hos_session_resolve($1)', [token]);
          expect(miss.rows, token).toHaveLength(0);
        }
        const own = await app.query<{ tenant_id: string }>('select * from hos_session_resolve($1)', [tenantA.sessionToken]);
        expect(own.rows).toHaveLength(1);
        expect(own.rows[0]!.tenant_id).toBe(tenantA.id);
      });
    });

    it('cannot create a session, switch location, or revoke a user in the other tenant', async () => {
      await inTx(app, { scope: 'tenant', tenantId: tenantA.id }, async () => {
        const created = await app.query<{ id: string }>(
          `select hos_session_create('rls-create-' || gen_random_uuid()::text, 'tenant', $1, null, $2, '127.0.0.1', 'rls-suite') as id`,
          [tenantA.userId, tenantA.locationId],
        );
        expect(created.rows[0]!.id).toMatch(/^[0-9a-f-]{36}$/);

        const crossUser = await attempt(
          app,
          `select hos_session_create('rls-create-' || gen_random_uuid()::text, 'tenant', $1, null, $2, '127.0.0.1', 'rls-suite')`,
          [tenantB.userId, tenantB.locationId],
        );
        expectDenied('hos_session_create', 'other user', crossUser);

        await app.query('select hos_session_set_location($1, $2)', [tenantA.sessionToken, tenantA.locationId]);
        const crossLoc = await attempt(app, 'select hos_session_set_location($1, $2)', [tenantA.sessionToken, tenantB.locationId]);
        expectDenied('hos_session_set_location', 'other location', crossLoc);

        const crossRevoke = await attempt(app, 'select hos_session_revoke_user($1)', [tenantB.userId]);
        expectDenied('hos_session_revoke_user', 'other user', crossRevoke);
        const still = await app.query('select * from hos_session_resolve($1)', [tenantB.sessionToken]);
        expect(still.rows).toHaveLength(1);

        // Revoke by an unknown hash returns void and does not kill the other tenant's session.
        await app.query("select hos_session_revoke('not-a-real-token')");
        const stillAfter = await app.query('select * from hos_session_resolve($1)', [tenantB.sessionToken]);
        expect(stillAfter.rows).toHaveLength(1);
      });
    });

    it('admin directory and invoice numbering stay inside their documented scope', async () => {
      await inTx(app, { scope: 'tenant', tenantId: tenantA.id }, async () => {
        expectDenied('hos_admin_tenant_list', 'tenant scope', await attempt(app, 'select * from hos_admin_tenant_list(null, null, 20, 0)'));
        expectDenied('hos_admin_overview', 'tenant scope', await attempt(app, 'select hos_admin_overview()'));
        // Numbering is allowed in tenant scope. It returns (fy, number) only — not another tenant's invoices.
        const numbered = await app.query<Record<string, unknown>>('select * from hos_next_invoice_number(now())');
        expect(numbered.rows).toHaveLength(1);
        expect(Object.keys(numbered.rows[0]!).sort()).toEqual(['fy', 'number']);
        const visible = await app.query<{ n: number }>('select count(*)::int as n from invoices where tenant_id = $1', [tenantB.id]);
        expect(visible.rows[0]!.n).toBe(0);
      });
      await inTx(app, null, async () => {
        expectDenied('hos_admin_tenant_list', 'no scope', await attempt(app, 'select * from hos_admin_tenant_list(null, null, 20, 0)'));
        expectDenied('hos_admin_overview', 'no scope', await attempt(app, 'select hos_admin_overview()'));
        expectDenied('hos_next_invoice_number', 'no scope', await attempt(app, 'select * from hos_next_invoice_number(now())'));
      });
    });

    // PLATFORM_SCOPE.md (option C, migration 0023) is not in this branch. hos_scope() still returns the GUC,
    // so hos_app can set app.scope=platform and the admin definers then return every tenant. Not fixed here.
    it('hos_app cannot self-assert platform scope and read every tenant via hos_admin_overview', async () => {
      await inTx(app, { scope: 'platform', tenantId: null }, async () => {
        const scope = await app.query<{ s: string }>('select hos_scope() as s');
        const got = scope.rows[0]?.s;
        const overview = await attempt(app, 'select hos_admin_overview() as j');
        expect(
          got,
          `hos_scope() returned '${got}' and hos_admin_overview ${overview.ok ? 'returned cross-tenant rows' : `raised (${overview.ok ? '' : overview.message})`}. PLATFORM_SCOPE.md requires 'none' and a raise for hos_app.`,
        ).toBe('none');
        expect(overview.ok).toBe(false);
      });
    });
  });
}
