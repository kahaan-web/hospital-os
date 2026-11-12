import { schema, type Tx } from '@hos/db';
import type {
  AnalyzerResultInput,
  BillingStatusReader,
  ClinicalCtx,
  ClinicalGender,
  CollectSampleInput,
  LabAccessionDetailDto,
  LabAccessionStatus,
  LabFlag,
  LabMisDto,
  LabParamDto,
  LabParamInput,
  LabRefBand,
  LabReportDto,
  LabResultLineDto,
  LabTestCreateInput,
  LabTestDto,
  LabTestPatchInput,
  LabValueType,
  LabWorklistItemDto,
  NumberSeries,
  OrderService,
  SaveResultsInput,
  Specimen,
} from '@hos/shared';
import {
  ageLabel,
  ageYearsForLab,
  flagLabel,
  flagLabValue,
  isCriticalFlag,
  labRangeLabel,
  opdCollectionAllowed,
  worstLabFlag,
} from '@hos/shared';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { ApiError } from '../../http';

export interface LabDeps {
  billing: BillingStatusReader<Tx>;
  orders: OrderService<Tx>;
  numbering: NumberSeries<Tx>;
}

type Ctx = ClinicalCtx<Tx>;

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function asNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function asBands(value: unknown): LabRefBand[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is LabRefBand => !!row && typeof row === 'object' && 'sex' in row && 'ageMinYears' in row);
}

function asOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function pgCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  if ('code' in error && typeof (error as { code: unknown }).code === 'string') {
    const code = (error as { code: string }).code;
    if (/^[0-9A-Z]{5}$/.test(code)) return code;
  }
  if ('cause' in error) return pgCode((error as { cause: unknown }).cause);
  return undefined;
}

async function syncOrderStatus(ctx: Ctx, orderId: string): Promise<void> {
  const items = await ctx.tx.select({ status: schema.clinicalOrderItems.status }).from(schema.clinicalOrderItems).where(eq(schema.clinicalOrderItems.orderId, orderId));
  const open = items.some((item) => item.status !== 'done' && item.status !== 'cancelled');
  const started = items.some((item) => item.status === 'in_progress' || item.status === 'done');
  const status = !open ? 'completed' : started ? 'in_progress' : 'placed';
  await ctx.tx.update(schema.clinicalOrders).set({ status }).where(eq(schema.clinicalOrders.id, orderId));
}

function testDto(row: typeof schema.labTests.$inferSelect, service: { code: string; name: string }): LabTestDto {
  return {
    id: row.id,
    serviceId: row.serviceId,
    serviceCode: service.code,
    serviceName: service.name,
    specimen: row.specimen as Specimen,
    container: row.container,
    tatHours: row.tatHours,
    active: row.active,
  };
}

function paramDto(row: typeof schema.labTestParams.$inferSelect): LabParamDto {
  return {
    id: row.id,
    testId: row.testId,
    code: row.code,
    name: row.name,
    unit: row.unit,
    valueType: row.valueType as LabValueType,
    decimals: row.decimals,
    refRanges: asBands(row.refRanges),
    criticalLow: asNumber(row.criticalLow),
    criticalHigh: asNumber(row.criticalHigh),
    options: asOptions(row.options),
    sortOrder: row.sortOrder,
  };
}

export async function listTests(ctx: Ctx): Promise<LabTestDto[]> {
  const rows = await ctx.tx
    .select({ test: schema.labTests, code: schema.services.code, name: schema.services.name })
    .from(schema.labTests)
    .innerJoin(schema.services, eq(schema.services.id, schema.labTests.serviceId))
    .orderBy(asc(schema.services.name));
  return rows.map((row) => testDto(row.test, { code: row.code, name: row.name }));
}

export async function createTest(ctx: Ctx, input: LabTestCreateInput): Promise<LabTestDto> {
  const [service] = await ctx.tx.select().from(schema.services).where(eq(schema.services.id, input.serviceId));
  if (!service || service.category !== 'lab') throw new ApiError(422, 'validation', 'Choose a laboratory service');
  try {
    const [row] = await ctx.tx
      .insert(schema.labTests)
      .values({
        tenantId: ctx.tenantId,
        serviceId: service.id,
        specimen: input.specimen,
        container: input.container,
        tatHours: input.tatHours,
        active: input.active ?? true,
      })
      .returning();
    await ctx.audit('lab.test.create', 'lab_test', row!.id, null, { serviceId: service.id, code: service.code });
    return testDto(row!, service);
  } catch (error) {
    if (pgCode(error) === '23505') throw new ApiError(409, 'test_exists', 'This service already has a lab template');
    throw error;
  }
}

