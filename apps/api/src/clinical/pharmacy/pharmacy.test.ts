import { randomUUID } from 'node:crypto';
import { createDb, dbEnv, schema } from '@hos/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { clinicalFixture, closeClinicalPools, expectIsolation, type ClinicalFixture } from '../testkit';

const PREFIX = '/api/v1/tenant/m/pharmacy';
const app = await buildApp();
let fx: ClinicalFixture;

beforeAll(async () => {
  await app.ready();
  fx = await clinicalFixture();
}, 180_000);

afterAll(async () => {
  await app.close();
  await closeClinicalPools();
});

async function login(email: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { 'x-hos-csrf': '1' },
    payload: { email, password: fx.password },
  });
  expect(res.statusCode, res.body).toBe(200);
  const setCookie = res.headers['set-cookie'];
  const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return String(cookie).split(';')[0] ?? '';
}

function headers(cookie: string) {
  return { cookie, 'x-hos-csrf': '1', 'idempotency-key': randomUUID() };
}

async function createItem(cookie: string, brand: string, gstRateBp = 1200) {
  const supplier = await app.inject({
    method: 'POST',
    url: `${PREFIX}/suppliers`,
    headers: headers(cookie),
    payload: { name: `${brand} supplier`, city: 'Pune' },
  });
  expect(supplier.statusCode, supplier.body).toBe(201);
  const item = await app.inject({
    method: 'POST',
    url: `${PREFIX}/items`,
    headers: headers(cookie),
    payload: { genericCode: 'PARACETAMOL', brand, form: 'tablet', strength: '500 mg', hsn: '30049099', gstRateBp, reorderLevel: 0, schedule: 'OTC' },
  });
  expect(item.statusCode, item.body).toBe(201);
  return { supplierId: supplier.json().id as string, itemId: item.json().id as string };
}

