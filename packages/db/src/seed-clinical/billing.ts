import { fyCode } from '@hos/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import { createDb, dbEnv, schema } from '../index';

const SUNRISE = 'sunrise-care';
const LOTUS = 'lotus-demo';

/**
 * Sample OP bills, a deposit and the Lotus rows the isolation tests look up.
 * Patients stay the DEMO- rows from seedDemoPeople. These tables have no is_sample column;
 * charges and cash_ledger do not either.
 */
export async function seedBilling(log: (m: string) => void = () => {}): Promise<void> {
  const handle = createDb(dbEnv().migrationUrl, { max: 1 });
  try {
    const [sunrise] = await handle.db.select().from(schema.tenants).where(eq(schema.tenants.slug, SUNRISE));
    const [lotus] = await handle.db.select().from(schema.tenants).where(eq(schema.tenants.slug, LOTUS));
    if (sunrise) await seedSunrise(handle.db, sunrise.id, log);
    else log('billing seed skipped sunrise (tenant missing)');
    if (lotus) await seedLotus(handle.db, lotus.id, log);
    else log('billing seed skipped lotus (tenant missing)');
  } finally {
    await Promise.race([handle.close(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
}

async function seedSunrise(db: ReturnType<typeof createDb>['db'], tenantId: string, log: (m: string) => void) {
  const fy = fyCode(new Date());
  const billNo = `MUMOB/${fy}/90001`;
  const existing = await db.execute<{ n: number }>(sql`select count(*)::int as n from bills where tenant_id = ${tenantId}::uuid and number = ${billNo}`);
  if (Number(existing.rows[0]?.n ?? 0) > 0) {
    log('sunrise billing sample already present');
    return;
  }
  const [location] = await db
    .select()
    .from(schema.locations)
    .where(and(eq(schema.locations.tenantId, tenantId), eq(schema.locations.code, 'MUM')));
  const encounters = await db
    .select()
    .from(schema.encounters)
    .where(and(eq(schema.encounters.tenantId, tenantId), eq(schema.encounters.kind, 'opd'), eq(schema.encounters.status, 'open')))
    .orderBy(asc(schema.encounters.number))
    .limit(2);
  const desk = encounters[0];
  const paid = encounters[1];
  if (!location || !desk || !paid) {
    log('sunrise billing seed skipped (encounters missing)');
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  await db.transaction(async (tx) => {
    await tx.insert(schema.charges).values({
      tenantId,
      locationId: location.id,
      encounterId: desk.id,
      patientId: desk.patientId,
      description: 'General consultation, new',
      qty: 1,
      unitPricePaise: 50_000,
      amountPaise: 50_000,
      discountPaise: 0,
      gstTreatment: 'exempt_healthcare',
      gstRateBp: 0,
      hsnSac: '9993',
      serviceDate: today,
      sourceModule: 'billing',
      sourceType: 'seed',
      sourceId: desk.id,
      sourceLine: 'desk',
      status: 'unbilled',
    });
    const [charge] = await tx
      .insert(schema.charges)
      .values({
        tenantId,
        locationId: location.id,
        encounterId: paid.id,
        patientId: paid.patientId,
        description: 'General consultation, follow-up',
        qty: 1,
        unitPricePaise: 30_000,
        amountPaise: 30_000,
        discountPaise: 0,
        gstTreatment: 'exempt_healthcare',
        gstRateBp: 0,
        hsnSac: '9993',
        serviceDate: today,
        sourceModule: 'billing',
        sourceType: 'seed',
        sourceId: paid.id,
        sourceLine: 'settled',
        status: 'unbilled',
      })
      .returning();
    const [bill] = await tx
      .insert(schema.bills)
      .values({
        tenantId,
        locationId: location.id,
        patientId: paid.patientId,
        encounterId: paid.id,
        kind: 'op',
        number: billNo,
        docType: 'bill_of_supply',
        status: 'final',
        payClass: 'cash',
        subtotalPaise: 30_000,
        discountPaise: 0,
        cgstPaise: 0,
        sgstPaise: 0,
        igstPaise: 0,
        roundOffPaise: 0,
        totalPaise: 30_000,
        paidPaise: 30_000,
        finalisedAt: new Date(),
      })
      .returning();
    if (!bill || !charge) return;
    await tx.update(schema.charges).set({ status: 'billed', billId: bill.id }).where(eq(schema.charges.id, charge.id));
    await tx.insert(schema.billLines).values({
      tenantId,
      billId: bill.id,
      chargeId: charge.id,
      lineNo: 1,
      description: charge.description,
      qty: 1,
      unitPricePaise: 30_000,
      amountPaise: 30_000,
      discountPaise: 0,
      billDiscountPaise: 0,
      taxablePaise: 30_000,
      gstTreatment: 'exempt_healthcare',
      configuredRateBp: 0,
      gstRateBp: 0,
      hsnSac: '9993',
      serviceDate: today,
    });
    const [cashRow] = await tx
      .insert(schema.cashLedger)
      .values({
        tenantId,
        locationId: location.id,
        entryType: 'receipt',
        direction: 'in',
        mode: 'upi',
        amountPaise: 30_000,
        number: `MUMRC/${fy}/90001`,
        patientId: paid.patientId,
        encounterId: paid.id,
        refType: 'bill',
        refId: bill.id,
        instrumentRef: 'UTR-SAMPLE-90001',
      })
      .returning();
    await tx.insert(schema.billSettlements).values({
      tenantId,
      billId: bill.id,
      mode: 'upi',
      amountPaise: 30_000,
      cashEntryId: cashRow?.id ?? null,
      instrumentRef: 'UTR-SAMPLE-90001',
    });
    const [depositCash] = await tx
      .insert(schema.cashLedger)
      .values({
        tenantId,
        locationId: location.id,
        entryType: 'deposit',
        direction: 'in',
        mode: 'cash',
        amountPaise: 2_000_00,
        number: `MUMDP/${fy}/90001`,
        patientId: desk.patientId,
        encounterId: desk.id,
        refType: 'deposit',
        refId: desk.patientId,
      })
      .returning();
    const [deposit] = await tx
      .insert(schema.deposits)
      .values({
        tenantId,
        locationId: location.id,
        patientId: desk.patientId,
        encounterId: desk.id,
        number: `MUMDP/${fy}/90001`,
        amountPaise: 2_000_00,
        balancePaise: 2_000_00,
        mode: 'cash',
        status: 'open',
      })
      .returning();
    if (deposit && depositCash) {
      await tx.update(schema.cashLedger).set({ refId: deposit.id }).where(eq(schema.cashLedger.id, depositCash.id));
    }
    if (bill) {
      await tx.insert(schema.concessions).values({
        tenantId,
        billId: bill.id,
        amountPaise: 100,
        reason: 'Sample concession (Sample)',
        status: 'requested',
      });
      const [refundRow] = await tx
        .insert(schema.refunds)
        .values({
          tenantId,
          billId: bill.id,
          number: `MUMRF/${fy}/90001`,
          amountPaise: 100,
          reason: 'Sample refund (Sample)',
          mode: 'cash',
        })
        .returning();
      if (refundRow) {
        await tx.insert(schema.creditNotes).values({
          tenantId,
          billId: bill.id,
          refundId: refundRow.id,
          number: `MUMCN/${fy}/90001`,
          amountPaise: 100,
          reason: 'Sample credit note (Sample)',
          status: 'issued',
        });
      }
    }
  });
  log('sunrise sample OP bill, unbilled consultation and deposit');
}

async function seedLotus(db: ReturnType<typeof createDb>['db'], tenantId: string, log: (m: string) => void) {
  const fy = fyCode(new Date());
  const billNo = `PUNOB/${fy}/90001`;
  const existing = await db.execute<{ n: number }>(sql`select count(*)::int as n from bills where tenant_id = ${tenantId}::uuid and number = ${billNo}`);
  if (Number(existing.rows[0]?.n ?? 0) > 0) {
    log('lotus billing sample already present');
    return;
  }
  const [location] = await db
    .select()
    .from(schema.locations)
    .where(and(eq(schema.locations.tenantId, tenantId), eq(schema.locations.isPrimary, true)));
  const [encounter] = await db
    .select()
    .from(schema.encounters)
    .where(and(eq(schema.encounters.tenantId, tenantId), eq(schema.encounters.kind, 'opd')))
    .limit(1);
  const [owner] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, 'owner@lotus.demo'));
  if (!location || !encounter) {
    log('lotus billing seed skipped (encounter missing)');
    return;
  }
  await db.transaction(async (tx) => {
    const [charge] = await tx
      .insert(schema.charges)
      .values({
        tenantId,
        locationId: location.id,
        encounterId: encounter.id,
        patientId: encounter.patientId,
        description: 'General consultation, new',
        qty: 1,
        unitPricePaise: 40_000,
        amountPaise: 40_000,
        gstTreatment: 'exempt_healthcare',
        gstRateBp: 0,
        hsnSac: '9993',
        serviceDate: '2026-04-01',
        sourceModule: 'billing',
        sourceType: 'seed',
        sourceId: encounter.id,
        sourceLine: 'iso',
        status: 'unbilled',
        postedBy: owner?.id ?? null,
      })
      .returning();
    const [bill] = await tx
      .insert(schema.bills)
      .values({
        tenantId,
        locationId: location.id,
        patientId: encounter.patientId,
        encounterId: encounter.id,
        kind: 'op',
        number: billNo,
        docType: 'bill_of_supply',
        status: 'final',
        payClass: 'cash',
        subtotalPaise: 40_000,
        discountPaise: 0,
        cgstPaise: 0,
        sgstPaise: 0,
        igstPaise: 0,
        roundOffPaise: 0,
        totalPaise: 40_000,
        paidPaise: 40_000,
        createdBy: owner?.id ?? null,
        finalisedAt: new Date(),
      })
      .returning();
    if (!bill || !charge) return;
    await tx.update(schema.charges).set({ status: 'billed', billId: bill.id }).where(eq(schema.charges.id, charge.id));
    await tx.insert(schema.billLines).values({
      tenantId,
      billId: bill.id,
      chargeId: charge.id,
      lineNo: 1,
      description: 'General consultation, new',
      qty: 1,
      unitPricePaise: 40_000,
      amountPaise: 40_000,
      discountPaise: 0,
      billDiscountPaise: 0,
      taxablePaise: 40_000,
      gstTreatment: 'exempt_healthcare',
      configuredRateBp: 0,
      gstRateBp: 0,
      hsnSac: '9993',
      serviceDate: '2026-04-01',
    });
    await tx.insert(schema.deposits).values({
      tenantId,
      locationId: location.id,
      patientId: encounter.patientId,
      number: `PUNDP/${fy}/90001`,
      amountPaise: 10_000,
      balancePaise: 10_000,
      mode: 'cash',
      status: 'open',
      receivedBy: owner?.id ?? null,
    });
    await tx.insert(schema.billSettlements).values({
      tenantId,
      billId: bill.id,
      mode: 'cash',
      amountPaise: 40_000,
      instrumentRef: 'Sample',
      receivedBy: owner?.id ?? null,
    });
    await tx.insert(schema.concessions).values({
      tenantId,
      billId: bill.id,
      amountPaise: 100,
      reason: 'Sample concession (Sample)',
      status: 'requested',
      requestedBy: owner?.id ?? null,
    });
    const [refundRow] = await tx
      .insert(schema.refunds)
      .values({
        tenantId,
        billId: bill.id,
        number: `PUNRF/${fy}/90001`,
        amountPaise: 100,
        reason: 'Sample refund (Sample)',
        mode: 'cash',
        approvedBy: owner?.id ?? null,
      })
      .returning();
    await tx.insert(schema.creditNotes).values({
      tenantId,
      billId: bill.id,
      refundId: refundRow?.id ?? null,
      number: `PUNCN/${fy}/90001`,
      amountPaise: 100,
      reason: 'Sample credit note (Sample)',
      status: 'issued',
    });
  });
  log('lotus sample bill, deposit, settlement, concession, refund and credit note');
}
