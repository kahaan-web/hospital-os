import { schema, type Tx } from '@hos/db';
import {
  BillMathError,
  composeBill,
  placeOfSupply,
  type ClinicalCtx,
  type ConcessionInput,
  type CreateDepositInput,
  type CreateOpBillInput,
  type DepositRefundInput,
  type GstTreatment,
  type OpBillDto,
  type PaymentMode,
  type BillRefundInput,
  type SettleInput,
} from '@hos/shared';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { ApiError } from '../../http';
import { cash } from '../cash';
import { numbering } from '../numbering';
import { billDto, depositDto, lineDto } from './map';

const PAYMENT: readonly PaymentMode[] = ['cash', 'upi', 'card', 'cheque', 'neft'];

function isPayment(mode: string): mode is PaymentMode {
  return (PAYMENT as readonly string[]).includes(mode);
}

function blank(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function dayOf(value: Date | string): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

async function locationState(ctx: ClinicalCtx<Tx>): Promise<string> {
  if (!ctx.locationId) throw new ApiError(422, 'location_required', 'Choose a location');
  const [loc] = await ctx.tx.select({ stateCode: schema.locations.stateCode }).from(schema.locations).where(eq(schema.locations.id, ctx.locationId));
  if (!loc?.stateCode) throw new ApiError(422, 'location_required', 'This location has no state code');
  return loc.stateCode;
}

async function priceLines(
  ctx: ClinicalCtx<Tx>,
  lines: { netPaise: number; treatment: GstTreatment; configuredRateBp: number; unitPricePaise: number }[],
  discountPaise: number,
  payerGstin?: string | null,
) {
  const stateCode = await locationState(ctx);
  const place = placeOfSupply({ locationStateCode: stateCode, payerGstin });
  const gstin = (payerGstin ?? '').trim().toUpperCase();
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

async function lockBill(ctx: ClinicalCtx<Tx>, billId: string): Promise<typeof schema.bills.$inferSelect> {
  const locked = await ctx.tx.execute<{ id: string }>(sql`select id from bills where id = ${billId}::uuid for update`);
  if (!locked.rows[0]) throw new ApiError(404, 'not_found', 'Bill not found');
  const [bill] = await ctx.tx.select().from(schema.bills).where(eq(schema.bills.id, billId));
  if (!bill) throw new ApiError(404, 'not_found', 'Bill not found');
  return bill;
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

async function applyPrices(
  ctx: ClinicalCtx<Tx>,
  billId: string,
  rows: (typeof schema.billLines.$inferSelect)[],
  discountPaise: number,
) {
  const composed = await priceLines(
    ctx,
    rows.map((row) => ({
      netPaise: row.amountPaise - row.discountPaise,
      treatment: row.gstTreatment as GstTreatment,
      configuredRateBp: row.configuredRateBp,
      unitPricePaise: row.unitPricePaise,
    })),
    discountPaise,
  );
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const line = composed.lines[i];
    if (!row || !line) continue;
    await ctx.tx
      .update(schema.billLines)
      .set({
        billDiscountPaise: line.billDiscountPaise,
        taxablePaise: line.taxablePaise,
        gstRateBp: line.gstRateBp,
        cgstPaise: line.cgstPaise,
        sgstPaise: line.sgstPaise,
        igstPaise: line.igstPaise,
      })
      .where(eq(schema.billLines.id, row.id));
  }
  const [updated] = await ctx.tx
    .update(schema.bills)
    .set({
      docType: composed.docType,
      subtotalPaise: composed.subtotalPaise,
      discountPaise: composed.discountPaise,
      cgstPaise: composed.cgstPaise,
      sgstPaise: composed.sgstPaise,
      igstPaise: composed.igstPaise,
      roundOffPaise: composed.roundOffPaise,
      totalPaise: composed.totalPaise,
    })
    .where(eq(schema.bills.id, billId))
    .returning();
  if (!updated) throw new ApiError(404, 'not_found', 'Bill not found');
  return updated;
}

/** Draft OP bill from unbilled charges. IP bills stay with the IP billing task. */
export async function buildBill(ctx: ClinicalCtx<Tx>, input: CreateOpBillInput): Promise<OpBillDto> {
  if (!ctx.locationId) throw new ApiError(422, 'location_required', 'Choose a location');
  const [encounter] = await ctx.tx.select().from(schema.encounters).where(eq(schema.encounters.id, input.encounterId));
  if (!encounter) throw new ApiError(404, 'not_found', 'Encounter not found');
  if (encounter.locationId !== ctx.locationId) throw new ApiError(422, 'location_mismatch', 'This visit is at another location');
  if (encounter.kind === 'ipd') throw new ApiError(422, 'use_ip_billing', 'IP bills are prepared in IP billing');
  if (encounter.status === 'cancelled') throw new ApiError(422, 'encounter_cancelled', 'This visit is cancelled');
  if (encounter.kind !== 'opd' && encounter.kind !== 'daycare' && encounter.kind !== 'emergency') {
    throw new ApiError(422, 'validation', 'This visit cannot be billed here');
  }

  const filters = [eq(schema.charges.encounterId, encounter.id), eq(schema.charges.status, 'unbilled')];
  if (input.chargeIds?.length) filters.push(inArray(schema.charges.id, input.chargeIds));
  const charges = await ctx.tx.select().from(schema.charges).where(and(...filters)).orderBy(asc(schema.charges.createdAt));
  if (input.chargeIds?.length && charges.length !== input.chargeIds.length) {
    throw new ApiError(422, 'charge_not_billable', 'One of those charges is not an unbilled charge on this visit');
  }
  if (charges.length === 0) throw new ApiError(422, 'nothing_to_bill', 'There are no unbilled charges on this visit');

  const ids = charges.map((row) => row.id);
  await ctx.tx.execute(sql`select id from charges where id in (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)}) for update`);

  const composed = await priceLines(
    ctx,
    charges.map((row) => ({
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
      kind: 'op',
      docType: composed.docType,
      status: 'draft',
      payClass: input.payClass,
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
    charges.map((row, index) => {
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
  await ctx.audit('billing.bill.create', 'bill', bill.id, null, { chargeIds: ids, payClass: input.payClass, totalPaise: bill.totalPaise });
  return present(ctx, bill, true);
}

export async function readBill(ctx: ClinicalCtx<Tx>, billId: string): Promise<OpBillDto> {
  const [bill] = await ctx.tx.select().from(schema.bills).where(eq(schema.bills.id, billId));
  if (!bill) throw new ApiError(404, 'not_found', 'Bill not found');
  return present(ctx, bill, true);
}

export async function finalise(ctx: ClinicalCtx<Tx>, billId: string): Promise<OpBillDto> {
  const bill = await lockBill(ctx, billId);
  if (bill.status === 'final') throw new ApiError(409, 'already_final', 'This bill is already final');
  if (bill.status !== 'draft') throw new ApiError(422, 'bill_not_draft', 'Only a draft bill can be finalised');
  if (bill.payClass === 'free') {
    const [approved] = await ctx.tx
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.concessions)
      .where(and(eq(schema.concessions.billId, bill.id), eq(schema.concessions.status, 'approved')));
    if (bill.totalPaise !== 0 || Number(approved?.n ?? 0) < 1) {
      throw new ApiError(422, 'approval_required', 'A free bill needs an approved concession for the full amount');
    }
  }
  const number = await numbering.next(ctx, bill.kind === 'ip' ? 'ip_bill' : 'op_bill');
  const [updated] = await ctx.tx
    .update(schema.bills)
    .set({ status: 'final', number, finalisedAt: new Date() })
    .where(eq(schema.bills.id, bill.id))
    .returning();
  await ctx.audit('billing.bill.finalise', 'bill', bill.id, { status: 'draft', number: null }, { status: 'final', number });
  return present(ctx, updated ?? bill, true);
}

export async function settle(ctx: ClinicalCtx<Tx>, billId: string, input: SettleInput): Promise<OpBillDto> {
  const bill = await lockBill(ctx, billId);
  if (bill.status !== 'final') throw new ApiError(422, 'bill_not_final', 'Finalise the bill before taking payment');
  const balance = bill.totalPaise - bill.paidPaise;
  if (input.mode === 'credit' && bill.payClass !== 'credit') {
    throw new ApiError(422, 'credit_not_allowed', 'Credit settlement is only for a credit bill');
  }
  if (input.mode !== 'credit' && input.amountPaise > balance) {
    throw new ApiError(422, 'exceeds_balance', 'That amount is more than the balance on this bill');
  }
  if (input.mode === 'credit') {
    const [credit] = await ctx.tx
      .select({ n: sql<number>`coalesce(sum(amount_paise), 0)::bigint` })
      .from(schema.billSettlements)
      .where(and(eq(schema.billSettlements.billId, bill.id), eq(schema.billSettlements.mode, 'credit')));
    if (Number(credit?.n ?? 0) + input.amountPaise > bill.totalPaise) {
      throw new ApiError(422, 'exceeds_balance', 'Credit already covers this bill');
    }
  }

  let cashEntryId: string | null = null;
  let depositId: string | null = null;
  if (input.mode === 'deposit') {
    if (!input.depositId) throw new ApiError(422, 'deposit_required', 'Choose the deposit to adjust');
    const locked = await ctx.tx.execute<{ id: string }>(sql`select id from deposits where id = ${input.depositId}::uuid for update`);
    if (!locked.rows[0]) throw new ApiError(404, 'not_found', 'Deposit not found');
    const [deposit] = await ctx.tx.select().from(schema.deposits).where(eq(schema.deposits.id, input.depositId));
    if (!deposit) throw new ApiError(404, 'not_found', 'Deposit not found');
    if (deposit.patientId !== bill.patientId) throw new ApiError(422, 'deposit_patient', 'That deposit belongs to another patient');
    if (deposit.balancePaise < input.amountPaise) throw new ApiError(422, 'deposit_short', 'The deposit balance is not enough');
    const next = deposit.balancePaise - input.amountPaise;
    await ctx.tx
      .update(schema.deposits)
      .set({ balancePaise: next, status: next === 0 ? 'adjusted' : 'open' })
      .where(eq(schema.deposits.id, deposit.id));
    depositId = deposit.id;
  } else if (isPayment(input.mode)) {
    const entry = await cash.record(ctx, {
      entryType: 'receipt',
      direction: 'in',
      mode: input.mode,
      amountPaise: input.amountPaise,
      patientId: bill.patientId,
      encounterId: bill.encounterId,
      refType: 'bill',
      refId: bill.id,
      instrumentRef: blank(input.instrumentRef),
    });
    cashEntryId = entry.id;
  }

  await ctx.tx.insert(schema.billSettlements).values({
    tenantId: ctx.tenantId,
    billId: bill.id,
    mode: input.mode,
    amountPaise: input.amountPaise,
    depositId,
    cashEntryId,
    instrumentRef: blank(input.instrumentRef),
    receivedBy: ctx.userId,
  });
  const paid = input.mode === 'credit' ? bill.paidPaise : bill.paidPaise + input.amountPaise;
  const [updated] = await ctx.tx.update(schema.bills).set({ paidPaise: paid }).where(eq(schema.bills.id, bill.id)).returning();
  await ctx.audit('billing.bill.settle', 'bill', bill.id, { paidPaise: bill.paidPaise }, { paidPaise: paid, mode: input.mode, amountPaise: input.amountPaise });
  return present(ctx, updated ?? bill, true);
}

export async function concede(ctx: ClinicalCtx<Tx>, billId: string, input: ConcessionInput, canApprove: boolean): Promise<OpBillDto> {
  const bill = await lockBill(ctx, billId);
  if (bill.status !== 'draft') throw new ApiError(422, 'bill_not_draft', 'Add the concession before the bill is finalised');
  const [approved] = await ctx.tx
    .select({ n: sql<number>`coalesce(sum(amount_paise), 0)::bigint` })
    .from(schema.concessions)
    .where(and(eq(schema.concessions.billId, bill.id), eq(schema.concessions.status, 'approved')));
  const already = Number(approved?.n ?? 0);
  if (canApprove) {
    const rows = await linesOf(ctx, bill.id);
    await applyPrices(ctx, bill.id, rows, already + input.amountPaise);
  }
  const [row] = await ctx.tx
    .insert(schema.concessions)
    .values({
      tenantId: ctx.tenantId,
      billId: bill.id,
      amountPaise: input.amountPaise,
      reason: input.reason,
      status: canApprove ? 'approved' : 'requested',
      requestedBy: ctx.userId,
      approvedBy: canApprove ? ctx.userId : null,
    })
    .returning();
  await ctx.audit('billing.concession.create', 'concession', row?.id ?? null, null, { billId, amountPaise: input.amountPaise, status: canApprove ? 'approved' : 'requested' });
  return readBill(ctx, bill.id);
}

export async function refund(ctx: ClinicalCtx<Tx>, billId: string, input: BillRefundInput): Promise<OpBillDto> {
  const bill = await lockBill(ctx, billId);
  if (bill.status !== 'final') throw new ApiError(422, 'bill_not_final', 'Only a final bill can be refunded');
  if (input.amountPaise > bill.paidPaise) throw new ApiError(422, 'refund_exceeds_paid', 'The refund is more than the amount paid');
  const entry = await cash.record(ctx, {
    entryType: 'refund',
    direction: 'out',
    mode: input.mode,
    amountPaise: input.amountPaise,
    patientId: bill.patientId,
    encounterId: bill.encounterId,
    refType: 'bill',
    refId: bill.id,
    instrumentRef: blank(input.instrumentRef),
  });
  const [refundRow] = await ctx.tx
    .insert(schema.refunds)
    .values({
      tenantId: ctx.tenantId,
      billId: bill.id,
      number: entry.number,
      amountPaise: input.amountPaise,
      reason: input.reason,
      mode: input.mode,
      cashEntryId: entry.id,
      approvedBy: ctx.userId,
    })
    .returning();
  const share = (tax: number) => (bill.totalPaise <= 0 ? 0 : Math.round((tax * input.amountPaise) / bill.totalPaise));
  const noteNumber = await numbering.next(ctx, 'credit_note');
  await ctx.tx.insert(schema.billCreditNotes).values({
    tenantId: ctx.tenantId,
    billId: bill.id,
    refundId: refundRow?.id ?? null,
    number: noteNumber,
    amountPaise: input.amountPaise,
    cgstPaise: share(bill.cgstPaise),
    sgstPaise: share(bill.sgstPaise),
    igstPaise: share(bill.igstPaise),
    reason: input.reason,
    status: 'issued',
  });
  const paid = bill.paidPaise - input.amountPaise;
  const [updated] = await ctx.tx.update(schema.bills).set({ paidPaise: paid }).where(eq(schema.bills.id, bill.id)).returning();
  await ctx.audit('billing.bill.refund', 'bill', bill.id, { paidPaise: bill.paidPaise }, { paidPaise: paid, amountPaise: input.amountPaise, creditNote: noteNumber });
  return present(ctx, updated ?? bill, true);
}

export async function acceptDeposit(ctx: ClinicalCtx<Tx>, input: CreateDepositInput) {
  if (!ctx.locationId) throw new ApiError(422, 'location_required', 'Choose a location');
  const [patient] = await ctx.tx.select({ id: schema.patients.id }).from(schema.patients).where(eq(schema.patients.id, input.patientId));
  if (!patient) throw new ApiError(404, 'not_found', 'Patient not found');
  if (input.encounterId) {
    const [encounter] = await ctx.tx.select().from(schema.encounters).where(eq(schema.encounters.id, input.encounterId));
    if (!encounter || encounter.patientId !== input.patientId) throw new ApiError(422, 'validation', 'That visit is not for this patient');
  }
  const entry = await cash.record(ctx, {
    entryType: 'deposit',
    direction: 'in',
    mode: input.mode,
    amountPaise: input.amountPaise,
    patientId: input.patientId,
    encounterId: input.encounterId ?? null,
    refType: 'deposit',
    refId: input.patientId,
    instrumentRef: blank(input.instrumentRef),
  });
  const [row] = await ctx.tx
    .insert(schema.deposits)
    .values({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId,
      patientId: input.patientId,
      encounterId: input.encounterId ?? null,
      number: entry.number,
      amountPaise: input.amountPaise,
      balancePaise: input.amountPaise,
      mode: input.mode,
      status: 'open',
      instrumentRef: blank(input.instrumentRef),
      receivedBy: ctx.userId,
    })
    .returning();
  if (!row) throw new ApiError(422, 'validation', 'Could not record the deposit');
  await ctx.tx.update(schema.cashLedger).set({ refId: row.id }).where(eq(schema.cashLedger.id, entry.id));
  await ctx.audit('billing.deposit.create', 'deposit', row.id, null, { number: row.number, amountPaise: row.amountPaise });
  return depositDto(row);
}

export async function refundDeposit(ctx: ClinicalCtx<Tx>, depositId: string, input: DepositRefundInput) {
  const locked = await ctx.tx.execute<{ id: string }>(sql`select id from deposits where id = ${depositId}::uuid for update`);
  if (!locked.rows[0]) throw new ApiError(404, 'not_found', 'Deposit not found');
  const [deposit] = await ctx.tx.select().from(schema.deposits).where(eq(schema.deposits.id, depositId));
  if (!deposit) throw new ApiError(404, 'not_found', 'Deposit not found');
  if (input.amountPaise > deposit.balancePaise) throw new ApiError(422, 'deposit_short', 'The refund is more than the deposit balance');
  const entry = await cash.record(ctx, {
    entryType: 'deposit_refund',
    direction: 'out',
    mode: input.mode,
    amountPaise: input.amountPaise,
    patientId: deposit.patientId,
    encounterId: deposit.encounterId,
    refType: 'deposit',
    refId: deposit.id,
  });
  const balance = deposit.balancePaise - input.amountPaise;
  const [updated] = await ctx.tx
    .update(schema.deposits)
    .set({ balancePaise: balance, status: balance === 0 ? 'refunded' : deposit.status === 'adjusted' ? 'adjusted' : 'open' })
    .where(eq(schema.deposits.id, deposit.id))
    .returning();
  const [refundRow] = await ctx.tx
    .insert(schema.refunds)
    .values({
      tenantId: ctx.tenantId,
      depositId: deposit.id,
      number: entry.number,
      amountPaise: input.amountPaise,
      reason: input.reason,
      mode: input.mode,
      cashEntryId: entry.id,
      approvedBy: ctx.userId,
    })
    .returning();
  await ctx.audit('billing.deposit.refund', 'deposit', deposit.id, { balancePaise: deposit.balancePaise }, { balancePaise: balance, refundId: refundRow?.id });
  return depositDto(updated ?? deposit);
}