export async function updateTest(ctx: Ctx, id: string, input: LabTestPatchInput): Promise<LabTestDto> {
  const [existing] = await ctx.tx.select().from(schema.labTests).where(eq(schema.labTests.id, id));
  if (!existing) throw new ApiError(404, 'not_found', 'Lab test not found');
  const serviceId = input.serviceId ?? existing.serviceId;
  const [service] = await ctx.tx.select().from(schema.services).where(eq(schema.services.id, serviceId));
  if (!service || service.category !== 'lab') throw new ApiError(422, 'validation', 'Choose a laboratory service');
  try {
    const [row] = await ctx.tx
      .update(schema.labTests)
      .set({
        serviceId,
        specimen: input.specimen ?? existing.specimen,
        container: input.container ?? existing.container,
        tatHours: input.tatHours ?? existing.tatHours,
        active: input.active ?? existing.active,
      })
      .where(eq(schema.labTests.id, id))
      .returning();
    await ctx.audit('lab.test.update', 'lab_test', id, { specimen: existing.specimen, tatHours: existing.tatHours }, input);
    return testDto(row!, service);
  } catch (error) {
    if (pgCode(error) === '23505') throw new ApiError(409, 'test_exists', 'This service already has a lab template');
    throw error;
  }
}

export async function listParams(ctx: Ctx, testId: string): Promise<LabParamDto[]> {
  const [test] = await ctx.tx.select({ id: schema.labTests.id }).from(schema.labTests).where(eq(schema.labTests.id, testId));
  if (!test) throw new ApiError(404, 'not_found', 'Lab test not found');
  const rows = await ctx.tx.select().from(schema.labTestParams).where(eq(schema.labTestParams.testId, testId)).orderBy(asc(schema.labTestParams.sortOrder), asc(schema.labTestParams.code));
  return rows.map(paramDto);
}

export async function createParam(ctx: Ctx, testId: string, input: LabParamInput): Promise<LabParamDto> {
  const [test] = await ctx.tx.select({ id: schema.labTests.id }).from(schema.labTests).where(eq(schema.labTests.id, testId));
  if (!test) throw new ApiError(404, 'not_found', 'Lab test not found');
  const code = input.code.toUpperCase();
  try {
    const [row] = await ctx.tx
      .insert(schema.labTestParams)
      .values({
        tenantId: ctx.tenantId,
        testId,
        code,
        name: input.name,
        unit: input.unit ?? '',
        valueType: input.valueType,
        decimals: input.decimals ?? 0,
        refRanges: input.refRanges ?? [],
        criticalLow: input.criticalLow ?? null,
        criticalHigh: input.criticalHigh ?? null,
        options: input.valueType === 'coded' ? (input.options ?? []) : [],
        sortOrder: input.sortOrder ?? 0,
      })
      .returning();
    await ctx.audit('lab.param.create', 'lab_test_param', row!.id, null, { testId, code });
    return paramDto(row!);
  } catch (error) {
    if (pgCode(error) === '23505') throw new ApiError(409, 'param_exists', 'That parameter code is already on this test');
    throw error;
  }
}

export async function updateParam(ctx: Ctx, testId: string, paramId: string, input: Partial<LabParamInput>): Promise<LabParamDto> {
  const [existing] = await ctx.tx.select().from(schema.labTestParams).where(and(eq(schema.labTestParams.id, paramId), eq(schema.labTestParams.testId, testId)));
  if (!existing) throw new ApiError(404, 'not_found', 'Parameter not found');
  const valueType = (input.valueType ?? existing.valueType) as LabValueType;
  const options = input.options ?? asOptions(existing.options);
  if (valueType === 'coded' && options.length < 1) throw new ApiError(422, 'validation', 'Add at least one coded option');
  try {
    const [row] = await ctx.tx
      .update(schema.labTestParams)
      .set({
        code: input.code ? input.code.toUpperCase() : existing.code,
        name: input.name ?? existing.name,
        unit: input.unit ?? existing.unit,
        valueType,
        decimals: input.decimals ?? existing.decimals,
        refRanges: input.refRanges ?? asBands(existing.refRanges),
        criticalLow: input.criticalLow === undefined ? asNumber(existing.criticalLow) : input.criticalLow,
        criticalHigh: input.criticalHigh === undefined ? asNumber(existing.criticalHigh) : input.criticalHigh,
        options: valueType === 'coded' ? options : [],
        sortOrder: input.sortOrder ?? existing.sortOrder,
      })
      .where(eq(schema.labTestParams.id, paramId))
      .returning();
    await ctx.audit('lab.param.update', 'lab_test_param', paramId, { code: existing.code }, input);
    return paramDto(row!);
  } catch (error) {
    if (pgCode(error) === '23505') throw new ApiError(409, 'param_exists', 'That parameter code is already on this test');
    throw error;
  }
}

