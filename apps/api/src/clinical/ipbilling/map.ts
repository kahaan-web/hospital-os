import { schema } from '@hos/db';
import type { EncounterPayerDto, PayerDto, PayerReceivableDto } from '@hos/shared';

export function payerDto(row: typeof schema.payers.$inferSelect): PayerDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    kind: row.kind as PayerDto['kind'],
    gstin: row.gstin,
    stateCode: row.stateCode,
    creditDays: row.creditDays,
    active: row.active,
  };
}

export function encounterPayerDto(
  row: typeof schema.encounterPayers.$inferSelect,
  payer?: typeof schema.payers.$inferSelect,
): EncounterPayerDto {
  return {
    encounterId: row.encounterId,
    payerId: row.payerId,
    payerName: payer?.name,
    policyNo: row.policyNo,
    preauthAmountPaise: row.preauthAmountPaise,
    approvedAmountPaise: row.approvedAmountPaise,
    status: row.status,
  };
}

export function receivableDto(
  row: typeof schema.payerReceivables.$inferSelect,
  payer?: typeof schema.payers.$inferSelect,
): PayerReceivableDto {
  return {
    id: row.id,
    billId: row.billId,
    payerId: row.payerId,
    payerName: payer?.name,
    amountPaise: row.amountPaise,
    status: row.status,
  };
}
