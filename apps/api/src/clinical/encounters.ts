import { schema, type Tx } from '@hos/db';
import type { EncounterDto, EncounterService, PatientSummaryDto, PayerType, VisitType } from '@hos/shared';
import { ageLabel, maskMobile } from '@hos/shared';
import { eq } from 'drizzle-orm';
import { ApiError } from '../http';
import { numbering } from './numbering';

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function patientSummary(row: typeof schema.patients.$inferSelect): PatientSummaryDto {
  return {
    id: row.id,
    uhid: row.uhid,
    fullName: row.fullName ?? '',
    gender: row.gender as PatientSummaryDto['gender'],
    ageLabel: ageLabel(row.dob),
    mobileMasked: maskMobile(row.mobile),
    city: row.city,
  };
}

export function encounterDto(row: typeof schema.encounters.$inferSelect, patient?: PatientSummaryDto): EncounterDto {
  return {
    id: row.id,
    locationId: row.locationId,
    patientId: row.patientId,
    kind: row.kind as EncounterDto['kind'],
    number: row.number,
    status: row.status as EncounterDto['status'],
    doctorId: row.doctorId,
    departmentId: row.departmentId,
    visitType: (row.visitType as VisitType | null) ?? null,
    appointmentId: row.appointmentId,
    payerType: row.payerType as PayerType,
    isMlc: row.isMlc,
    currentWardCode: row.currentWardCode,
    currentBedLabel: row.currentBedLabel,
    referredBy: row.referredBy,
    startedAt: iso(row.startedAt)!,
    endedAt: iso(row.endedAt),
    createdBy: row.createdBy,
    ...(patient ? { patient } : {}),
  };
}

export const encounterService: EncounterService<Tx> = {
  async openOpd(ctx, input) {
    if (!ctx.locationId) throw new ApiError(422, 'location_required', 'Choose a location');
    const [patient] = await ctx.tx.select().from(schema.patients).where(eq(schema.patients.id, input.patientId));
    if (!patient) throw new ApiError(404, 'not_found', 'Patient not found');
    const number = await numbering.next(ctx, 'opd_visit');
    const [row] = await ctx.tx
      .insert(schema.encounters)
      .values({
        tenantId: ctx.tenantId,
        locationId: ctx.locationId,
        patientId: input.patientId,
        kind: 'opd',
        number,
        status: 'open',
        doctorId: input.doctorId,
        departmentId: input.departmentId ?? null,
        visitType: input.visitType,
        appointmentId: input.appointmentId ?? null,
        payerType: input.payerType ?? 'self',
        createdBy: ctx.userId,
      })
      .returning();
    await ctx.audit('clinical.encounter.open', 'encounter', row!.id, null, { kind: 'opd', number });
    return encounterDto(row!, patientSummary(patient));
  },

  async openIpd(ctx, input) {
    if (!ctx.locationId) throw new ApiError(422, 'location_required', 'Choose a location');
    const [patient] = await ctx.tx.select().from(schema.patients).where(eq(schema.patients.id, input.patientId));
    if (!patient) throw new ApiError(404, 'not_found', 'Patient not found');
    const [row] = await ctx.tx
      .insert(schema.encounters)
      .values({
        tenantId: ctx.tenantId,
        locationId: ctx.locationId,
        patientId: input.patientId,
        kind: 'ipd',
        number: input.number,
        status: 'open',
        doctorId: input.doctorId,
        departmentId: input.departmentId ?? null,
        payerType: input.payerType,
        isMlc: input.isMlc,
        createdBy: ctx.userId,
      })
      .returning();
    await ctx.audit('clinical.encounter.open', 'encounter', row!.id, null, { kind: 'ipd', number: input.number });
    return encounterDto(row!, patientSummary(patient));
  },

  async setBedLabels(ctx, encounterId, labels) {
    const [row] = await ctx.tx.select().from(schema.encounters).where(eq(schema.encounters.id, encounterId));
    if (!row) throw new ApiError(404, 'not_found', 'Encounter not found');
    await ctx.tx
      .update(schema.encounters)
      .set({ currentWardCode: labels.wardCode, currentBedLabel: labels.bedLabel })
      .where(eq(schema.encounters.id, encounterId));
    await ctx.audit('clinical.encounter.bed', 'encounter', encounterId, { ward: row.currentWardCode, bed: row.currentBedLabel }, labels);
  },

  async close(ctx, encounterId, at) {
    const [row] = await ctx.tx.select().from(schema.encounters).where(eq(schema.encounters.id, encounterId));
    if (!row) throw new ApiError(404, 'not_found', 'Encounter not found');
    const endedAt = at ?? new Date();
    const [updated] = await ctx.tx
      .update(schema.encounters)
      .set({ status: 'closed', endedAt })
      .where(eq(schema.encounters.id, encounterId))
      .returning();
    await ctx.audit('clinical.encounter.close', 'encounter', encounterId, { status: row.status }, { status: 'closed' });
    return encounterDto(updated!);
  },
};