export async function worklist(ctx: Ctx, status: string | undefined): Promise<LabWorklistItemDto[]> {
  const rows = await ctx.tx
    .select({
      item: schema.clinicalOrderItems,
      order: schema.clinicalOrders,
      patientName: schema.patients.fullName,
      uhid: schema.patients.uhid,
      serviceName: schema.services.name,
      tatHours: schema.labTests.tatHours,
      encounterKind: schema.encounters.kind,
      accession: schema.labAccessions,
    })
    .from(schema.clinicalOrderItems)
    .innerJoin(schema.clinicalOrders, eq(schema.clinicalOrders.id, schema.clinicalOrderItems.orderId))
    .innerJoin(schema.encounters, eq(schema.encounters.id, schema.clinicalOrders.encounterId))
    .innerJoin(schema.patients, eq(schema.patients.id, schema.clinicalOrders.patientId))
    .leftJoin(schema.services, eq(schema.services.id, schema.clinicalOrderItems.serviceId))
    .leftJoin(schema.labTests, eq(schema.labTests.serviceId, schema.clinicalOrderItems.serviceId))
    .leftJoin(schema.labAccessions, eq(schema.labAccessions.orderItemId, schema.clinicalOrderItems.id))
    .where(and(eq(schema.clinicalOrders.kind, 'lab'), sql`${schema.clinicalOrders.status} <> 'cancelled'`, sql`${schema.clinicalOrderItems.status} <> 'cancelled'`))
    .orderBy(desc(schema.clinicalOrders.placedAt));
  const wanted = status && status !== 'actionable' ? status : null;
  return rows
    .filter((row) => {
      const current = row.accession?.status ?? 'pending';
      if (!wanted) return !row.accession || ['ordered', 'collected', 'received', 'resulted'].includes(row.accession.status);
      if (wanted === 'pending') return !row.accession;
      return current === wanted;
    })
    .map((row) => ({
      orderItemId: row.item.id,
      orderId: row.order.id,
      orderNumber: row.order.number,
      patientId: row.order.patientId,
      patientName: row.patientName ?? '',
      uhid: row.uhid,
      encounterKind: row.encounterKind,
      priority: row.order.priority,
      testName: row.serviceName ?? row.item.instructions ?? 'Lab test',
      serviceId: row.item.serviceId,
      accessionId: row.accession?.id ?? null,
      accessionNumber: row.accession?.number ?? null,
      status: row.accession?.status ?? 'pending',
      placedAt: iso(row.order.placedAt)!,
      tatHours: row.tatHours,
    }));
}

async function loadOrderItem(ctx: Ctx, orderItemId: string) {
  const [row] = await ctx.tx
    .select({ item: schema.clinicalOrderItems, order: schema.clinicalOrders, encounter: schema.encounters, patient: schema.patients, service: schema.services })
    .from(schema.clinicalOrderItems)
    .innerJoin(schema.clinicalOrders, eq(schema.clinicalOrders.id, schema.clinicalOrderItems.orderId))
    .innerJoin(schema.encounters, eq(schema.encounters.id, schema.clinicalOrders.encounterId))
    .innerJoin(schema.patients, eq(schema.patients.id, schema.clinicalOrders.patientId))
    .leftJoin(schema.services, eq(schema.services.id, schema.clinicalOrderItems.serviceId))
    .where(eq(schema.clinicalOrderItems.id, orderItemId));
  if (!row || row.order.kind !== 'lab') throw new ApiError(404, 'not_found', 'Lab order not found');
  if (row.order.status === 'cancelled' || row.item.status === 'cancelled') throw new ApiError(422, 'order_cancelled', 'This order is cancelled');
  return row;
}

export async function collectSample(ctx: Ctx, input: CollectSampleInput, deps: LabDeps): Promise<LabAccessionDetailDto> {
  const loaded = await loadOrderItem(ctx, input.orderItemId);
  if (loaded.item.status === 'done') throw new ApiError(409, 'already_collected', 'This test is already finished');
  const [existing] = await ctx.tx.select({ id: schema.labAccessions.id }).from(schema.labAccessions).where(eq(schema.labAccessions.orderItemId, loaded.item.id));
  if (existing) throw new ApiError(409, 'accession_exists', 'A sample is already logged for this test');
  const [settings] = await ctx.tx.select().from(schema.labSettings).where(eq(schema.labSettings.tenantId, ctx.tenantId));
  const source = { module: 'lab' as const, type: 'clinical_order', id: loaded.order.id, line: String(loaded.item.lineNo) };
  const settled = await deps.billing.settledSources(ctx, [source]);
  const key = `${source.type}:${source.id}:${source.line ?? ''}`;
  if (!opdCollectionAllowed(loaded.encounter.kind, settled.has(key), settings?.collectBeforePayment ?? false)) {
    throw new ApiError(422, 'payment_required', 'Collect the OP bill before taking this sample');
  }
  const [template] = loaded.item.serviceId
    ? await ctx.tx.select().from(schema.labTests).where(eq(schema.labTests.serviceId, loaded.item.serviceId))
    : [];
  const specimen = input.specimen ?? template?.specimen ?? 'blood';
  const number = await deps.numbering.next({ ...ctx, locationId: loaded.encounter.locationId }, 'lab_accession');
  const [row] = await ctx.tx
    .insert(schema.labAccessions)
    .values({
      tenantId: ctx.tenantId,
      locationId: loaded.encounter.locationId,
      patientId: loaded.patient.id,
      encounterId: loaded.encounter.id,
      orderItemId: loaded.item.id,
      number,
      barcode: number,
      status: 'collected',
      specimen,
      collectedAt: input.collectedAt ? new Date(input.collectedAt) : new Date(),
      collectedBy: ctx.userId,
    })
    .returning();
  await deps.orders.recordFulfilment(ctx, loaded.item.id, { status: 'in_progress', qty: 1, refType: 'lab_accession', refId: row!.id });
  await syncOrderStatus(ctx, loaded.order.id);
  await ctx.audit('lab.accession.collect', 'lab_accession', row!.id, null, { number, orderItemId: loaded.item.id });
  return accessionDetail(ctx, row!.id);
}

