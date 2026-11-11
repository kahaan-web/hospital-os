import { schema } from '@hos/db';
import type { BillLineDto, ConcessionDto, ConcessionStatus, DepositDto, GstTreatment, OpBillDto, PayClass, PaymentMode, RefundDto } from '@hos/shared';

function day(value: Date | string | null | undefined): string {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function iso(value: Date | string | null | undefined): string {
  if (!value) return '';
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function lineDto(row: typeof schema.billLines.$inferSelect): BillLineDto {
  return {
    id: row.id,
    lineNo: row.lineNo,
    chargeId: row.chargeId,
    description: row.description,
    qty: Number(row.qty),
    unitPricePaise: row.unitPricePaise,
    amountPaise: row.amountPaise,
    discountPaise: row.discountPaise,
    billDiscountPaise: row.billDiscountPaise,
    taxablePaise: row.taxablePaise,
    gstTreatment: row.gstTreatment as GstTreatment,
    gstRateBp: row.gstRateBp,
    hsnSac: row.hsnSac,
    cgstPaise: row.cgstPaise,
    sgstPaise: row.sgstPaise,
    igstPaise: row.igstPaise,
    serviceId: row.serviceId,
    performingDoctorId: row.performingDoctorId,
    serviceDate: day(row.serviceDate),
  };
}

export function billDto(
  row: typeof schema.bills.$inferSelect,
  extra?: { patientName?: string; patientUhid?: string; lines?: BillLineDto[] },
): OpBillDto {
  return {
    id: row.id,
    number: row.number,
    kind: row.kind as 'op' | 'ip',
    status: row.status,
    totalPaise: row.totalPaise,
    paidPaise: row.paidPaise,
    patientId: row.patientId,
    encounterId: row.encounterId,
    locationId: row.locationId,
    docType: row.docType as OpBillDto['docType'],
    payClass: row.payClass as PayClass,
    subtotalPaise: row.subtotalPaise,
    discountPaise: row.discountPaise,
    cgstPaise: row.cgstPaise,
    sgstPaise: row.sgstPaise,
    igstPaise: row.igstPaise,
    roundOffPaise: row.roundOffPaise,
    balancePaise: row.totalPaise - row.paidPaise,
    patientName: extra?.patientName,
    patientUhid: extra?.patientUhid,
    lines: extra?.lines,
  };
}

export function depositDto(
  row: typeof schema.deposits.$inferSelect,
  extra?: { patientName?: string; patientUhid?: string },
): DepositDto {
  return {
    id: row.id,
    number: row.number,
    patientId: row.patientId,
    encounterId: row.encounterId,
    amountPaise: row.amountPaise,
    balancePaise: row.balancePaise,
    mode: row.mode as PaymentMode,
    status: row.status,
    instrumentRef: row.instrumentRef,
    patientName: extra?.patientName,
    patientUhid: extra?.patientUhid,
    createdAt: iso(row.createdAt),
  };
}

export function refundDto(row: typeof schema.refunds.$inferSelect): RefundDto {
  return {
    id: row.id,
    number: row.number,
    billId: row.billId,
    depositId: row.depositId,
    amountPaise: row.amountPaise,
    reason: row.reason,
    mode: row.mode as PaymentMode,
    createdAt: iso(row.createdAt),
  };
}

export function concessionDto(row: typeof schema.concessions.$inferSelect): ConcessionDto {
  return {
    id: row.id,
    billId: row.billId,
    amountPaise: row.amountPaise,
    reason: row.reason,
    status: row.status as ConcessionStatus,
    requestedBy: row.requestedBy,
    approvedBy: row.approvedBy,
  };
}
