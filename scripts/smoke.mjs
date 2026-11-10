#!/usr/bin/env node
// API smoke test for the running demo. Exercises the main routes and proves tenant isolation:
// Lotus Nursing Home (Demo) must not see Sunrise Care's patients, invoices, users or locations.
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
  const ownerPatients = await owner.get('/api/v1/tenant/patients?pageSize=100');
  check('owner sees patients at the current location', ownerPatients.status === 200 && ownerPatients.json?.total > 0, `status ${ownerPatients.status}`);

  console.log('\nSunrise Care, front desk (Mumbai)');
  const desk = new Client('sunrise front desk');
  await desk.login('frontdesk@sunrise.demo');
  const deskList = await desk.get('/api/v1/tenant/patients?pageSize=100');
  const sunPatients = items(deskList);
  check('GET /tenant/patients (Mumbai)', deskList.status === 200 && sunPatients.length === 14, `status ${deskList.status} n=${sunPatients.length}`);
  check('every patient is flagged sample', sunPatients.every((p) => p.isSample === true));
  check('dates come back as DD/MM/YYYY too', sunPatients.every((p) => /^\d{2}\/\d{2}\/\d{4}$/.test(p.dobDisplay)));
  check('mobiles are +91', sunPatients.every((p) => /^\+91[6-9]\d{9}$/.test(p.mobile)));
  const search = await desk.get('/api/v1/tenant/patients?q=patil');
  check('patient search by name', search.status === 200 && items(search).length >= 1);
  const onePatient = sunPatients[0];
  if (onePatient) {
    const detail = await desk.get(`/api/v1/tenant/patients/${onePatient.id}`);
    check('GET /tenant/patients/:id', detail.status === 200 && detail.json?.uhid === onePatient.uhid, `status ${detail.status}`);
  }

  console.log('\nRole checks');
  const doctor = new Client('sunrise doctor');
  await doctor.login('doctor@sunrise.demo');
  check('doctor cannot list staff (users.view)', (await doctor.get('/api/v1/tenant/users')).status === 403);
  const cashier = new Client('sunrise cashier');
  await cashier.login('cashier@sunrise.demo');
  check('cashier cannot open the patient register', (await cashier.get('/api/v1/tenant/patients')).status === 403);
  check('cashier cannot read the audit log', (await cashier.get('/api/v1/tenant/audit')).status === 403);
  const indoreDesk = new Client('sunrise indore desk');
  await indoreDesk.login('frontdesk.indore@sunrise.demo');
  const indoreList = items(await indoreDesk.get('/api/v1/tenant/patients?pageSize=100'));
  check('Indore front desk sees only Indore patients', indoreList.length === 13 && indoreList.every((p) => p.uhid.includes('-IDR-')), `n=${indoreList.length}`);
  if (onePatient) {
    check('Indore front desk cannot open a Mumbai patient', (await indoreDesk.get(`/api/v1/tenant/patients/${onePatient.id}`)).status === 404);
  }

  console.log('\nLotus Nursing Home (tenant B) must not see tenant A');
  const lotus = new Client('lotus owner');
  await lotus.login('owner@lotus.demo');
  const lotusList = items(await lotus.get('/api/v1/tenant/patients?pageSize=100'));
  check('Lotus sees its own 5 patients', lotusList.length === 5 && lotusList.every((p) => p.uhid.startsWith('DEMO-LOT-')), `n=${lotusList.length}`);
  const sunIds = new Set(sunPatients.map((p) => p.id));
  check('no Sunrise patient in the Lotus list', lotusList.every((p) => !sunIds.has(p.id)));
  if (onePatient) {
    check('Lotus GET Sunrise patient by id is 404', (await lotus.get(`/api/v1/tenant/patients/${onePatient.id}`)).status === 404);
  }
  if (sunInvoices[0]) {
    const r1 = await lotus.get(`/api/v1/billing/invoices/${sunInvoices[0].id}`);
    check('Lotus GET Sunrise invoice is 404', r1.status === 404, `status ${r1.status}`);
    const r2 = await lotus.get(`/api/v1/billing/invoices/${sunInvoices[0].id}/pdf`);
    check('Lotus GET Sunrise invoice PDF is 404', r2.status === 404, `status ${r2.status}`);
  }
  const lotusLocs = items(await lotus.get('/api/v1/tenant/locations'));
  check('Lotus sees only its Pune location', lotusLocs.length === 1 && lotusLocs[0]?.code === 'PUN', JSON.stringify(lotusLocs.map((l) => l.code)));
  const lotusUsers = items(await lotus.get('/api/v1/tenant/users?pageSize=100'));
  check('Lotus staff list has no sunrise.demo accounts', lotusUsers.length > 0 && lotusUsers.every((u) => !u.email.endsWith('@sunrise.demo')));
  if (sunLocs[1]) {
    const sw = await lotus.call('POST', '/api/v1/auth/switch-location', { locationId: sunLocs[1].id });
    check('Lotus cannot switch into a Sunrise location', sw.status >= 400 && sw.status < 500, `status ${sw.status}`);
  }

  console.log('\nApp Admin');
  const admin = new Client('app admin');
  await admin.login(ADMIN_EMAIL, ADMIN_PASSWORD);
  check('GET /admin/overview', (await admin.get('/api/v1/admin/overview')).status === 200);
  const tenants = await admin.get('/api/v1/admin/tenants?pageSize=100');
  check('App Admin lists both demo tenants', tenants.status === 200 && items(tenants).length >= 2, `status ${tenants.status}`);
  check('platform audit chain verifies', (await admin.get('/api/v1/admin/audit/verify')).status === 200);
  check('a tenant session cannot call admin routes', (await owner.get('/api/v1/admin/overview')).status >= 401);

  if (process.argv.includes('--db')) await dbChecks();

  for (const c of [owner, desk, doctor, cashier, indoreDesk, lotus, admin]) await c.call('POST', '/api/v1/auth/logout', {}).catch(() => {});

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
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
    const none = await one('select count(*)::int as n from patients');
    check('no tenant set: 0 patients visible', none.n === 0, `n=${none.n}`);
    const lotus = await one('select tenant_id from hos_login_lookup($1)', ['owner@lotus.demo']).catch(() => null);
    const lotusTenant = lotus?.tenant_id ?? null;
    if (!lotusTenant) {
      check('look up the Lotus tenant id', false, 'hos_login_lookup returned nothing');
      return;
    }
    await client.query('begin');
    await client.query("select set_config('app.scope', 'tenant', true), set_config('app.tenant_id', $1, true)", [lotusTenant]);
    const seen = await one("select count(*)::int as n, count(*) filter (where uhid not like 'DEMO-LOT-%')::int as foreign from patients");
    check('as Lotus: only Lotus patients visible', seen.n === 5 && seen.foreign === 0, JSON.stringify(seen));
    const sneaky = await client
      .query("update patients set first_name = first_name where uhid like 'DEMO-SUN-%'")
      .then((r) => r.rowCount)
      .catch(() => -1);
    check('as Lotus: updating Sunrise patients touches 0 rows', sneaky === 0, `rowCount ${sneaky}`);
    const del = await client.query('delete from patients').then(() => 'allowed').catch((e) => e.code);
    check('hos_app has no DELETE on patients', del === '42501', `got ${del}`);
    await client.query('rollback');
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error(`smoke test aborted: ${err.message}`);
  process.exit(1);
});