async function loadAccession(ctx: Ctx, id: string) {
  const [row] = await ctx.tx.select().from(schema.labAccessions).where(eq(schema.labAccessions.id, id));
  if (!row) throw new ApiError(404, 'not_found', 'Accession not found');
  return row;
}

export async function receiveSample(ctx: Ctx, id: string): Promise<LabAccessionDetailDto> {
  const row = await loadAccession(ctx, id);
  if (row.status === 'rejected') throw new ApiError(422, 'sample_rejected', 'This sample was rejected');
  if (row.status !== 'collected' && row.status !== 'ordered') throw new ApiError(409, 'already_received', 'This sample is already in the lab');
  await ctx.tx.update(schema.labAccessions).set({ status: 'received', receivedAt: new Date(), receivedBy: ctx.userId }).where(eq(schema.labAccessions.id, id));
  await ctx.audit('lab.accession.receive', 'lab_accession', id, { status: row.status }, { status: 'received' });
  return accessionDetail(ctx, id);
}

export async function rejectSample(ctx: Ctx, id: string, reason: string, deps: LabDeps): Promise<LabAccessionDetailDto> {
  const row = await loadAccession(ctx, id);
  if (row.status === 'verified' || row.status === 'reported') throw new ApiError(409, 'immutable_report', 'A verified report cannot be rejected');
  if (row.status === 'rejected') return accessionDetail(ctx, id);
  await ctx.tx.update(schema.labAccessions).set({ status: 'rejected', rejectedAt: new Date(), rejectReason: reason }).where(eq(schema.labAccessions.id, id));
  await deps.orders.recordFulfilment(ctx, row.orderItemId, { status: 'in_progress', refType: 'lab_accession', refId: id });
  await ctx.audit('lab.accession.reject', 'lab_accession', id, { status: row.status }, { status: 'rejected', reason });
  return accessionDetail(ctx, id);
}

interface ResultContext {
  accession: typeof schema.labAccessions.$inferSelect;
  patient: typeof schema.patients.$inferSelect;
  params: LabParamDto[];
  testName: string;
  results: Array<typeof schema.labResults.$inferSelect>;
}

async function resultContext(ctx: Ctx, accessionId: string): Promise<ResultContext> {
  const accession = await loadAccession(ctx, accessionId);
  const [patient] = await ctx.tx.select().from(schema.patients).where(eq(schema.patients.id, accession.patientId));
  if (!patient) throw new ApiError(404, 'not_found', 'Patient not found');
  const [item] = await ctx.tx.select().from(schema.clinicalOrderItems).where(eq(schema.clinicalOrderItems.id, accession.orderItemId));
  const [service] = item?.serviceId ? await ctx.tx.select().from(schema.services).where(eq(schema.services.id, item.serviceId)) : [];
  const [test] = item?.serviceId ? await ctx.tx.select().from(schema.labTests).where(eq(schema.labTests.serviceId, item.serviceId)) : [];
  const params = test ? (await ctx.tx.select().from(schema.labTestParams).where(eq(schema.labTestParams.testId, test.id)).orderBy(asc(schema.labTestParams.sortOrder))).map(paramDto) : [];
  const results = await ctx.tx.select().from(schema.labResults).where(eq(schema.labResults.accessionId, accession.id)).orderBy(asc(schema.labResults.version));
  return { accession, patient, params, testName: service?.name ?? 'Lab test', results };
}

function patientAge(patient: typeof schema.patients.$inferSelect) {
  const sex = (patient.gender as ClinicalGender) || 'other';
  const years = ageYearsForLab(patient.dob, patient.ageYearsAtReg);
  return { sex, years, label: ageLabel(patient.dob) || (patient.ageYearsAtReg != null ? `${patient.ageYearsAtReg} Y` : '') };
}

function scoreValue(param: LabParamDto, patient: typeof schema.patients.$inferSelect, valueNum: number | null, valueText: string | null) {
  const { sex, years } = patientAge(patient);
  if (param.valueType === 'numeric') {
    if (valueNum == null) throw new ApiError(422, 'validation', `Enter a number for ${param.name}`);
    const flag = flagLabValue({
      valueType: 'numeric',
      valueNum,
      sex,
      ageYears: years,
      refRanges: param.refRanges,
      criticalLow: param.criticalLow,
      criticalHigh: param.criticalHigh,
    });
    return { valueNum, valueText: null as string | null, flag };
  }
  const text = valueText?.trim() ?? '';
  if (!text) throw new ApiError(422, 'validation', `Enter a value for ${param.name}`);
  if (param.valueType === 'coded' && !param.options.includes(text)) {
    throw new ApiError(422, 'validation', `${param.name} must be one of: ${param.options.join(', ')}`);
  }
  return { valueNum: null as number | null, valueText: text, flag: null as LabFlag | null };
}

