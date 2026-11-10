#!/usr/bin/env node
// API smoke test for the running demo. Exercises the main routes and proves tenant isolation: a second hospital must
// not see Sunrise Care's invoices, users, locations or patients. The second hospital is the Lotus demo tenant when it
// exists (Phase B seed); otherwise the script signs up a throwaway hospital through the real signup + mock OTP flow.
// Patient checks run against the Phase B route /api/v1/tenant/clinical/patients and are skipped until it exists.
//
//   npm run demo            # in another terminal (or: npm run dev with a seeded database)
//   npm run smoke           # = node scripts/smoke.mjs
//
// Options: API_URL (default http://127.0.0.1:4400), --db to also check RLS directly in Postgres as hos_app.
// Uses only the seeded MOCK demo accounts. Exit code 0 = all checks passed.

const API = (process.env.API_URL || 'http://127.0.0.1:4400').replace(/\/$/, '');
const PASSWORD = process.env.DEMO_PASSWORD || 'Demo@12345';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@hospitalos.test';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345';

let passed = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`  ok    ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ''}`);
  }
}

class Client {
  constructor(label) {
    this.label = label;
    this.cookie = '';
  }
  async call(method, path, body) {
    const headers = { accept: 'application/json' };
    if (this.cookie) headers.cookie = this.cookie;
    if (method !== 'GET') {
      headers['x-hos-csrf'] = '1';
      headers['content-type'] = 'application/json';
    }
    const res = await fetch(`${API}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const setCookie = res.headers.getSetCookie?.() ?? [];
    for (const c of setCookie) {
      const [pair] = c.split(';');
      if (pair.startsWith('hos_session=')) this.cookie = pair;
    }
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: res.status, json };
  }
  get(path) {
    return this.call('GET', path);
  }
  async login(email, password = PASSWORD) {
    const res = await this.call('POST', '/api/v1/auth/login', { email, password });
    check(`${this.label}: login ${email}`, res.status === 200 && this.cookie !== '', `status ${res.status} ${JSON.stringify(res.json)?.slice(0, 160)}`);
    return res;
  }
}

const items = (res) => (Array.isArray(res.json) ? res.json : res.json?.items ?? []);

async function main() {
  console.log(`Hospital OS smoke test against ${API}`);

  console.log('\nPublic');
  const anon = new Client('anon');
  const health = await anon.get('/api/v1/health');
  check('GET /health', health.status === 200 && health.json?.ok === true, `status ${health.status}`);
  if (health.status !== 200) throw new Error('API is not reachable. Start it with `npm run demo` or `npm run dev:api`.');
  const catalog = await anon.get('/api/v1/catalog');
  check('GET /catalog lists plans', catalog.status === 200 && Array.isArray(catalog.json?.plans) && catalog.json.plans.length >= 3, `status ${catalog.status}`);
  check('GET /privacy-notice/current', (await anon.get('/api/v1/privacy-notice/current')).status === 200);
  check('tenant route without a session is 401', (await anon.get('/api/v1/tenant/dashboard')).status === 401);
  check('admin route without a session is 401', (await anon.get('/api/v1/admin/overview')).status === 401);
  const noCsrf = await fetch(`${API}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@sunrise.demo', password: PASSWORD }) });
  check('POST without x-hos-csrf is rejected', noCsrf.status >= 400 && noCsrf.status < 500, `status ${noCsrf.status}`);
  const bad = await anon.call('POST', '/api/v1/auth/login', { email: 'owner@sunrise.demo', password: 'wrong-password-1' });
  check('wrong password is 401', bad.status === 401, `status ${bad.status}`);

  console.log('\nSunrise Care (tenant A), owner');
  const owner = new Client('sunrise owner');
  await owner.login('owner@sunrise.demo');
  check('GET /auth/me', (await owner.get('/api/v1/auth/me')).status === 200);
  const dash = await owner.get('/api/v1/tenant/dashboard');
  check('GET /tenant/dashboard', dash.status === 200 && dash.json?.counts?.locations === 3, `status ${dash.status} locations ${dash.json?.counts?.locations}`);
  const sunLocs = items(await owner.get('/api/v1/tenant/locations'));
  check('3 locations: Mumbai, Indore, Jaipur', ['MUM', 'IDR', 'JAI'].every((c) => sunLocs.some((l) => l.code === c)), JSON.stringify(sunLocs.map((l) => l.code)));
  const sunUsers = await owner.get('/api/v1/tenant/users?pageSize=100');
  check('GET /tenant/users has staff for every role', sunUsers.status === 200 && (sunUsers.json?.total ?? 0) >= 20, `total ${sunUsers.json?.total}`);
  check('GET /tenant/entitlements', (await owner.get('/api/v1/tenant/entitlements')).status === 200);
  check('GET /billing/subscription', (await owner.get('/api/v1/billing/subscription')).status === 200);
  const invoices = await owner.get('/api/v1/billing/invoices');
  const sunInvoices = items(invoices);
  check('GET /billing/invoices has the onboarding invoice', invoices.status === 200 && sunInvoices.length >= 1, `status ${invoices.status}`);
  const verify = await owner.get('/api/v1/tenant/audit/verify');
  check('audit chain verifies', verify.status === 200 && (verify.json?.ok === true || verify.json?.valid === true), JSON.stringify(verify.json)?.slice(0, 160));

  console.log('\nRole checks');
  const doctor = new Client('sunrise doctor');
  await doctor.login('doctor@sunrise.demo');
  check('doctor cannot list staff (users.view)', (await doctor.get('/api/v1/tenant/users')).status === 403);
  const cashier = new Client('sunrise cashier');
  await cashier.login('cashier@sunrise.demo');
  check('cashier cannot read the audit log', (await cashier.get('/api/v1/tenant/audit')).status === 403);
  check('cashier cannot see privacy requests', (await cashier.get('/api/v1/tenant/privacy/requests')).status === 403);
  const indoreDesk = new Client('sunrise indore desk');
  await indoreDesk.login('frontdesk.indore@sunrise.demo');
  const indoreMe = await indoreDesk.get('/api/v1/auth/me');
  const indoreId = sunLocs.find((l) => l.code === 'IDR')?.id;
  check('Indore front desk works in Indore', indoreMe.status === 200 && JSON.stringify(indoreMe.json).includes(indoreId ?? 'missing'));
  const mumbaiId = sunLocs.find((l) => l.code === 'MUM')?.id;
  if (mumbaiId) {
    const sw = await indoreDesk.call('POST', '/api/v1/auth/switch-location', { locationId: mumbaiId });
    check('Indore front desk cannot switch to Mumbai', sw.status >= 400 && sw.status < 500, `status ${sw.status}`);
  }

  // Patients (Phase B route). 404 with no body code means the route is not built yet.
  const desk = new Client('sunrise front desk');
  await desk.login('frontdesk@sunrise.demo');
  const PATIENTS = '/api/v1/tenant/clinical/patients';
  const deskList = await desk.get(`${PATIENTS}?pageSize=100`);
  const patientsLive = deskList.status !== 404;
  let sunPatients = [];
  if (!patientsLive) {
    console.log(`  skip  patient checks (${PATIENTS} not built yet; Phase B)`);
  } else {
    console.log('\nSunrise Care patients (Mumbai front desk)');
    sunPatients = items(deskList);
    check(`GET ${PATIENTS}`, deskList.status === 200 && sunPatients.length > 0, `status ${deskList.status} n=${sunPatients.length}`);
    const demo = sunPatients.filter((p) => String(p.uhid).startsWith('DEMO-SUN-'));
    check('sample patients from the demo seed are listed', demo.length > 0, `n=${demo.length}`);
    if (sunPatients[0]) check(`GET ${PATIENTS}/:id`, (await desk.get(`${PATIENTS}/${sunPatients[0].id}`)).status === 200);
  }

  console.log('\nSecond hospital (tenant B) must not see tenant A');
  const other = new Client('tenant B');
  let otherLabel = 'Lotus';
  const lotusLogin = await other.call('POST', '/api/v1/auth/login', { email: 'owner@lotus.demo', password: PASSWORD });
  if (lotusLogin.status === 200 && other.cookie) {
    check('tenant B: login owner@lotus.demo', true);
  } else {
    otherLabel = 'throwaway signup';
    await signUpThrowaway(other);
  }
  if (sunInvoices[0]) {
    const r1 = await other.get(`/api/v1/billing/invoices/${sunInvoices[0].id}`);
    check(`${otherLabel}: GET Sunrise invoice is 404`, r1.status === 404, `status ${r1.status}`);
    const r2 = await other.get(`/api/v1/billing/invoices/${sunInvoices[0].id}/pdf`);
    check(`${otherLabel}: GET Sunrise invoice PDF is 404`, r2.status === 404, `status ${r2.status}`);
  }
  const otherInvoices = items(await other.get('/api/v1/billing/invoices'));
  const sunInvoiceIds = new Set(sunInvoices.map((i) => i.id));
  check(`${otherLabel}: invoice list has no Sunrise invoice`, otherInvoices.every((i) => !sunInvoiceIds.has(i.id)));
  if (sunLocs[1]) {
    const sw = await other.call('POST', '/api/v1/auth/switch-location', { locationId: sunLocs[1].id });
    check(`${otherLabel}: cannot switch into a Sunrise location`, sw.status >= 400 && sw.status < 500, `status ${sw.status}`);
  }
  if (otherLabel === 'Lotus') {
    const lotusLocs = items(await other.get('/api/v1/tenant/locations'));
    const sunLocIds = new Set(sunLocs.map((l) => l.id));
    check('Lotus: no Sunrise location in its list', lotusLocs.length > 0 && lotusLocs.every((l) => !sunLocIds.has(l.id)));
    const lotusUsers = items(await other.get('/api/v1/tenant/users?pageSize=100'));
    check('Lotus: staff list has no sunrise.demo accounts', lotusUsers.length > 0 && lotusUsers.every((u) => !u.email.endsWith('@sunrise.demo')));
    if (patientsLive) {
      const lotusPatients = items(await other.get(`${PATIENTS}?pageSize=100`));
      const sunIds = new Set(sunPatients.map((p) => p.id));
      check('Lotus: no Sunrise patient in its list', lotusPatients.every((p) => !sunIds.has(p.id)));
      if (sunPatients[0]) check('Lotus: GET Sunrise patient by id is 404', (await other.get(`${PATIENTS}/${sunPatients[0].id}`)).status === 404);
    }
  } else {
    check('throwaway hospital is held in onboarding (no workspace yet)', (await other.get('/api/v1/tenant/users')).status === 403);
  }

  console.log('\nApp Admin');
  const admin = new Client('app admin');
  await admin.login(ADMIN_EMAIL, ADMIN_PASSWORD);
  check('GET /admin/overview', (await admin.get('/api/v1/admin/overview')).status === 200);
  const tenants = await admin.get('/api/v1/admin/tenants?pageSize=100');
  check('App Admin lists hospitals', tenants.status === 200 && items(tenants).length >= 2, `status ${tenants.status}`);
  check('platform audit chain verifies', (await admin.get('/api/v1/admin/audit/verify')).status === 200);
  check('a tenant session cannot call admin routes', (await owner.get('/api/v1/admin/overview')).status >= 401);

  if (process.argv.includes('--db')) await dbChecks();

  for (const c of [owner, desk, doctor, cashier, indoreDesk, other, admin]) await c.call('POST', '/api/v1/auth/logout', {}).catch(() => {});

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

/** Sign up a fresh hospital with the mock OTP (needs MOCK_EXPOSE_SECRETS=true, the dev default). */
async function signUpThrowaway(client) {
  const notice = await client.get('/api/v1/privacy-notice/current');
  const stamp = Date.now().toString().slice(-8);
  const res = await client.call('POST', '/api/v1/auth/signup', {
    name: 'Smoke Test Owner',
    email: `smoke.${stamp}@smoke.test`,
    mobile: `90009${stamp.slice(-5)}`,
    password: 'Smoke@12345',
    designation: 'owner',
    acceptTerms: true,
    acceptPrivacy: true,
    productUpdates: false,
    noticeVersion: notice.json?.version ?? '1',
  });
  check('throwaway signup', res.status === 200 && !!res.json?.challengeId, `status ${res.status} ${JSON.stringify(res.json)?.slice(0, 160)}`);
  if (!res.json?.devCode) {
    check('mock OTP is exposed (MOCK_EXPOSE_SECRETS=true)', false);
    return;
  }
  const v = await client.call('POST', '/api/v1/auth/otp/verify', { challengeId: res.json.challengeId, code: res.json.devCode });
  check('throwaway OTP verify signs in', v.status === 200 && client.cookie !== '', `status ${v.status}`);
}

/** Straight to Postgres as hos_app (the API's role): RLS, not app code, has to hide the other tenant. */
async function dbChecks() {
  console.log('\nPostgres RLS as hos_app');
  const { default: pg } = await import('pg');
  const url = process.env.DATABASE_URL || 'postgres://hos_app:hos_dev_app@127.0.0.1:55432/hospital_os';
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const one = async (q, params = []) => (await client.query(q, params)).rows[0];
    const tables = ['users', 'locations', 'invoices', 'audit_log'];
    const hasPatients = (await one("select to_regclass('public.patients') is not null as ok")).ok;
    if (hasPatients) tables.push('patients');
    for (const t of tables) {
      const r = await one(`select count(*)::int as n from ${t}`);
      check(`no tenant set: 0 rows in ${t}`, r.n === 0, `n=${r.n}`);
    }
    const sun = await one('select tenant_id from hos_login_lookup($1)', ['owner@sunrise.demo']);
    if (!sun?.tenant_id) {
      check('look up the Sunrise tenant id', false);
      return;
    }
    // Pretend to be some other tenant (a random id): Sunrise rows must be invisible and untouchable.
    await client.query('begin');
    await client.query("select set_config('app.scope', 'tenant', true), set_config('app.tenant_id', gen_random_uuid()::text, true)");
    for (const t of tables) {
      const r = await one(`select count(*)::int as n from ${t} where tenant_id = $1`, [sun.tenant_id]);
      check(`as another tenant: 0 Sunrise rows in ${t}`, r.n === 0, `n=${r.n}`);
    }
    const upd = await client.query('update locations set name = name where tenant_id = $1', [sun.tenant_id]);
    check('as another tenant: UPDATE of Sunrise locations touches 0 rows', upd.rowCount === 0, `rowCount ${upd.rowCount}`);
    const ins = await client
      .query("insert into locations (tenant_id, name, code, state_code) values ($1, 'x', 'ZZZ', '27')", [sun.tenant_id])
      .then(() => 'inserted')
      .catch((e) => e.code);
    check('as another tenant: INSERT into Sunrise is refused (42501)', ins === '42501', `got ${ins}`);
    await client.query('rollback');
    await client.query('begin');
    await client.query("select set_config('app.scope', 'tenant', true), set_config('app.tenant_id', $1, true)", [sun.tenant_id]);
    const own = await one('select count(*)::int as n from locations');
    check('as Sunrise: its 3 locations are visible', own.n === 3, `n=${own.n}`);
    const del = await client.query('delete from audit_log').then(() => 'allowed').catch((e) => e.code);
    check('audit_log DELETE is refused', del !== 'allowed', `got ${del}`);
    await client.query('rollback');
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error(`smoke test aborted: ${err.message}`);
  process.exit(1);
});
