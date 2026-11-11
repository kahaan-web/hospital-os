import { schema, type Tx } from '@hos/db';
import type {
  CashSummaryDto,
  ClinicalCtx,
  DepositDto,
  DepositRegisterDto,
  DoctorSharingDto,
  OpBillDto,
  OutstandingReportDto,
  RefundDto,
  RevenueReportDto,
  UnbilledEncounterDto,
  VisitStatisticsDto,
} from '@hos/shared';
import { and, desc, eq, sql } from 'drizzle-orm';
import { billDto, depositDto } from './map';

function num(value: unknown): number {
  return Number(value ?? 0);
}

export async function listBills(
  ctx: ClinicalCtx<Tx>,
  query: { status?: string; patientId?: string; page: number; pageSize: number },
): Promise<{ items: OpBillDto[]; total: number; page: number; pageSize: number }> {
  const filters = [eq(schema.bills.locationId, ctx.locationId)];
  if (query.status) filters.push(eq(schema.bills.status, query.status));
  if (query.patientId) filters.push(eq(schema.bills.patientId, query.patientId));
  const where = and(...filters);
  const rows = await ctx.tx
    .select({ bill: schema.bills, name: schema.patients.fullName, uhid: schema.patients.uhid })
    .from(schema.bills)
    .innerJoin(schema.patients, eq(schema.patients.id, schema.bills.patientId))
    .where(where)
    .orderBy(desc(schema.bills.createdAt))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);
  const total = await ctx.tx.select({ n: sql<number>`count(*)::int` }).from(schema.bills).where(where);
  return {
    items: rows.map((row) => billDto(row.bill, { patientName: row.name ?? undefined, patientUhid: row.uhid ?? undefined })),
    total: num(total[0]?.n),
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function unbilled(ctx: ClinicalCtx<Tx>): Promise<UnbilledEncounterDto[]> {
  const result = await ctx.tx.execute<{
    encounter_id: string;
    patient_id: string;
    number: string;
    full_name: string;
    uhid: string;
    charges: number;
    amount_paise: string | number;
  }>(sql`
    select e.id as encounter_id, e.patient_id, e.number, p.full_name, p.uhid,
           count(c.id)::int as charges,
           coalesce(sum(c.amount_paise - c.discount_paise), 0) as amount_paise
      from encounters e
      join patients p on p.tenant_id = e.tenant_id and p.id = e.patient_id
      join charges c on c.tenant_id = e.tenant_id and c.encounter_id = e.id and c.status = 'unbilled'
     where e.location_id = ${ctx.locationId}::uuid
       and e.kind in ('opd', 'daycare', 'emergency')
       and e.status <> 'cancelled'
     group by e.id, e.patient_id, e.number, p.full_name, p.uhid, e.started_at
     order by e.started_at desc
     limit 50
  `);
  return result.rows.map((row) => ({
    encounterId: row.encounter_id,
    patientId: row.patient_id,
    encounterNumber: row.number,
    patientName: row.full_name,
    uhid: row.uhid,
    chargeCount: num(row.charges),
    amountPaise: num(row.amount_paise),
  }));
}

export async function listDeposits(ctx: ClinicalCtx<Tx>, patientId?: string): Promise<DepositDto[]> {
  const filters = [eq(schema.deposits.locationId, ctx.locationId)];
  if (patientId) filters.push(eq(schema.deposits.patientId, patientId));
  const rows = await ctx.tx
    .select({ deposit: schema.deposits, name: schema.patients.fullName, uhid: schema.patients.uhid })
    .from(schema.deposits)
    .innerJoin(schema.patients, eq(schema.patients.id, schema.deposits.patientId))
    .where(and(...filters))
    .orderBy(desc(schema.deposits.createdAt))
    .limit(100);
  return rows.map((row) => depositDto(row.deposit, { patientName: row.name ?? undefined, patientUhid: row.uhid ?? undefined }));
}

export async function listRefunds(ctx: ClinicalCtx<Tx>): Promise<RefundDto[]> {
  const result = await ctx.tx.execute<{
    id: string;
    bill_id: string | null;
    deposit_id: string | null;
    number: string;
    amount_paise: string | number;
    reason: string;
    mode: string;
    created_at: string | Date;
  }>(sql`
    select r.id, r.bill_id, r.deposit_id, r.number, r.amount_paise, r.reason, r.mode, r.created_at
      from refunds r
      left join bills b on b.tenant_id = r.tenant_id and b.id = r.bill_id
      left join deposits d on d.tenant_id = r.tenant_id and d.id = r.deposit_id
     where coalesce(b.location_id, d.location_id) = ${ctx.locationId}::uuid
     order by r.created_at desc
     limit 100
  `);
  return result.rows.map((row) => ({
    id: row.id,
    number: row.number,
    billId: row.bill_id,
    depositId: row.deposit_id,
    amountPaise: num(row.amount_paise),
    reason: row.reason,
    mode: row.mode as RefundDto['mode'],
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
  }));
}

export async function cashSummary(ctx: ClinicalCtx<Tx>, from: string, to: string): Promise<CashSummaryDto> {
  const result = await ctx.tx.execute<{
    entry_type: string;
    direction: string;
    mode: string;
    ref_type: string;
    amount_paise: string | number;
    n: number;
  }>(sql`
    select entry_type, direction, mode, ref_type,
           coalesce(sum(amount_paise), 0) as amount_paise,
           count(*)::int as n
      from cash_ledger
     where location_id = ${ctx.locationId}::uuid
       and voided_at is null
       and (received_at at time zone 'Asia/Kolkata')::date between ${from}::date and ${to}::date
     group by entry_type, direction, mode, ref_type
     order by entry_type, mode, ref_type
  `);
  const rows = result.rows.map((row) => ({
    entryType: row.entry_type,
    direction: row.direction,
    mode: row.mode,
    refType: row.ref_type,
    amountPaise: num(row.amount_paise),
    count: num(row.n),
  }));
  const netInPaise = rows.reduce((sum, row) => sum + (row.direction === 'out' ? -row.amountPaise : row.amountPaise), 0);
  return { from, to, rows, netInPaise };
}

export async function revenueReport(ctx: ClinicalCtx<Tx>, from: string, to: string): Promise<RevenueReportDto> {
  const result = await ctx.tx.execute<{ doc_type: string; bills: number; total_paise: string | number; tax_paise: string | number }>(sql`
    select doc_type,
           count(*)::int as bills,
           coalesce(sum(total_paise), 0) as total_paise,
           coalesce(sum(cgst_paise + sgst_paise + igst_paise), 0) as tax_paise
      from bills
     where location_id = ${ctx.locationId}::uuid
       and kind = 'op'
       and status = 'final'
       and (finalised_at at time zone 'Asia/Kolkata')::date between ${from}::date and ${to}::date
     group by doc_type
     order by doc_type
  `);
  const rows = result.rows.map((row) => ({
    docType: row.doc_type,
    bills: num(row.bills),
    totalPaise: num(row.total_paise),
    taxPaise: num(row.tax_paise),
  }));
  return { from, to, rows, totalPaise: rows.reduce((sum, row) => sum + row.totalPaise, 0) };
}

export async function doctorSharing(ctx: ClinicalCtx<Tx>, from: string, to: string): Promise<DoctorSharingDto> {
  const result = await ctx.tx.execute<{ doctor_id: string | null; doctor_name: string | null; lines: number; amount_paise: string | number }>(sql`
    select l.performing_doctor_id as doctor_id,
           d.name as doctor_name,
           count(*)::int as lines,
           coalesce(sum(l.taxable_paise + l.cgst_paise + l.sgst_paise + l.igst_paise), 0) as amount_paise
      from bill_lines l
      join bills b on b.tenant_id = l.tenant_id and b.id = l.bill_id
      left join doctors d on d.tenant_id = l.tenant_id and d.id = l.performing_doctor_id
     where b.location_id = ${ctx.locationId}::uuid
       and b.kind = 'op'
       and b.status = 'final'
       and (b.finalised_at at time zone 'Asia/Kolkata')::date between ${from}::date and ${to}::date
     group by l.performing_doctor_id, d.name
     order by d.name nulls last
  `);
  return {
    from,
    to,
    rows: result.rows.map((row) => ({
      doctorId: row.doctor_id,
      doctorName: row.doctor_name ?? 'Not assigned',
      lines: num(row.lines),
      amountPaise: num(row.amount_paise),
    })),
  };
}

export async function outstanding(ctx: ClinicalCtx<Tx>): Promise<OutstandingReportDto> {
  const rows = await ctx.tx
    .select({ bill: schema.bills, name: schema.patients.fullName, uhid: schema.patients.uhid })
    .from(schema.bills)
    .innerJoin(schema.patients, eq(schema.patients.id, schema.bills.patientId))
    .where(and(eq(schema.bills.locationId, ctx.locationId), eq(schema.bills.kind, 'op'), eq(schema.bills.status, 'final'), sql`${schema.bills.paidPaise} < ${schema.bills.totalPaise}`, sql`${schema.bills.payClass} <> 'free'`))
    .orderBy(desc(schema.bills.finalisedAt));
  const mapped = rows.map((row) => ({
    billId: row.bill.id,
    number: row.bill.number,
    patientId: row.bill.patientId,
    patientName: row.name ?? '',
    uhid: row.uhid,
    payClass: row.bill.payClass as OutstandingReportDto['rows'][number]['payClass'],
    totalPaise: row.bill.totalPaise,
    paidPaise: row.bill.paidPaise,
    balancePaise: row.bill.totalPaise - row.bill.paidPaise,
  }));
  return { rows: mapped, balancePaise: mapped.reduce((sum, row) => sum + row.balancePaise, 0) };
}

export async function depositRegister(ctx: ClinicalCtx<Tx>): Promise<DepositRegisterDto> {
  const rows = await listDeposits(ctx);
  return {
    rows: rows.map((row) => ({
      id: row.id,
      number: row.number,
      patientName: row.patientName ?? '',
      uhid: row.patientUhid ?? '',
      amountPaise: row.amountPaise,
      balancePaise: row.balancePaise,
      status: row.status,
      mode: row.mode,
      createdAt: row.createdAt,
    })),
  };
}

export async function visitStatistics(ctx: ClinicalCtx<Tx>, from: string, to: string): Promise<VisitStatisticsDto> {
  const visits = await ctx.tx.execute<{ n: number }>(sql`
    select count(*)::int as n
      from encounters
     where location_id = ${ctx.locationId}::uuid
       and kind = 'opd'
       and status <> 'cancelled'
       and (started_at at time zone 'Asia/Kolkata')::date between ${from}::date and ${to}::date
  `);
  const bills = await ctx.tx.execute<{ n: number; total: string | number }>(sql`
    select count(*)::int as n, coalesce(sum(total_paise), 0) as total
      from bills
     where location_id = ${ctx.locationId}::uuid
       and kind = 'op'
       and status = 'final'
       and (finalised_at at time zone 'Asia/Kolkata')::date between ${from}::date and ${to}::date
  `);
  return {
    from,
    to,
    opdVisits: num(visits.rows[0]?.n),
    opBills: num(bills.rows[0]?.n),
    billedPaise: num(bills.rows[0]?.total),
  };
}
