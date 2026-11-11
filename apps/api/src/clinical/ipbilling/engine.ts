import { schema, type Tx } from '@hos/db';
import {
  BillMathError,
  composeBill,
  placeOfSupply,
  type ClinicalCtx,
  type ConcessionInput,
  type CreateDepositInput,
  type CreateIpBillInput,
  type DepositRefundInput,
  type GstTreatment,
  type ManualChargeInput,
  type OpBillDto,
  type SettleInput,
  type SplitIpBillInput,
} from '@hos/shared';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { ApiError } from '../../http';
import { charges } from '../charges';
import {
  acceptDeposit,
  concede,
  finalise,
  readBill,
  refundDeposit,
  settle,
} from '../billing/engine';
import { billDto, lineDto } from '../billing/map';
import { numbering } from '../numbering';
import { encounterPayerDto, payerDto, receivableDto } from './map';

function dayOf(value: Date | string): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

async function locationState(ctx: ClinicalCtx<Tx>): Promise<string> {
  if (!ctx.locationId) throw new ApiError(422, 'location_required', 'Choose a location');
  const [loc] = await ctx.tx.select({ stateCode: schema.locations.stateCode }).from(schema.locations).where(eq(schema.locations.id, ctx.locationId));
  if (!loc?.stateCode) throw new ApiError(422, 'location_required', 'This location has no state code');
  return loc.stateCode;
}

async function payerGstin(ctx: ClinicalCtx<Tx>, encounterId: string): Promise<string | null> {
  const [link] = await ctx.tx
    .select({ gstin: schema.payers.gstin })
    .from(schema.encounterPayers)
    .innerJoin(schema.payers, and(eq(schema.payers.tenantId, schema.encounterPayers.tenantId), eq(schema.payers.id, schema.encounterPayers.payerId)))
    .where(and(eq(schema.encounterPayers.encounterId, encounterId), eq(schema.encounterPayers.status, 'active')));
  const gstin = link?.gstin?.trim().toUpperCase() ?? '';
  return gstin.length >= 2 ? gstin : null;
}

async function priceLines(
  ctx: ClinicalCtx<Tx>,
  encounterId: string,
  lines: { netPaise: number; treatment: GstTreatment; configuredRateBp: number; unitPricePaise: number }[],
  discountPaise: number,
) {
  const stateCode = await locationState(ctx);
  const payerGst = await payerGstin(ctx, encounterId);
  const place = placeOfSupply({ locationStateCode: stateCode, payerGstin: payerGst });
  const gstin = payerGst ?? '';
  try {
    return composeBill({
      lines,
      billDiscountPaise: discountPaise,
      interState: place.interState,
      patientRegistered: /^[0-9]{2}[A-Z0-9]{13}$/.test(gstin),
    });
  } catch (error) {
    if (error instanceof BillMathError) throw new ApiError(422, error.code, error.message);
    throw error;
  }
}

async function linesOf(ctx: ClinicalCtx<Tx>, billId: string) {
  return ctx.tx.select().from(schema.billLines).where(eq(schema.billLines.billId, billId)).orderBy(asc(schema.billLines.lineNo));
}

async function present(ctx: ClinicalCtx<Tx>, bill: typeof schema.bills.$inferSelect, withLines: boolean): Promise<OpBillDto> {
  const [patient] = await ctx.tx
    .select({ fullName: schema.patients.fullName, uhid: schema.patients.uhid })
    .from(schema.patients)
    .where(eq(schema.patients.id, bill.patientId));
  const lines = withLines ? (await linesOf(ctx, bill.id)).map(lineDto) : undefined;
  return billDto(bill, { patientName: patient?.fullName ?? undefined, patientUhid: patient?.uhid ?? undefined, lines });
}

async function requireIpdEncounter(ctx: ClinicalCtx<Tx>, encounterId: string) {
  const [encounter] = await ctx.tx.select().from(schema.encounters).where(eq(schema.encounters.id, encounterId));
  if (!encounter) throw new ApiError(404, 'not_found', 'Encounter not found');
  if (encounter.kind !== 'ipd') throw new ApiError(422, 'not_ipd', 'This workflow is for in-patient visits only');
  if (encounter.locationId !== ctx.locationId) throw new ApiError(422, 'location_mismatch', 'This visit is at another location');
  if (encounter.status === 'cancelled') throw new ApiError(422, 'encounter_cancelled', 'This visit is cancelled');
  return encounter;
}