async function receive(cookie: string, supplierId: string, itemId: string, batchNo: string, expiry: string, qty: number, mrpPaise: number) {
  const res = await app.inject({
    method: 'POST',
    url: `${PREFIX}/grns`,
    headers: headers(cookie),
    payload: { supplierId, lines: [{ itemId, batchNo, expiry, qty, mrpPaise, purchaseRatePaise: 8000 }] },
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json() as { id: string; number: string };
}

it('splits an inclusive MRP of ₹112 at 12% and blocks an expired batch', async () => {
  const cookie = await login(fx.sunrise.ownerEmail);
  const stamp = randomUUID().slice(0, 8);
  const { supplierId, itemId } = await createItem(cookie, `Split ${stamp}`);
  await receive(cookie, supplierId, itemId, `OLD-${stamp}`, '2020-01-01', 3, 11200);

  const expired = await app.inject({
    method: 'POST',
    url: `${PREFIX}/sales`,
    headers: headers(cookie),
    payload: { kind: 'outside', walkinName: 'Expired probe', mode: 'cash', lines: [{ itemId, qty: 1 }] },
  });
  expect(expired.statusCode, expired.body).toBe(422);
  expect(expired.json().error.code).toBe('expired_batch');

  await receive(cookie, supplierId, itemId, `GOOD-${stamp}`, '2030-01-01', 4, 11200);

  const sale = await app.inject({
    method: 'POST',
    url: `${PREFIX}/sales`,
    headers: headers(cookie),
    payload: { kind: 'outside', walkinName: 'Counter probe', mode: 'cash', lines: [{ itemId, qty: 1 }] },
  });
  expect(sale.statusCode, sale.body).toBe(201);
  const body = sale.json() as { taxablePaise: number; taxPaise: number; grossPaise: number; docType: string; lines: { taxablePaise: number; taxPaise: number }[] };
  expect(body.grossPaise).toBe(11200);
  expect(body.taxablePaise).toBe(10000);
  expect(body.taxPaise).toBe(1200);
  expect(body.lines[0]?.taxablePaise).toBe(10000);
  expect(body.lines[0]?.taxPaise).toBe(1200);
  expect(body.docType).toBe('tax_invoice');

  const stock = await app.inject({ method: 'GET', url: `${PREFIX}/stock`, headers: { cookie } });
  expect(stock.statusCode).toBe(200);
  const rows = (stock.json() as { itemId: string; batchNo: string; qty: number; expired: boolean }[]).filter((row) => row.itemId === itemId);
  const old = rows.find((row) => row.batchNo === `OLD-${stamp}`);
  expect(old?.qty).toBe(3);
  expect(old?.expired).toBe(true);
  const good = rows.find((row) => row.batchNo === `GOOD-${stamp}`);
  expect(good?.qty).toBe(3);
}, 60_000);

it('gives one success and one insufficient_stock when two sales take the last unit', async () => {
  const cookie = await login(fx.sunrise.ownerEmail);
  const stamp = randomUUID().slice(0, 8);
  const { supplierId, itemId } = await createItem(cookie, `Race ${stamp}`);
  await receive(cookie, supplierId, itemId, `LAST-${stamp}`, '2030-06-01', 1, 5000);
  const payload = { kind: 'outside', walkinName: 'Race', mode: 'cash', lines: [{ itemId, qty: 1 }] };
  const [a, b] = await Promise.all([
    app.inject({ method: 'POST', url: `${PREFIX}/sales`, headers: headers(cookie), payload }),
    app.inject({ method: 'POST', url: `${PREFIX}/sales`, headers: headers(cookie), payload }),
  ]);
  const codes = [a.statusCode, b.statusCode].sort();
  expect(codes, `${a.statusCode} ${a.body}\n${b.statusCode} ${b.body}`).toEqual([201, 409]);
  const failed = a.statusCode === 409 ? a : b;
  expect(failed.json().error.code).toBe('insufficient_stock');
}, 60_000);

it('posts an exempt IP charge and reverses it on return', async () => {
  const cookie = await login(fx.sunrise.ownerEmail);
  const stamp = randomUUID().slice(0, 8);
  const { supplierId, itemId } = await createItem(cookie, `Ward ${stamp}`);
  await receive(cookie, supplierId, itemId, `WARD-${stamp}`, '2030-06-01', 2, 11200);
  const encounters = await app.inject({
    method: 'GET',
    url: '/api/v1/tenant/clinical/encounters?kind=ipd&status=open',
    headers: { cookie },
  });
  expect(encounters.statusCode, encounters.body).toBe(200);
  const encounterId = (encounters.json() as { items: { id: string }[] }).items[0]?.id;
  expect(encounterId, 'seeded IPD encounter').toBeTruthy();
  const issue = await app.inject({
    method: 'POST',
    url: `${PREFIX}/ip-issues`,
    headers: headers(cookie),
    payload: { encounterId, lines: [{ itemId, qty: 1 }] },
  });
  expect(issue.statusCode, issue.body).toBe(201);
  const issued = issue.json() as { id: string; lines: { id: string; chargeId: string | null }[] };
  const charges = await app.inject({
    method: 'GET',
    url: `/api/v1/tenant/clinical/encounters/${encounterId}/charges`,
    headers: { cookie },
  });
  expect(charges.statusCode, charges.body).toBe(200);
  const charge = (charges.json() as { id: string; sourceType: string; sourceId: string; gstTreatment: string; gstRateBp: number; status: string }[]).find(
    (row) => row.sourceType === 'pharmacy_ip_issue' && row.sourceId === issued.id,
  );
  expect(charge?.gstTreatment).toBe('exempt_healthcare');
  expect(charge?.gstRateBp).toBe(0);
  expect(charge?.status).toBe('unbilled');
  const returned = await app.inject({
    method: 'POST',
    url: `${PREFIX}/ip-issues/${issued.id}/return`,
    headers: headers(cookie),
    payload: { reason: 'Not given', lines: [{ lineId: issued.lines[0]!.id, qty: 1 }] },
  });
  expect(returned.statusCode, returned.body).toBe(201);
  const after = await app.inject({
    method: 'GET',
    url: `/api/v1/tenant/clinical/encounters/${encounterId}/charges`,
    headers: { cookie },
  });
  const reversed = (after.json() as { id: string; status: string }[]).find((row) => row.id === charge?.id);
  expect(reversed?.status).toBe('reversed');
}, 60_000);

it('returns 403 not_entitled for Lotus on the purchase register', async () => {
  const cookie = await login(fx.lotus.ownerEmail);
  const res = await app.inject({ method: 'GET', url: `${PREFIX}/reports/purchases`, headers: { cookie } });
  expect(res.statusCode).toBe(403);
  expect(res.json().error.code).toBe('not_entitled');
  const sunrise = await login(fx.sunrise.ownerEmail);
  const ok = await app.inject({ method: 'GET', url: `${PREFIX}/reports/purchases`, headers: { cookie: sunrise } });
  expect(ok.statusCode, ok.body).toBe(200);
}, 30_000);

it('keeps on-hand stock equal to the sum of moves', async () => {
  const cookie = await login(fx.sunrise.ownerEmail);
  const stock = await app.inject({ method: 'GET', url: `${PREFIX}/stock`, headers: { cookie } });
  expect(stock.statusCode, stock.body).toBe(200);
  const rows = stock.json() as { qty: number; moveSum: number; brand: string; batchNo: string }[];
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    expect(row.qty, `${row.brand} ${row.batchNo}`).toBe(row.moveSum);
  }
}, 30_000);

it('isolates every pharmacy table', async () => {
  const handle = createDb(dbEnv().migrationUrl, { max: 1 });
  try {
    const [item] = await handle.db.select({ id: schema.pharmacyItems.id }).from(schema.pharmacyItems).where(eq(schema.pharmacyItems.tenantId, fx.lotus.tenantId));
    const [supplier] = await handle.db.select({ id: schema.pharmacySuppliers.id }).from(schema.pharmacySuppliers).where(eq(schema.pharmacySuppliers.tenantId, fx.lotus.tenantId));
    const [batch] = await handle.db.select({ id: schema.pharmacyBatches.id }).from(schema.pharmacyBatches).where(eq(schema.pharmacyBatches.tenantId, fx.lotus.tenantId));
    const [stock] = await handle.db.select({ id: schema.pharmacyStock.id }).from(schema.pharmacyStock).where(eq(schema.pharmacyStock.tenantId, fx.lotus.tenantId));
    const [move] = await handle.db.select({ id: schema.pharmacyStockMoves.id }).from(schema.pharmacyStockMoves).where(eq(schema.pharmacyStockMoves.tenantId, fx.lotus.tenantId));
    const [grn] = await handle.db.select({ id: schema.pharmacyGrns.id }).from(schema.pharmacyGrns).where(eq(schema.pharmacyGrns.tenantId, fx.lotus.tenantId));
    const [grnLine] = await handle.db.select({ id: schema.pharmacyGrnLines.id }).from(schema.pharmacyGrnLines).where(eq(schema.pharmacyGrnLines.tenantId, fx.lotus.tenantId));
    const [sale] = await handle.db.select({ id: schema.pharmacySales.id }).from(schema.pharmacySales).where(eq(schema.pharmacySales.tenantId, fx.lotus.tenantId));
    const [saleLine] = await handle.db.select({ id: schema.pharmacySaleLines.id }).from(schema.pharmacySaleLines).where(eq(schema.pharmacySaleLines.tenantId, fx.lotus.tenantId));
    const [saleReturn] = await handle.db.select({ id: schema.pharmacySaleReturns.id }).from(schema.pharmacySaleReturns).where(eq(schema.pharmacySaleReturns.tenantId, fx.lotus.tenantId));
    const [saleReturnLine] = await handle.db.select({ id: schema.pharmacySaleReturnLines.id }).from(schema.pharmacySaleReturnLines).where(eq(schema.pharmacySaleReturnLines.tenantId, fx.lotus.tenantId));
    const [issue] = await handle.db.select({ id: schema.pharmacyIpIssues.id }).from(schema.pharmacyIpIssues).where(eq(schema.pharmacyIpIssues.tenantId, fx.lotus.tenantId));
    const [issueLine] = await handle.db.select({ id: schema.pharmacyIpIssueLines.id }).from(schema.pharmacyIpIssueLines).where(eq(schema.pharmacyIpIssueLines.tenantId, fx.lotus.tenantId));
    const [adjustment] = await handle.db.select({ id: schema.pharmacyAdjustments.id }).from(schema.pharmacyAdjustments).where(eq(schema.pharmacyAdjustments.tenantId, fx.lotus.tenantId));
    const [adjustmentLine] = await handle.db.select({ id: schema.pharmacyAdjustmentLines.id }).from(schema.pharmacyAdjustmentLines).where(eq(schema.pharmacyAdjustmentLines.tenantId, fx.lotus.tenantId));
    const [supplierReturn] = await handle.db.select({ id: schema.pharmacySupplierReturns.id }).from(schema.pharmacySupplierReturns).where(eq(schema.pharmacySupplierReturns.tenantId, fx.lotus.tenantId));
    const [supplierReturnLine] = await handle.db.select({ id: schema.pharmacySupplierReturnLines.id }).from(schema.pharmacySupplierReturnLines).where(eq(schema.pharmacySupplierReturnLines.tenantId, fx.lotus.tenantId));
    const ids = [item, supplier, batch, stock, move, grn, grnLine, sale, saleLine, saleReturn, saleReturnLine, issue, issueLine, adjustment, adjustmentLine, supplierReturn, supplierReturnLine];
    expect(ids.every(Boolean)).toBe(true);
    const tables: [string, string][] = [
      ['pharmacy_items', item!.id],
      ['pharmacy_suppliers', supplier!.id],
      ['pharmacy_batches', batch!.id],
      ['pharmacy_stock', stock!.id],
      ['pharmacy_stock_moves', move!.id],
      ['pharmacy_grns', grn!.id],
      ['pharmacy_grn_lines', grnLine!.id],
      ['pharmacy_sales', sale!.id],
      ['pharmacy_sale_lines', saleLine!.id],
      ['pharmacy_sale_returns', saleReturn!.id],
      ['pharmacy_sale_return_lines', saleReturnLine!.id],
      ['pharmacy_ip_issues', issue!.id],
      ['pharmacy_ip_issue_lines', issueLine!.id],
      ['pharmacy_adjustments', adjustment!.id],
      ['pharmacy_adjustment_lines', adjustmentLine!.id],
      ['pharmacy_supplier_returns', supplierReturn!.id],
      ['pharmacy_supplier_return_lines', supplierReturnLine!.id],
    ];
    for (const [table, id] of tables) await expectIsolation(table, id);
  } finally {
    await handle.close();
  }
}, 120_000);
