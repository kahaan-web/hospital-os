import { schema } from '@hos/db';
import { PHARMACY_GST_NOTE, formatDate, formatINR, type PharmacyReportDto, type PharmacyReportKey, type PharmacyReportQuery } from '@hos/shared';
import { asc, eq } from 'drizzle-orm';
import { listStock, withinDates, type PharmacyCtx } from './service';

function money(paise: number): string {
  return formatINR(paise, { decimals: 'always' });
}

export async function pharmacyReport(ctx: PharmacyCtx, key: PharmacyReportKey, query: PharmacyReportQuery): Promise<PharmacyReportDto> {
  const built = await build(ctx, key, query);
  return { key, gstNote: PHARMACY_GST_NOTE, ...built };
}

async function build(ctx: PharmacyCtx, key: PharmacyReportKey, query: PharmacyReportQuery): Promise<Pick<PharmacyReportDto, 'title' | 'columns' | 'rows'>> {
  if (key === 'stock-register') {
    const stock = await listStock(ctx);
    return {
      title: 'Stock register',
      columns: ['Item', 'Batch', 'Expiry', 'MRP', 'Qty', 'Move sum', 'Status'],
      rows: stock.map((row) => [
        `${row.brand} ${row.strength}`.trim(),
        row.batchNo,
        formatDate(row.expiry),
        money(row.mrpPaise),
        String(row.qty),
        String(row.moveSum),
        row.expired ? 'Expired' : row.low ? 'Low' : 'In stock',
      ]),
    };
  }
  if (key === 'expiry') {
    const stock = (await listStock(ctx)).filter((row) => {
      const limit = new Date(`${todayPlus(90)}T00:00:00Z`);
      const expiry = new Date(`${row.expiry}T00:00:00Z`);
      return expiry <= limit;
    });
    return {
      title: 'Expiry item report',
      columns: ['Item', 'Batch', 'Expiry', 'Qty', 'Status'],
      rows: stock.map((row) => [`${row.brand} ${row.strength}`.trim(), row.batchNo, formatDate(row.expiry), String(row.qty), row.expired ? 'Expired' : 'Expiring']),
    };
  }
  if (key === 'receipts' || key === 'purchases') {
    const grns = await ctx.tx.select().from(schema.pharmacyGrns).where(eq(schema.pharmacyGrns.locationId, ctx.locationId)).orderBy(asc(schema.pharmacyGrns.receivedAt));
    const suppliers = await ctx.tx.select().from(schema.pharmacySuppliers);
    const name = new Map(suppliers.map((row) => [row.id, row.name]));
    const filtered = grns.filter((row) => withinDates(row.receivedAt, query.from, query.to));
    if (key === 'receipts') {
      return {
        title: 'Receipt register',
        columns: ['Number', 'Date', 'Supplier', 'Taxable', 'Tax', 'Total'],
        rows: filtered.map((row) => [row.number, formatDate(row.receivedAt), name.get(row.supplierId) ?? '', money(row.taxablePaise), money(row.taxPaise), money(row.totalPaise)]),
      };
    }
    return {
      title: 'Purchase register',
      columns: ['Number', 'Date', 'Supplier', 'Taxable', 'GST', 'Total'],
      rows: filtered.map((row) => [row.number, formatDate(row.receivedAt), name.get(row.supplierId) ?? '', money(row.taxablePaise), money(row.taxPaise), money(row.totalPaise)]),
    };
  }
  if (key === 'rejections') {
    const rows = await ctx.tx.select().from(schema.pharmacySupplierReturns).where(eq(schema.pharmacySupplierReturns.locationId, ctx.locationId)).orderBy(asc(schema.pharmacySupplierReturns.createdAt));
    const suppliers = await ctx.tx.select().from(schema.pharmacySuppliers);
    const name = new Map(suppliers.map((row) => [row.id, row.name]));
    return {
      title: 'Rejection register',
      columns: ['Number', 'Date', 'Supplier', 'Reason'],
      rows: rows.filter((row) => withinDates(row.createdAt, query.from, query.to)).map((row) => [row.number, formatDate(row.createdAt), name.get(row.supplierId) ?? '', row.reason]),
    };
  }
  if (key === 'issues') {
    const sales = await ctx.tx.select().from(schema.pharmacySales).where(eq(schema.pharmacySales.locationId, ctx.locationId)).orderBy(asc(schema.pharmacySales.createdAt));
    const issues = await ctx.tx.select().from(schema.pharmacyIpIssues).where(eq(schema.pharmacyIpIssues.locationId, ctx.locationId)).orderBy(asc(schema.pharmacyIpIssues.createdAt));
    const rows = [
      ...sales.filter((row) => withinDates(row.createdAt, query.from, query.to)).map((row) => [row.number, formatDate(row.createdAt), row.kind === 'op' ? 'OP' : 'Outside', row.walkinName || row.patientId || '', money(row.grossPaise)]),
      ...issues.filter((row) => withinDates(row.createdAt, query.from, query.to)).map((row) => [row.number, formatDate(row.createdAt), 'IP', row.patientId, '']),
    ];
    return { title: 'Issue register', columns: ['Number', 'Date', 'Kind', 'Patient', 'Amount'], rows };
  }
  if (key === 'issue-returns') {
    const returns = await ctx.tx.select().from(schema.pharmacySaleReturns).where(eq(schema.pharmacySaleReturns.locationId, ctx.locationId)).orderBy(asc(schema.pharmacySaleReturns.createdAt));
    const ipLines = await ctx.tx
      .select({
        number: schema.pharmacyIpIssues.number,
        createdAt: schema.pharmacyIpIssueLines.updatedAt,
        returnedQty: schema.pharmacyIpIssueLines.returnedQty,
        brand: schema.pharmacyItems.brand,
      })
      .from(schema.pharmacyIpIssueLines)
      .innerJoin(schema.pharmacyIpIssues, eq(schema.pharmacyIpIssues.id, schema.pharmacyIpIssueLines.issueId))
      .innerJoin(schema.pharmacyItems, eq(schema.pharmacyItems.id, schema.pharmacyIpIssueLines.itemId))
      .where(eq(schema.pharmacyIpIssues.locationId, ctx.locationId));
    const rows = [
      ...returns.filter((row) => withinDates(row.createdAt, query.from, query.to)).map((row) => [row.number, formatDate(row.createdAt), 'Counter', row.reason, money(row.grossPaise)]),
      ...ipLines.filter((row) => row.returnedQty > 0).map((row) => [row.number, formatDate(row.createdAt), 'IP', row.brand, String(row.returnedQty)]),
    ];
    return { title: 'Issue return register', columns: ['Number', 'Date', 'Kind', 'Detail', 'Amount or qty'], rows };
  }
  if (key === 'adjustments') {
    const rows = await ctx.tx.select().from(schema.pharmacyAdjustments).where(eq(schema.pharmacyAdjustments.locationId, ctx.locationId)).orderBy(asc(schema.pharmacyAdjustments.createdAt));
    return {
      title: 'Stock adjustment register',
      columns: ['Number', 'Date', 'Reason'],
      rows: rows.filter((row) => withinDates(row.createdAt, query.from, query.to)).map((row) => [row.number, formatDate(row.createdAt), row.reason]),
    };
  }
  const issues = await ctx.tx.select().from(schema.pharmacyIpIssues).where(eq(schema.pharmacyIpIssues.locationId, ctx.locationId)).orderBy(asc(schema.pharmacyIpIssues.createdAt));
  const filtered = issues.filter((row) => (!query.patientId || row.patientId === query.patientId) && withinDates(row.createdAt, query.from, query.to));
  const lines = await ctx.tx
    .select({
      issueId: schema.pharmacyIpIssueLines.issueId,
      brand: schema.pharmacyItems.brand,
      qty: schema.pharmacyIpIssueLines.qty,
      returnedQty: schema.pharmacyIpIssueLines.returnedQty,
      mrpPaise: schema.pharmacyIpIssueLines.mrpPaise,
    })
    .from(schema.pharmacyIpIssueLines)
    .innerJoin(schema.pharmacyItems, eq(schema.pharmacyItems.id, schema.pharmacyIpIssueLines.itemId));
  const byIssue = new Map<string, string[]>();
  for (const line of lines) {
    const list = byIssue.get(line.issueId) ?? [];
    list.push(`${line.brand} ${line.qty - line.returnedQty}/${line.qty} ${money(Number(line.mrpPaise))}`);
    byIssue.set(line.issueId, list);
  }
  return {
    title: 'Patient issue / return statement (IP)',
    columns: ['Number', 'Date', 'Patient', 'Lines'],
    rows: filtered.map((row) => [row.number, formatDate(row.createdAt), row.patientId, (byIssue.get(row.id) ?? []).join('; ')]),
  };
}

function todayPlus(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