export async function postManualCharge(ctx: ClinicalCtx<Tx>, encounterId: string, input: ManualChargeInput) {
  const encounter = await requireIpdEncounter(ctx, encounterId);
  const sourceId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return charges.post(ctx, {
    encounterId: encounter.id,
    patientId: encounter.patientId,
    serviceId: input.serviceId ?? null,
    description: input.description,
    qty: input.qty,
    unitPricePaise: input.unitPricePaise,
    discountPaise: input.discountPaise,
    gstTreatment: input.gstTreatment,
    gstRateBp: input.gstRateBp,
    hsnSac: input.hsnSac,
    serviceDate: input.serviceDate,
    performingDoctorId: input.performingDoctorId ?? null,
    source: { module: 'billing', type: 'ip_manual', id: sourceId, line: '' },
  });
}

export async function reverseCharge(ctx: ClinicalCtx<Tx>, chargeId: string, reason: string) {
  return charges.reverse(ctx, chargeId, reason);
}

export async function buildIpBill(ctx: ClinicalCtx<Tx>, encounterId: string, input: CreateIpBillInput): Promise<OpBillDto> {
  if (!ctx.locationId) throw new ApiError(422, 'location_required', 'Choose a location');
  const encounter = await requireIpdEncounter(ctx, encounterId);
  const filters = [eq(schema.charges.encounterId, encounter.id), eq(schema.charges.status, 'unbilled')];
  if (input.chargeIds?.length) filters.push(inArray(schema.charges.id, input.chargeIds));
  const chargeRows = await ctx.tx.select().from(schema.charges).where(and(...filters)).orderBy(asc(schema.charges.createdAt));
  if (input.chargeIds?.length && chargeRows.length !== input.chargeIds.length) {
    throw new ApiError(422, 'charge_not_billable', 'One of those charges is not an unbilled charge on this visit');
  }
  if (!input.interim) {
    const [left] = await ctx.tx
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.charges)
      .where(and(eq(schema.charges.encounterId, encounter.id), eq(schema.charges.status, 'unbilled')));
    if (Number(left?.n ?? 0) > chargeRows.length) {
      throw new ApiError(422, 'unbilled_remain', 'A final bill must include every unbilled charge on this visit');
    }
  }
  if (chargeRows.length === 0) throw new ApiError(422, 'nothing_to_bill', 'There are no unbilled charges on this visit');

  const ids = chargeRows.map((row) => row.id);
  await ctx.tx.execute(sql`select id from charges where id in (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)}) for update`);

  const [ep] = await ctx.tx.select().from(schema.encounterPayers).where(eq(schema.encounterPayers.encounterId, encounter.id));
  const composed = await priceLines(
    ctx,
    encounter.id,
    chargeRows.map((row) => ({
      netPaise: row.amountPaise - row.discountPaise,
      treatment: row.gstTreatment as GstTreatment,
      configuredRateBp: row.gstRateBp,
      unitPricePaise: row.unitPricePaise,
    })),
    0,
  );

  const [bill] = await ctx.tx
    .insert(schema.bills)
    .values({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId,
      patientId: encounter.patientId,
      encounterId: encounter.id,
      kind: 'ip',
      docType: composed.docType,
      status: 'draft',
      payClass: input.payClass,
      payerId: ep?.payerId ?? null,
      subtotalPaise: composed.subtotalPaise,
      discountPaise: composed.discountPaise,
      cgstPaise: composed.cgstPaise,
      sgstPaise: composed.sgstPaise,
      igstPaise: composed.igstPaise,
      roundOffPaise: composed.roundOffPaise,
      totalPaise: composed.totalPaise,
      paidPaise: 0,
      createdBy: ctx.userId,
    })
    .returning();
  if (!bill) throw new ApiError(422, 'validation', 'Could not create the bill');

  await ctx.tx.insert(schema.billLines).values(
    chargeRows.map((row, index) => {
      const line = composed.lines[index];
      if (!line) throw new ApiError(422, 'validation', 'Could not price a line');
      return {
        tenantId: ctx.tenantId,
        billId: bill.id,
        chargeId: row.id,
        lineNo: index + 1,
        description: row.description,
        qty: Number(row.qty),
        unitPricePaise: row.unitPricePaise,
        amountPaise: row.amountPaise,
        discountPaise: row.discountPaise,
        billDiscountPaise: line.billDiscountPaise,
        taxablePaise: line.taxablePaise,
        gstTreatment: row.gstTreatment,
        configuredRateBp: row.gstRateBp,
        gstRateBp: line.gstRateBp,
        hsnSac: row.hsnSac,
        cgstPaise: line.cgstPaise,
        sgstPaise: line.sgstPaise,
        igstPaise: line.igstPaise,
        serviceId: row.serviceId,
        performingDoctorId: row.performingDoctorId,
        serviceDate: dayOf(row.serviceDate),
      };
    }),
  );
  await ctx.tx.update(schema.charges).set({ status: 'billed', billId: bill.id }).where(inArray(schema.charges.id, ids));
  await ctx.audit('ipbilling.bill.create', 'bill', bill.id, null, { chargeIds: ids, interim: input.interim, totalPaise: bill.totalPaise });

  if (!input.interim && input.applyDeposits) {
    const finalized = await finalise(ctx, bill.id);
    await applyOpenDeposits(ctx, finalized.id);
    return readBill(ctx, bill.id);
  }
  return present(ctx, bill, true);
}

