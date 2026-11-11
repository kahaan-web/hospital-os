import { schema, type Tx } from '@hos/db';
import type { ClinicalCtx, GstTreatment, ServiceCreateInput, ServiceMasterDto, ServicePatchInput, TariffCreateInput, TariffDto, TariffPatchInput } from '@hos/shared';
import { asc, eq } from 'drizzle-orm';
import { ApiError } from '../../http';

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  if ('code' in error && typeof (error as { code: unknown }).code === 'string') return (error as { code: string }).code;
  if ('cause' in error) return errorCode((error as { cause: unknown }).cause);
  return undefined;
}

function day(value: Date | string): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function tariffDto(row: typeof schema.tariffs.$inferSelect): TariffDto {
  return {
    id: row.id,
    serviceId: row.serviceId,
    locationId: row.locationId,
    wardClass: row.wardClass,
    payerClass: row.payerClass,
    pricePaise: row.pricePaise,
    effectiveFrom: day(row.effectiveFrom),
  };
}

function rateFor(treatment: GstTreatment, rate: number): number {
  if (treatment === 'exempt_healthcare') return 0;
  return rate;
}

export async function listServiceMasters(ctx: ClinicalCtx<Tx>): Promise<ServiceMasterDto[]> {
  const services = await ctx.tx.select().from(schema.services).orderBy(asc(schema.services.code));
  const tariffs = await ctx.tx.select().from(schema.tariffs).orderBy(asc(schema.tariffs.effectiveFrom));
  return services.map((service) => ({
    id: service.id,
    code: service.code,
    name: service.name,
    category: service.category,
    doctorId: service.doctorId,
    hsnSac: service.hsnSac,
    gstTreatment: service.gstTreatment as GstTreatment,
    gstRateBp: service.gstRateBp,
    active: service.active,
    tariffs: tariffs.filter((row) => row.serviceId === service.id).map(tariffDto),
  }));
}

export async function createService(ctx: ClinicalCtx<Tx>, input: ServiceCreateInput): Promise<ServiceMasterDto> {
  try {
    const [row] = await ctx.tx
      .insert(schema.services)
      .values({
        tenantId: ctx.tenantId,
        code: input.code,
        name: input.name,
        category: input.category,
        doctorId: input.doctorId ?? null,
        hsnSac: input.hsnSac,
        gstTreatment: input.gstTreatment,
        gstRateBp: rateFor(input.gstTreatment, input.gstRateBp),
        active: true,
      })
      .returning();
    if (!row) throw new ApiError(422, 'validation', 'Could not save the service');
    await ctx.audit('billing.service.create', 'service', row.id, null, { code: row.code, name: row.name });
    return { ...((await listServiceMasters(ctx)).find((item) => item.id === row.id) as ServiceMasterDto) };
  } catch (error) {
    if (errorCode(error) === '23505') throw new ApiError(409, 'code_taken', 'That service code is already used');
    throw error;
  }
}

export async function patchService(ctx: ClinicalCtx<Tx>, id: string, input: ServicePatchInput): Promise<ServiceMasterDto> {
  const [existing] = await ctx.tx.select().from(schema.services).where(eq(schema.services.id, id));
  if (!existing) throw new ApiError(404, 'not_found', 'Service not found');
  const treatment = (input.gstTreatment ?? existing.gstTreatment) as GstTreatment;
  const rate = input.gstRateBp ?? existing.gstRateBp;
  const [row] = await ctx.tx
    .update(schema.services)
    .set({
      name: input.name ?? existing.name,
      category: input.category ?? existing.category,
      doctorId: input.doctorId === undefined ? existing.doctorId : input.doctorId,
      hsnSac: input.hsnSac ?? existing.hsnSac,
      gstTreatment: treatment,
      gstRateBp: rateFor(treatment, rate),
      active: input.active ?? existing.active,
      code: input.code ?? existing.code,
    })
    .where(eq(schema.services.id, id))
    .returning();
  await ctx.audit('billing.service.update', 'service', id, { name: existing.name, active: existing.active }, { name: row?.name, active: row?.active });
  const found = (await listServiceMasters(ctx)).find((item) => item.id === id);
  if (!found) throw new ApiError(404, 'not_found', 'Service not found');
  return found;
}

export async function createTariff(ctx: ClinicalCtx<Tx>, input: TariffCreateInput): Promise<TariffDto> {
  const [service] = await ctx.tx.select({ id: schema.services.id }).from(schema.services).where(eq(schema.services.id, input.serviceId));
  if (!service) throw new ApiError(404, 'not_found', 'Service not found');
  const [row] = await ctx.tx
    .insert(schema.tariffs)
    .values({
      tenantId: ctx.tenantId,
      serviceId: input.serviceId,
      locationId: input.locationId ?? null,
      wardClass: input.wardClass ?? null,
      payerClass: input.payerClass,
      pricePaise: input.pricePaise,
      effectiveFrom: input.effectiveFrom,
    })
    .returning();
  if (!row) throw new ApiError(422, 'validation', 'Could not save the tariff');
  await ctx.audit('billing.tariff.create', 'tariff', row.id, null, { serviceId: input.serviceId, pricePaise: input.pricePaise });
  return tariffDto(row);
}

export async function patchTariff(ctx: ClinicalCtx<Tx>, id: string, input: TariffPatchInput): Promise<TariffDto> {
  const [existing] = await ctx.tx.select().from(schema.tariffs).where(eq(schema.tariffs.id, id));
  if (!existing) throw new ApiError(404, 'not_found', 'Tariff not found');
  const [row] = await ctx.tx.update(schema.tariffs).set({ pricePaise: input.pricePaise }).where(eq(schema.tariffs.id, id)).returning();
  await ctx.audit('billing.tariff.update', 'tariff', id, { pricePaise: existing.pricePaise }, { pricePaise: input.pricePaise });
  if (!row) throw new ApiError(404, 'not_found', 'Tariff not found');
  return tariffDto(row);
}