export async function saveResults(ctx: Ctx, id: string, input: SaveResultsInput, deps: LabDeps): Promise<LabAccessionDetailDto> {
  const loaded = await resultContext(ctx, id);
  if (loaded.accession.status === 'rejected') throw new ApiError(422, 'sample_rejected', 'This sample was rejected');
  if (loaded.accession.status === 'collected' || loaded.accession.status === 'ordered') {
    throw new ApiError(422, 'not_received', 'Receive the sample before entering results');
  }
  if (loaded.params.length === 0) throw new ApiError(422, 'no_template', 'Add a master template for this test before entering results');
  const byId = new Map(loaded.params.map((param) => [param.id, param]));
  for (const value of input.values) {
    if (!byId.has(value.paramId)) throw new ApiError(422, 'validation', 'That parameter is not on this test');
  }
  const maxVersion = loaded.results.reduce((max, row) => Math.max(max, row.version), 0);
  const latest = loaded.results.filter((row) => row.version === maxVersion);
  const locked = latest.some((row) => row.verifiedBy) || loaded.accession.status === 'verified' || loaded.accession.status === 'reported';
  if (locked && !input.amendReason) {
    throw new ApiError(422, 'amendment_required', 'A verified report is locked. Give a reason to file an amendment');
  }
  const version = locked ? maxVersion + 1 : Math.max(maxVersion, 1);
  const previous = new Map(latest.map((row) => [row.paramId, row]));
  const incoming = new Map(input.values.map((value) => [value.paramId, value]));
  const targets = locked ? loaded.params : loaded.params.filter((param) => incoming.has(param.id));
  for (const param of targets) {
    const sent = incoming.get(param.id);
    const prior = previous.get(param.id);
    const valueNum = sent ? asNumber(sent.valueNum) : asNumber(prior?.valueNum);
    const valueText = sent ? (sent.valueText ?? null) : (prior?.valueText ?? null);
    if (!sent && !prior) continue;
    const scored = scoreValue(param, loaded.patient, valueNum, valueText);
    if (!locked && prior && !prior.verifiedBy) {
      await ctx.tx
        .update(schema.labResults)
        .set({ valueNum: scored.valueNum, valueText: scored.valueText, flag: scored.flag, enteredBy: ctx.userId || null })
        .where(eq(schema.labResults.id, prior.id));
    } else {
      await ctx.tx.insert(schema.labResults).values({
        tenantId: ctx.tenantId,
        accessionId: id,
        paramId: param.id,
        valueNum: scored.valueNum,
        valueText: scored.valueText,
        flag: scored.flag,
        enteredBy: ctx.userId || null,
        version,
      });
    }
  }
  await ctx.tx.update(schema.labAccessions).set({ status: 'resulted' }).where(eq(schema.labAccessions.id, id));
  await deps.orders.recordFulfilment(ctx, loaded.accession.orderItemId, { status: 'in_progress', refType: 'lab_accession', refId: id });
  await syncOrderStatus(ctx, (await ctx.tx.select({ orderId: schema.clinicalOrderItems.orderId }).from(schema.clinicalOrderItems).where(eq(schema.clinicalOrderItems.id, loaded.accession.orderItemId)))[0]!.orderId);
  await ctx.audit(locked ? 'lab.result.amend' : 'lab.result.save', 'lab_accession', id, { version: maxVersion }, { version, reason: input.amendReason ?? null });
  return accessionDetail(ctx, id);
}

export async function verifyAccession(ctx: Ctx, id: string, deps: LabDeps): Promise<LabAccessionDetailDto> {
  const loaded = await resultContext(ctx, id);
  if (loaded.accession.status !== 'resulted') throw new ApiError(422, 'not_resulted', 'Enter results before verifying');
  const maxVersion = loaded.results.reduce((max, row) => Math.max(max, row.version), 0);
  const latest = loaded.results.filter((row) => row.version === maxVersion);
  if (latest.some((row) => row.verifiedBy)) throw new ApiError(409, 'already_verified', 'This version is already verified');
  const have = new Set(latest.map((row) => row.paramId));
  const missing = loaded.params.filter((param) => !have.has(param.id));
  if (missing.length > 0) throw new ApiError(422, 'incomplete', `Enter ${missing.map((param) => param.name).join(', ')} before verifying`);
  const at = new Date();
  for (const row of latest) {
    await ctx.tx.update(schema.labResults).set({ verifiedBy: ctx.userId, verifiedAt: at }).where(eq(schema.labResults.id, row.id));
  }
  await ctx.tx.update(schema.labAccessions).set({ status: 'verified', verifiedAt: at }).where(eq(schema.labAccessions.id, id));
  await deps.orders.recordFulfilment(ctx, loaded.accession.orderItemId, { status: 'done', qty: 1, refType: 'lab_accession', refId: id });
  const [item] = await ctx.tx.select({ orderId: schema.clinicalOrderItems.orderId }).from(schema.clinicalOrderItems).where(eq(schema.clinicalOrderItems.id, loaded.accession.orderItemId));
  if (item) await syncOrderStatus(ctx, item.orderId);
  await ctx.audit('lab.result.verify', 'lab_accession', id, { status: 'resulted', version: maxVersion }, { status: 'verified', version: maxVersion });
  return accessionDetail(ctx, id);
}