async function applyOpenDeposits(ctx: ClinicalCtx<Tx>, billId: string) {
  const bill = await readBill(ctx, billId);
  const deposits = await ctx.tx
    .select()
    .from(schema.deposits)
    .where(
      and(
        eq(schema.deposits.patientId, bill.patientId),
        inArray(schema.deposits.status, ['open', 'adjusted']),
        sql`${schema.deposits.balancePaise} > 0`,
        bill.encounterId ? eq(schema.deposits.encounterId, bill.encounterId) : isNull(schema.deposits.encounterId),
      ),
    )
    .orderBy(asc(schema.deposits.createdAt));
  let balance = bill.totalPaise - bill.paidPaise;
  for (const deposit of deposits) {
    if (balance <= 0) break;
    const use = Math.min(balance, deposit.balancePaise);
    if (use <= 0) continue;
    await settle(ctx, billId, { mode: 'deposit', amountPaise: use, depositId: deposit.id });
    balance -= use;
  }
}

export async function splitBill(ctx: ClinicalCtx<Tx>, billId: string, input: SplitIpBillInput): Promise<OpBillDto> {
  const [bill] = await ctx.tx.select().from(schema.bills).where(eq(schema.bills.id, billId));
  if (!bill) throw new ApiError(404, 'not_found', 'Bill not found');
  if (bill.kind !== 'ip') throw new ApiError(422, 'not_ip', 'Only in-patient bills can be split');
  if (bill.status !== 'final') throw new ApiError(422, 'bill_not_final', 'Finalise the bill before splitting');
  if (!bill.encounterId) throw new ApiError(422, 'validation', 'This bill is not linked to a visit');
  const patientShare = bill.totalPaise - input.payerSharePaise;
  if (patientShare < 0 || input.payerSharePaise >= bill.totalPaise) {
    throw new ApiError(422, 'validation', 'The payer share must be less than the bill total');
  }
  const [ep] = await ctx.tx
    .select()
    .from(schema.encounterPayers)
    .where(and(eq(schema.encounterPayers.encounterId, bill.encounterId), eq(schema.encounterPayers.status, 'active')));
  if (!ep) throw new ApiError(422, 'payer_required', 'Link a payer to this visit before splitting the bill');
  const [existing] = await ctx.tx.select().from(schema.payerReceivables).where(eq(schema.payerReceivables.billId, bill.id));
  if (existing) throw new ApiError(409, 'already_split', 'This bill is already split');
  await ctx.tx
    .insert(schema.payerReceivables)
    .values({
      tenantId: ctx.tenantId,
      billId: bill.id,
      payerId: ep.payerId,
      amountPaise: input.payerSharePaise,
      status: 'open',
    });
  await ctx.tx.update(schema.bills).set({ payerId: ep.payerId, payClass: 'credit' }).where(eq(schema.bills.id, bill.id));
  if (input.payerSharePaise > 0) {
    await settle(ctx, bill.id, { mode: 'credit', amountPaise: input.payerSharePaise });
  }
  await ctx.audit('ipbilling.bill.split', 'bill', bill.id, null, { payerSharePaise: input.payerSharePaise, patientSharePaise: patientShare });
  return readBill(ctx, bill.id);
}