function linesFor(loaded: ResultContext, version: number): LabResultLineDto[] {
  const { sex, years } = patientAge(loaded.patient);
  const byParam = new Map(loaded.results.filter((row) => row.version === version).map((row) => [row.paramId, row]));
  return loaded.params.map((param) => {
    const row = byParam.get(param.id);
    const flag = (row?.flag as LabFlag | null) ?? null;
    return {
      paramId: param.id,
      code: param.code,
      name: param.name,
      unit: param.unit,
      valueType: param.valueType,
      decimals: param.decimals,
      options: param.options,
      refRanges: param.refRanges,
      rangeLabel: labRangeLabel(param.refRanges, sex, years, param.unit),
      criticalLow: param.criticalLow,
      criticalHigh: param.criticalHigh,
      valueNum: asNumber(row?.valueNum),
      valueText: row?.valueText ?? null,
      flag,
      flagLabel: flagLabel(flag),
      critical: isCriticalFlag(flag),
      version,
    };
  });
}

export async function accessionDetail(ctx: Ctx, id: string): Promise<LabAccessionDetailDto> {
  const loaded = await resultContext(ctx, id);
  const maxVersion = loaded.results.reduce((max, row) => Math.max(max, row.version), 0);
  const version = Math.max(maxVersion, 1);
  const latest = loaded.results.filter((row) => row.version === maxVersion);
  const age = patientAge(loaded.patient);
  return {
    id: loaded.accession.id,
    number: loaded.accession.number,
    barcode: loaded.accession.barcode,
    status: loaded.accession.status as LabAccessionStatus,
    specimen: loaded.accession.specimen as Specimen,
    patientId: loaded.patient.id,
    patientName: loaded.patient.fullName ?? '',
    uhid: loaded.patient.uhid,
    sex: age.sex,
    ageLabel: age.label,
    ageYears: age.years,
    testName: loaded.testName,
    orderItemId: loaded.accession.orderItemId,
    collectedAt: iso(loaded.accession.collectedAt),
    receivedAt: iso(loaded.accession.receivedAt),
    verifiedAt: iso(loaded.accession.verifiedAt),
    reportedAt: iso(loaded.accession.reportedAt),
    rejectReason: loaded.accession.rejectReason,
    version,
    immutable: latest.some((row) => row.verifiedBy != null),
    lines: loaded.params.length === 0 ? [] : linesFor(loaded, version),
  };
}

export async function reportFor(ctx: Ctx, id: string): Promise<LabReportDto> {
  const loaded = await resultContext(ctx, id);
  const verifiedVersions = loaded.results.filter((row) => row.verifiedBy).map((row) => row.version);
  const maxVersion = loaded.results.reduce((max, row) => Math.max(max, row.version), 0);
  const version = verifiedVersions.length > 0 ? Math.max(...verifiedVersions) : Math.max(maxVersion, 1);
  const age = patientAge(loaded.patient);
  const lines = linesFor(loaded, version).filter((line) => line.valueNum != null || line.valueText);
  return {
    accessionId: id,
    number: loaded.accession.number,
    barcode: loaded.accession.barcode,
    status: loaded.accession.status,
    patientName: loaded.patient.fullName ?? '',
    uhid: loaded.patient.uhid,
    sex: age.sex,
    ageLabel: age.label,
    testName: loaded.testName,
    specimen: loaded.accession.specimen,
    collectedAt: iso(loaded.accession.collectedAt),
    verifiedAt: iso(loaded.accession.verifiedAt),
    version,
    immutable: verifiedVersions.length > 0,
    lines: lines.map((line) => ({
      name: line.name,
      value: line.valueNum != null ? new Intl.NumberFormat('en-IN', { maximumFractionDigits: line.decimals }).format(line.valueNum) : (line.valueText ?? ''),
      unit: line.unit,
      flag: line.flag,
      flagLabel: line.flagLabel,
      rangeLabel: line.rangeLabel,
      critical: line.critical,
    })),
  };
}

export async function emailReport(ctx: Ctx, id: string, to: string | undefined, send: (message: { to: string; subject: string; body: string }) => Promise<void>): Promise<{ status: 'queued'; to: string }> {
  const report = await reportFor(ctx, id);
  if (!report.immutable) throw new ApiError(422, 'not_verified', 'Verify the report before sending it');
  const [patient] = await ctx.tx.select({ email: schema.patients.email }).from(schema.patients).where(eq(schema.patients.id, (await loadAccession(ctx, id)).patientId));
  const destination = (to ?? patient?.email ?? '').trim();
  if (!destination) throw new ApiError(422, 'no_email', 'This patient has no email address');
  const body = [`${report.testName} (${report.number})`, ...report.lines.map((line) => `${line.name}: ${line.value} ${line.unit} ${line.flagLabel}`.trim())].join('\n');
  await send({ to: destination, subject: `Lab report ${report.number}`, body });
  await ctx.tx.update(schema.labAccessions).set({ status: 'reported', reportedAt: new Date() }).where(eq(schema.labAccessions.id, id));
  await ctx.audit('lab.result.email', 'lab_accession', id, { status: report.status }, { status: 'reported', to: destination });
  return { status: 'queued', to: destination };
}

export async function reportsForPatient(ctx: Ctx, patientId: string) {
  const [patient] = await ctx.tx.select({ id: schema.patients.id }).from(schema.patients).where(eq(schema.patients.id, patientId));
  if (!patient) throw new ApiError(404, 'not_found', 'Patient not found');
  const rows = await ctx.tx
    .select({ accession: schema.labAccessions, serviceName: schema.services.name })
    .from(schema.labAccessions)
    .innerJoin(schema.clinicalOrderItems, eq(schema.clinicalOrderItems.id, schema.labAccessions.orderItemId))
    .leftJoin(schema.services, eq(schema.services.id, schema.clinicalOrderItems.serviceId))
    .where(and(eq(schema.labAccessions.patientId, patientId), sql`${schema.labAccessions.status} in ('verified', 'reported')`))
    .orderBy(desc(schema.labAccessions.verifiedAt));
  return rows.map((row) => ({
    id: row.accession.id,
    orderItemId: row.accession.orderItemId,
    name: row.serviceName ?? 'Lab test',
    status: row.accession.status,
    reportedAt: iso(row.accession.reportedAt ?? row.accession.verifiedAt),
  }));
}

export async function summariesFor(ctx: Ctx, orderItemIds: string[]) {
  const map = new Map<string, { orderItemId: string; status: string; flag: string | null; reportedAt: string | null }>();
  if (orderItemIds.length === 0) return map;
  const rows = await ctx.tx
    .select({ accession: schema.labAccessions, flag: schema.labResults.flag, version: schema.labResults.version })
    .from(schema.labAccessions)
    .leftJoin(schema.labResults, eq(schema.labResults.accessionId, schema.labAccessions.id))
    .where(sql`${schema.labAccessions.orderItemId} in (${sql.join(orderItemIds.map((id) => sql`${id}::uuid`), sql`, `)})`);
  const grouped = new Map<string, { status: string; reportedAt: string | null; flags: Array<{ version: number; flag: string | null }> }>();
  for (const row of rows) {
    const current = grouped.get(row.accession.orderItemId) ?? {
      status: row.accession.status,
      reportedAt: iso(row.accession.reportedAt ?? row.accession.verifiedAt),
      flags: [],
    };
    current.flags.push({ version: row.version ?? 0, flag: row.flag });
    grouped.set(row.accession.orderItemId, current);
  }
  for (const [orderItemId, group] of grouped) {
    const max = group.flags.reduce((n, row) => Math.max(n, row.version), 0);
    const flag = worstLabFlag(group.flags.filter((row) => row.version === max).map((row) => row.flag as LabFlag | null));
    map.set(orderItemId, { orderItemId, status: group.status, flag, reportedAt: group.reportedAt });
  }
  return map;
}

export async function misReport(ctx: Ctx, from: string, to: string): Promise<LabMisDto> {
  if (from > to) throw new ApiError(422, 'validation', 'From date must be on or before the to date');
  const counts = await ctx.tx.execute<{ status: string; n: number }>(sql`
    select status, count(*)::int as n
      from lab_accessions
     where coalesce(collected_at, created_at) >= ${from}::date
       and coalesce(collected_at, created_at) < (${to}::date + interval '1 day')
     group by status
  `);
  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const row of counts.rows) {
    byStatus[row.status] = Number(row.n);
    total += Number(row.n);
  }
  const critical = await ctx.tx.execute<{ n: number }>(sql`
    select count(distinct a.id)::int as n
      from lab_accessions a
      join lab_results r on r.accession_id = a.id and r.tenant_id = a.tenant_id
     where r.flag in ('LL', 'HH')
       and coalesce(a.collected_at, a.created_at) >= ${from}::date
       and coalesce(a.collected_at, a.created_at) < (${to}::date + interval '1 day')
  `);
  const breaches = await ctx.tx.execute<{ n: number }>(sql`
    select count(*)::int as n
      from lab_accessions a
      join clinical_order_items i on i.id = a.order_item_id and i.tenant_id = a.tenant_id
      join lab_tests t on t.service_id = i.service_id and t.tenant_id = a.tenant_id
     where a.verified_at is not null
       and a.collected_at is not null
       and a.verified_at > a.collected_at + (t.tat_hours || ' hours')::interval
       and coalesce(a.collected_at, a.created_at) >= ${from}::date
       and coalesce(a.collected_at, a.created_at) < (${to}::date + interval '1 day')
  `);
  return {
    from,
    to,
    total,
    byStatus,
    criticalCount: Number(critical.rows[0]?.n ?? 0),
    tatBreaches: Number(breaches.rows[0]?.n ?? 0),
  };
}

export type LabTatRow = { testName: string; samples: number; avgHours: number; targetHours: number; breaches: number };
export type LabCriticalRow = {
  accessionId: string;
  accessionNumber: string;
  patientName: string;
  uhid: string;
  parameter: string;
  value: string;
  flag: string;
  verifiedAt: string | null;
};