export async function upsertEncounterPayer(ctx: ClinicalCtx<Tx>, encounterId: string, input: import('@hos/shared').EncounterPayerInput) {
  await requireIpdEncounter(ctx, encounterId);
  const [payer] = await ctx.tx.select().from(schema.payers).where(eq(schema.payers.id, input.payerId));
  if (!payer?.active) throw new ApiError(404, 'not_found', 'Payer not found');
  const [row] = await ctx.tx
    .insert(schema.encounterPayers)
    .values({
      tenantId: ctx.tenantId,
      encounterId,
      payerId: input.payerId,
      policyNo: input.policyNo,
      preauthAmountPaise: input.preauthAmountPaise,
      approvedAmountPaise: input.approvedAmountPaise,
      status: 'active',
    })
    .onConflictDoUpdate({
      target: [schema.encounterPayers.tenantId, schema.encounterPayers.encounterId] as const,
      set: {
        payerId: input.payerId,
        policyNo: input.policyNo,
        preauthAmountPaise: input.preauthAmountPaise,
        approvedAmountPaise: input.approvedAmountPaise,
        status: 'active',
      },
    })
    .returning();
  await ctx.audit('ipbilling.encounter_payer.set', 'encounter_payer', row?.id ?? null, null, input);
  return encounterPayerDto(row!, payer);
}

export async function getEncounterPayer(ctx: ClinicalCtx<Tx>, encounterId: string) {
  const [row] = await ctx.tx.select().from(schema.encounterPayers).where(eq(schema.encounterPayers.encounterId, encounterId));
  if (!row) return null;
  const [payer] = await ctx.tx.select().from(schema.payers).where(eq(schema.payers.id, row.payerId));
  return encounterPayerDto(row, payer);
}

export async function createPayer(ctx: ClinicalCtx<Tx>, input: import('@hos/shared').PayerCreateInput) {
  const [row] = await ctx.tx
    .insert(schema.payers)
    .values({
      tenantId: ctx.tenantId,
      code: input.code.toUpperCase(),
      name: input.name,
      kind: input.kind,
      gstin: input.gstin.trim().toUpperCase(),
      stateCode: (input.stateCode ?? '').toUpperCase(),
      creditDays: input.creditDays,
      isSample: true,
    })
    .returning();
  await ctx.audit('ipbilling.payer.create', 'payer', row?.id ?? null, null, input);
  return payerDto(row!);
}

export async function patchPayer(ctx: ClinicalCtx<Tx>, payerId: string, input: import('@hos/shared').PayerPatchInput) {
  const [existing] = await ctx.tx.select().from(schema.payers).where(eq(schema.payers.id, payerId));
  if (!existing) throw new ApiError(404, 'not_found', 'Payer not found');
  const [row] = await ctx.tx
    .update(schema.payers)
    .set({
      code: input.code?.toUpperCase() ?? existing.code,
      name: input.name ?? existing.name,
      kind: input.kind ?? existing.kind,
      gstin: input.gstin?.trim().toUpperCase() ?? existing.gstin,
      stateCode: input.stateCode?.toUpperCase() ?? existing.stateCode,
      creditDays: input.creditDays ?? existing.creditDays,
      active: input.active ?? existing.active,
    })
    .where(eq(schema.payers.id, payerId))
    .returning();
  await ctx.audit('ipbilling.payer.patch', 'payer', payerId, existing, row);
  return payerDto(row!);
}

export async function listPayers(ctx: ClinicalCtx<Tx>) {
  const rows = await ctx.tx.select().from(schema.payers).where(eq(schema.payers.active, true)).orderBy(asc(schema.payers.name));
  return rows.map(payerDto);
}

export async function runningBalances(ctx: ClinicalCtx<Tx>) {
  const result = await ctx.tx.execute<{
    encounter_id: string;
    number: string;
    patient_id: string;
    full_name: string;
    uhid: string;
    ward: string | null;
    unbilled: string | number;
    billed: string | number;
    paid: string | number;
    deposits: string | number;
  }>(sql`
    select e.id as encounter_id, e.number, e.patient_id, p.full_name, p.uhid,
           coalesce(e.current_ward_code, '') || case when e.current_bed_label is not null then ' / ' || e.current_bed_label else '' end as ward,
           coalesce((select sum(c.amount_paise - c.discount_paise) from charges c where c.encounter_id = e.id and c.status = 'unbilled'), 0) as unbilled,
           coalesce((select sum(b.total_paise) from bills b where b.encounter_id = e.id and b.status = 'final'), 0) as billed,
           coalesce((select sum(b.paid_paise) from bills b where b.encounter_id = e.id and b.status = 'final'), 0) as paid,
           coalesce((select sum(d.balance_paise) from deposits d where d.encounter_id = e.id and d.balance_paise > 0), 0) as deposits
      from encounters e
      join patients p on p.tenant_id = e.tenant_id and p.id = e.patient_id
     where e.tenant_id = ${ctx.tenantId}::uuid
       and e.location_id = ${ctx.locationId}::uuid
       and e.kind = 'ipd'
       and e.status = 'open'
     order by e.started_at desc
  `);
  return result.rows.map((row) => {
    const unbilled = Number(row.unbilled);
    const billed = Number(row.billed);
    const paid = Number(row.paid);
    const deposits = Number(row.deposits);
    const balance = billed - paid - deposits + unbilled;
    return {
      encounterId: row.encounter_id,
      encounterNumber: row.number,
      patientId: row.patient_id,
      patientName: row.full_name,
      uhid: row.uhid,
      wardLabel: row.ward || null,
      unbilledPaise: unbilled,
      billedPaise: billed,
      paidPaise: paid,
      depositPaise: deposits,
      balancePaise: balance,
    };
  });
}

export async function statement(ctx: ClinicalCtx<Tx>, encounterId: string) {
  const encounter = await requireIpdEncounter(ctx, encounterId);
  const [patient] = await ctx.tx
    .select({ fullName: schema.patients.fullName, uhid: schema.patients.uhid })
    .from(schema.patients)
    .where(eq(schema.patients.id, encounter.patientId));
  const chargeRows = await ctx.tx
    .select()
    .from(schema.charges)
    .where(eq(schema.charges.encounterId, encounter.id))
    .orderBy(asc(schema.charges.createdAt));
  const billRows = await ctx.tx
    .select()
    .from(schema.bills)
    .where(eq(schema.bills.encounterId, encounter.id))
    .orderBy(asc(schema.bills.createdAt));
  const depositRows = await ctx.tx
    .select()
    .from(schema.deposits)
    .where(and(eq(schema.deposits.patientId, encounter.patientId), eq(schema.deposits.encounterId, encounter.id)))
    .orderBy(asc(schema.deposits.createdAt));
  const recvRows = await ctx.tx
    .select({ recv: schema.payerReceivables, payer: schema.payers })
    .from(schema.payerReceivables)
    .innerJoin(schema.bills, eq(schema.bills.id, schema.payerReceivables.billId))
    .innerJoin(schema.payers, and(eq(schema.payers.id, schema.payerReceivables.payerId), eq(schema.payers.tenantId, schema.payerReceivables.tenantId)))
    .where(eq(schema.bills.encounterId, encounter.id));

  type Line = import('@hos/shared').StatementLineDto;
  const lines: Line[] = [];
  let balance = 0;
  const push = (at: string, kind: Line['kind'], description: string, debit: number, credit: number) => {
    balance += debit - credit;
    lines.push({ at, kind, description, debitPaise: debit, creditPaise: credit, balancePaise: balance });
  };
  for (const c of chargeRows) {
    if (c.status === 'reversed') continue;
    const net = c.amountPaise - c.discountPaise;
    push(c.createdAt.toISOString(), 'charge', c.description, net, 0);
  }
  for (const b of billRows) {
    if (b.status === 'cancelled') continue;
    push((b.finalisedAt ?? b.createdAt).toISOString(), 'bill', b.number ? `Bill ${b.number}` : 'Draft bill', 0, b.totalPaise);
    if (b.paidPaise > 0) push(b.updatedAt.toISOString(), 'settlement', 'Payments on bill', 0, b.paidPaise);
  }
  for (const d of depositRows) {
    push(d.createdAt.toISOString(), 'deposit', `Deposit ${d.number}`, 0, d.amountPaise);
    const used = d.amountPaise - d.balancePaise;
    if (used > 0) push(d.updatedAt.toISOString(), 'settlement', `Deposit applied ${d.number}`, 0, used);
  }
  for (const row of recvRows) {
    push(row.recv.createdAt.toISOString(), 'receivable', `${row.payer.name} receivable`, 0, row.recv.amountPaise);
  }

  const chargeTotal = chargeRows.filter((c) => c.status !== 'reversed').reduce((s, c) => s + c.amountPaise - c.discountPaise, 0);
  const billed = billRows.filter((b) => b.status === 'final').reduce((s, b) => s + b.totalPaise, 0);
  const paid = billRows.filter((b) => b.status === 'final').reduce((s, b) => s + b.paidPaise, 0);
  const depositBal = depositRows.reduce((s, d) => s + d.balancePaise, 0);
  const receivable = recvRows.reduce((s, r) => s + r.recv.amountPaise, 0);

  return {
    encounterId: encounter.id,
    patientId: encounter.patientId,
    patientName: patient?.fullName ?? '',
    uhid: patient?.uhid ?? '',
    encounterNumber: encounter.number,
    lines,
    chargeTotalPaise: chargeTotal,
    billedPaise: billed,
    paidPaise: paid,
    depositBalancePaise: depositBal,
    receivablePaise: receivable,
    balancePaise: balance,
  };
}