/** Read-only TAT by test (collected to verified) for the date range, with breaches against the test target. */
export async function tatReport(ctx: Ctx, from: string, to: string): Promise<LabTatRow[]> {
  if (from > to) throw new ApiError(422, 'validation', 'From date must be on or before the to date');
  const res = await ctx.tx.execute<{ name: string; samples: number; avg_hours: string | null; target: number; breaches: number }>(sql`
    select s.name as name,
           count(*)::int as samples,
           avg(extract(epoch from (a.verified_at - a.collected_at)) / 3600.0) as avg_hours,
           t.tat_hours as target,
           (count(*) filter (where a.verified_at > a.collected_at + (t.tat_hours || ' hours')::interval))::int as breaches
      from lab_accessions a
      join clinical_order_items i on i.id = a.order_item_id and i.tenant_id = a.tenant_id
      join lab_tests t on t.service_id = i.service_id and t.tenant_id = a.tenant_id
      join services s on s.id = t.service_id and s.tenant_id = t.tenant_id
     where a.verified_at is not null
       and a.collected_at is not null
       and a.collected_at >= ${from}::date
       and a.collected_at < (${to}::date + interval '1 day')
     group by s.name, t.tat_hours
     order by s.name
  `);
  return res.rows.map((row) => ({
    testName: row.name,
    samples: Number(row.samples),
    avgHours: Math.round(Number(row.avg_hours ?? 0) * 10) / 10,
    targetHours: Number(row.target),
    breaches: Number(row.breaches),
  }));
}

/** Read-only log of critical (LL/HH) results for the date range, newest first. */
export async function criticalLog(ctx: Ctx, from: string, to: string): Promise<LabCriticalRow[]> {
  if (from > to) throw new ApiError(422, 'validation', 'From date must be on or before the to date');
  const res = await ctx.tx.execute<{
    accession_id: string;
    number: string;
    patient_name: string;
    uhid: string;
    parameter: string;
    value_num: string | null;
    value_text: string | null;
    flag: string;
    verified_at: Date | string | null;
  }>(sql`
    select a.id as accession_id, a.number, p.full_name as patient_name, p.uhid, tp.name as parameter,
           r.value_num, r.value_text, r.flag, a.verified_at
      from lab_results r
      join lab_accessions a on a.id = r.accession_id and a.tenant_id = r.tenant_id
      join patients p on p.id = a.patient_id and p.tenant_id = a.tenant_id
      join lab_test_params tp on tp.id = r.param_id and tp.tenant_id = r.tenant_id
     where r.flag in ('LL', 'HH')
       and coalesce(a.collected_at, a.created_at) >= ${from}::date
       and coalesce(a.collected_at, a.created_at) < (${to}::date + interval '1 day')
     order by coalesce(a.collected_at, a.created_at) desc, a.number
     limit 200
  `);
  return res.rows.map((row) => ({
    accessionId: row.accession_id,
    accessionNumber: row.number,
    patientName: row.patient_name,
    uhid: row.uhid,
    parameter: row.parameter,
    value: row.value_num !== null && row.value_num !== undefined ? String(Number(row.value_num)) : (row.value_text ?? ''),
    flag: row.flag,
    verifiedAt: row.verified_at ? new Date(row.verified_at).toISOString() : null,
  }));
}

export async function applyAnalyzer(ctx: Ctx, input: AnalyzerResultInput, deps: LabDeps): Promise<{ accessionId: string; version: number }> {
  const [accession] = await ctx.tx.select().from(schema.labAccessions).where(eq(schema.labAccessions.number, input.accessionNumber));
  if (!accession) throw new ApiError(404, 'not_found', 'Accession not found');
  if (accession.status === 'rejected') throw new ApiError(422, 'sample_rejected', 'This sample was rejected');
  if (accession.status === 'verified' || accession.status === 'reported') {
    throw new ApiError(409, 'immutable_report', 'A verified report cannot be overwritten by the analyser');
  }
  if (accession.status === 'collected' || accession.status === 'ordered') {
    await ctx.tx.update(schema.labAccessions).set({ status: 'received', receivedAt: new Date() }).where(eq(schema.labAccessions.id, accession.id));
  }
  const loaded = await resultContext(ctx, accession.id);
  if (loaded.params.length === 0) throw new ApiError(422, 'no_template', 'This test has no parameter template');
  const byCode = new Map(loaded.params.map((param) => [param.code.toUpperCase(), param]));
  const values = input.values.map((value) => {
    const param = byCode.get(value.paramCode.toUpperCase());
    if (!param) throw new ApiError(422, 'validation', `Unknown parameter ${value.paramCode}`);
    return { paramId: param.id, valueNum: value.valueNum ?? null, valueText: value.valueText ?? null };
  });
  const saved = await saveResults(ctx, accession.id, { values }, deps);
  await ctx.audit('lab.interface.ingest', 'lab_accession', accession.id, null, { number: input.accessionNumber, version: saved.version });
  return { accessionId: accession.id, version: saved.version };
}