export async function computeDischargeBalance(ctx: ClinicalCtx<Tx>, encounterId: string) {
  const [unbilled] = await ctx.tx
    .select({ n: sql<number>`count(*)::int`, amount: sql<number>`coalesce(sum(amount_paise - discount_paise), 0)::bigint` })
    .from(schema.charges)
    .where(and(eq(schema.charges.encounterId, encounterId), eq(schema.charges.status, 'unbilled')));
  const reasons: string[] = [];
  if (Number(unbilled?.n ?? 0) > 0) reasons.push(`${unbilled?.n} unbilled charge(s) remain`);
  const [bills] = await ctx.tx
    .select({
      due: sql<number>`coalesce(sum(total_paise - paid_paise), 0)::bigint`,
    })
    .from(schema.bills)
    .where(and(eq(schema.bills.encounterId, encounterId), eq(schema.bills.status, 'final'), sql`pay_class <> 'credit'`));
  const [deposits] = await ctx.tx
    .select({ bal: sql<number>`coalesce(sum(balance_paise), 0)::bigint` })
    .from(schema.deposits)
    .where(and(eq(schema.deposits.encounterId, encounterId), sql`balance_paise > 0`));
  let balance = Number(bills?.due ?? 0) - Number(deposits?.bal ?? 0);
  if (balance > 0) reasons.push(`Patient balance due ₹${(balance / 100).toFixed(2)}`);
  const ok = reasons.length === 0 && balance <= 0;
  return { ok, balancePaise: Math.max(balance, 0), reasons };
}

export {
  acceptDeposit,
  concede,
  finalise,
  readBill,
  refundDeposit,
  settle,
};

export async function listReceivables(ctx: ClinicalCtx<Tx>, billId: string) {
  const rows = await ctx.tx
    .select({ recv: schema.payerReceivables, payer: schema.payers })
    .from(schema.payerReceivables)
    .innerJoin(schema.payers, and(eq(schema.payers.id, schema.payerReceivables.payerId), eq(schema.payers.tenantId, schema.payerReceivables.tenantId)))
    .where(eq(schema.payerReceivables.billId, billId));
  return rows.map((row) => receivableDto(row.recv, row.payer));
}

export async function ipBillRegister(ctx: ClinicalCtx<Tx>, from: string, to: string) {
  const rows = await ctx.tx
    .select({ bill: schema.bills, name: schema.patients.fullName, uhid: schema.patients.uhid })
    .from(schema.bills)
    .innerJoin(schema.patients, eq(schema.patients.id, schema.bills.patientId))
    .where(
      and(
        eq(schema.bills.kind, 'ip'),
        eq(schema.bills.status, 'final'),
        eq(schema.bills.locationId, ctx.locationId),
        sql`${schema.bills.finalisedAt}::date between ${from}::date and ${to}::date`,
      ),
    )
    .orderBy(desc(schema.bills.finalisedAt));
  return {
    from,
    to,
    rows: rows.map((r) => ({
      billId: r.bill.id,
      number: r.bill.number,
      patientName: r.name ?? '',
      uhid: r.uhid ?? '',
      totalPaise: r.bill.totalPaise,
      paidPaise: r.bill.paidPaise,
      finalisedAt: r.bill.finalisedAt?.toISOString() ?? '',
    })),
  };
}
