import { schema, type Tx } from '@hos/db';
import {
  CLINICAL_FEATURES,
  type AdmissionRequestInput,
  type CasePaperDto,
  type CasePaperInput,
  type ClinicalCtx,
  type ClinicalNoteKind,
  type ClinicalOrderDto,
  type InpatientRowDto,
  type MyQueueItemDto,
  type OrderSetDto,
  type OrderSetInput,
  type OrderSetItem,
  type PrescriptionInput,
  type ServiceOrderInput,
  type VitalsGraphDto,
} from '@hos/shared';
import { and, asc, desc, eq, gte, isNull, lt, or } from 'drizzle-orm';
import { ApiError } from '../../http';
import { admissions } from '../adt/public';
import { patientSummary } from '../encounters';
import { listAlerts, noteDto, readPatient, vitalDto } from '../patients-read';
import { orders } from '../orders';
import { assertPrescriptionAllergyClear } from './public';

export const doctorFeatures = {
  visitRegistration: CLINICAL_FEATURES.opdVisit.visitRegistration,
  diagnosticOrders: CLINICAL_FEATURES.cpoe.diagnosticOrders,
  procedureOrders: CLINICAL_FEATURES.cpoe.procedureOrders,
  medicineOrders: CLINICAL_FEATURES.cpoe.medicineOrders,
  requestAdmission: CLINICAL_FEATURES.cpoe.requestAdmission,
  vitalsTable: CLINICAL_FEATURES.cpoe.vitalsTable,
} as const;

function iso(value: Date | string | null | undefined): string {
  if (!value) return new Date(0).toISOString();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function istDayRange(date: string): { start: Date; end: Date } {
  const start = new Date(`${date}T00:00:00+05:30`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

async function loadOrders(ctx: ClinicalCtx<Tx>, encounterId: string): Promise<ClinicalOrderDto[]> {
  const rows = await ctx.tx.select({ id: schema.clinicalOrders.id }).from(schema.clinicalOrders).where(eq(schema.clinicalOrders.encounterId, encounterId)).orderBy(desc(schema.clinicalOrders.placedAt));
  const out: ClinicalOrderDto[] = [];
  for (const row of rows) {
    const [head] = await ctx.tx.select().from(schema.clinicalOrders).where(eq(schema.clinicalOrders.id, row.id));
    if (!head) continue;
    const items = await ctx.tx.select().from(schema.clinicalOrderItems).where(eq(schema.clinicalOrderItems.orderId, head.id)).orderBy(asc(schema.clinicalOrderItems.lineNo));
    out.push({
      id: head.id,
      locationId: head.locationId,
      encounterId: head.encounterId,
      patientId: head.patientId,
      kind: head.kind as ClinicalOrderDto['kind'],
      number: head.number,
      source: head.source as ClinicalOrderDto['source'],
      priority: head.priority as ClinicalOrderDto['priority'],
      status: head.status as ClinicalOrderDto['status'],
      orderingDoctorId: head.orderingDoctorId,
      orderedByUserId: head.orderedByUserId,
      notes: head.notes,
      placedAt: iso(head.placedAt),
      cancelledAt: head.cancelledAt ? iso(head.cancelledAt) : null,
      cancelReason: head.cancelReason,
      items: items.map((line) => ({
        id: line.id,
        orderId: line.orderId,
        lineNo: line.lineNo,
        serviceId: line.serviceId,
        drugName: line.drugName,
        genericCode: line.genericCode,
        strength: line.strength,
        doseForm: line.doseForm,
        dose: line.dose,
        frequencyCode: line.frequencyCode,
        routeCode: line.routeCode,
        durationDays: line.durationDays,
        quantity: line.quantity == null ? null : Number(line.quantity),
        dietCode: line.dietCode,
        instructions: line.instructions,
        status: line.status as ClinicalOrderDto['items'][0]['status'],
        fulfilledQty: Number(line.fulfilledQty),
        fulfilledRefType: line.fulfilledRefType,
        fulfilledRefId: line.fulfilledRefId,
      })),
    });
  }
  return out;
}

function latestBodies(notes: ReturnType<typeof noteDto>[], kind: ClinicalNoteKind): string {
  const rows = notes.filter((n) => n.kind === kind);
  return rows.length ? rows[rows.length - 1]!.body : '';
}

function latestDiagnoses(notes: ReturnType<typeof noteDto>[]) {
  return notes
    .filter((n) => n.kind === 'diagnosis' && n.code)
    .map((n) => ({ code: n.code!, codeDisplay: n.codeDisplay ?? n.code! }));
}

async function readEncounter(ctx: ClinicalCtx<Tx>, encounterId: string) {
  const [row] = await ctx.tx.select().from(schema.encounters).where(eq(schema.encounters.id, encounterId));
  if (!row) throw new ApiError(404, 'not_found', 'Encounter not found');
  return row;
}

async function doctorForUser(ctx: ClinicalCtx<Tx>) {
  const [doctor] = await ctx.tx.select().from(schema.doctors).where(eq(schema.doctors.userId, ctx.userId));
  return doctor ?? null;
}

export async function loadCasePaper(ctx: ClinicalCtx<Tx>, encounterId: string): Promise<CasePaperDto> {
  const encounter = await readEncounter(ctx, encounterId);
  const [patient] = await ctx.tx.select().from(schema.patients).where(eq(schema.patients.id, encounter.patientId));
  if (!patient) throw new ApiError(404, 'not_found', 'Patient not found');
  const alerts = await listAlerts(ctx.tx, encounter.patientId);
  const noteRows = await ctx.tx.select().from(schema.clinicalNotes).where(eq(schema.clinicalNotes.encounterId, encounterId)).orderBy(asc(schema.clinicalNotes.createdAt));
  const notes = noteRows.map(noteDto);
  const vitals = (await ctx.tx.select().from(schema.vitalSigns).where(eq(schema.vitalSigns.encounterId, encounterId)).orderBy(desc(schema.vitalSigns.recordedAt))).map(vitalDto);
  return {
    encounterId,
    patient: patientSummary(patient),
    alerts,
    chiefComplaint: latestBodies(notes, 'chief_complaint'),
    history: latestBodies(notes, 'history'),
    examination: latestBodies(notes, 'examination'),
    diagnoses: latestDiagnoses(notes),
    advice: latestBodies(notes, 'advice'),
    vitals,
    orders: await loadOrders(ctx, encounterId),
    notes,
  };
}

async function addNoteIfText(
  ctx: ClinicalCtx<Tx>,
  encounter: typeof schema.encounters.$inferSelect,
  kind: ClinicalNoteKind,
  body: string,
) {
  const trimmed = body.trim();
  if (!trimmed && kind !== 'diagnosis') return;
  if (kind === 'diagnosis') return;
  const [row] = await ctx.tx
    .insert(schema.clinicalNotes)
    .values({
      tenantId: ctx.tenantId,
      encounterId: encounter.id,
      patientId: encounter.patientId,
      kind,
      body: trimmed || '—',
      code: null,
      codeDisplay: null,
      authorUserId: ctx.userId,
    })
    .returning();
  await ctx.audit('clinical.note.add', 'clinical_note', row!.id, null, { kind, encounterId: encounter.id });
}

export async function saveCasePaper(ctx: ClinicalCtx<Tx>, encounterId: string, input: CasePaperInput): Promise<CasePaperDto> {
  const encounter = await readEncounter(ctx, encounterId);
  if (encounter.status !== 'open') throw new ApiError(422, 'encounter_closed', 'This encounter is closed');
  await addNoteIfText(ctx, encounter, 'chief_complaint', input.chiefComplaint ?? '');
  await addNoteIfText(ctx, encounter, 'history', input.history ?? '');
  await addNoteIfText(ctx, encounter, 'examination', input.examination ?? '');
  await addNoteIfText(ctx, encounter, 'advice', input.advice ?? '');
  for (const dx of input.diagnoses ?? []) {
    const [row] = await ctx.tx
      .insert(schema.clinicalNotes)
      .values({
        tenantId: ctx.tenantId,
        encounterId: encounter.id,
        patientId: encounter.patientId,
        kind: 'diagnosis',
        body: dx.codeDisplay,
        code: dx.code,
        codeDisplay: dx.codeDisplay,
        authorUserId: ctx.userId,
      })
      .returning();
    await ctx.audit('clinical.note.add', 'clinical_note', row!.id, null, { kind: 'diagnosis', code: dx.code });
  }
  await ctx.audit('clinical.case_paper.save', 'encounter', encounterId, null, { diagnoses: input.diagnoses?.length ?? 0 });
  return loadCasePaper(ctx, encounterId);
}

export async function placePrescription(ctx: ClinicalCtx<Tx>, encounterId: string, input: PrescriptionInput): Promise<ClinicalOrderDto> {
  const encounter = await readEncounter(ctx, encounterId);
  const alerts = await listAlerts(ctx.tx, encounter.patientId);
  assertPrescriptionAllergyClear(
    alerts,
    input.items.map((i) => i.genericCode),
    input.overrideReason,
  );
  const doctor = await doctorForUser(ctx);
  return orders.place(ctx, encounterId, {
    kind: 'medicine',
    source: 'opd',
    priority: input.priority,
    notes: input.notes,
    orderingDoctorId: doctor?.id ?? encounter.doctorId,
    items: input.items,
  });
}

export async function placeDiagnosticOrder(ctx: ClinicalCtx<Tx>, encounterId: string, input: ServiceOrderInput): Promise<ClinicalOrderDto> {
  const encounter = await readEncounter(ctx, encounterId);
  const doctor = await doctorForUser(ctx);
  return orders.place(ctx, encounterId, {
    kind: 'lab',
    source: 'cpoe',
    priority: input.priority,
    notes: input.notes,
    orderingDoctorId: doctor?.id ?? encounter.doctorId,
    items: input.items,
  });
}

export async function placeProcedureOrder(ctx: ClinicalCtx<Tx>, encounterId: string, input: ServiceOrderInput): Promise<ClinicalOrderDto> {
  const encounter = await readEncounter(ctx, encounterId);
  const doctor = await doctorForUser(ctx);
  return orders.place(ctx, encounterId, {
    kind: 'procedure',
    source: 'cpoe',
    priority: input.priority,
    notes: input.notes,
    orderingDoctorId: doctor?.id ?? encounter.doctorId,
    items: input.items,
  });
}

function orderSetDto(row: typeof schema.orderSets.$inferSelect): OrderSetDto {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as OrderSetDto['kind'],
    items: row.items as OrderSetItem[],
    ownerDoctorId: row.ownerDoctorId,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export async function listOrderSets(ctx: ClinicalCtx<Tx>): Promise<OrderSetDto[]> {
  const doctor = await doctorForUser(ctx);
  const scope = doctor
    ? or(isNull(schema.orderSets.ownerDoctorId), eq(schema.orderSets.ownerDoctorId, doctor.id))
    : isNull(schema.orderSets.ownerDoctorId);
  const rows = await ctx.tx
    .select()
    .from(schema.orderSets)
    .where(and(eq(schema.orderSets.tenantId, ctx.tenantId), scope))
    .orderBy(asc(schema.orderSets.name));
  return rows.map(orderSetDto);
}

export async function createOrderSet(ctx: ClinicalCtx<Tx>, input: OrderSetInput): Promise<OrderSetDto> {
  const doctor = await doctorForUser(ctx);
  const [row] = await ctx.tx
    .insert(schema.orderSets)
    .values({
      tenantId: ctx.tenantId,
      name: input.name,
      kind: input.kind,
      items: input.items,
      ownerDoctorId: doctor?.id ?? null,
    })
    .returning();
  await ctx.audit('clinical.order_set.create', 'order_set', row!.id, null, { name: input.name, kind: input.kind });
  return orderSetDto(row!);
}

export async function myQueue(ctx: ClinicalCtx<Tx>, date: string): Promise<MyQueueItemDto[]> {
  const doctor = await doctorForUser(ctx);
  if (!doctor) return [];
  const { start, end } = istDayRange(date);
  const rows = await ctx.tx
    .select()
    .from(schema.encounters)
    .where(
      and(
        eq(schema.encounters.tenantId, ctx.tenantId),
        eq(schema.encounters.locationId, ctx.locationId),
        eq(schema.encounters.kind, 'opd'),
        eq(schema.encounters.status, 'open'),
        eq(schema.encounters.doctorId, doctor.id),
        gte(schema.encounters.startedAt, start),
        lt(schema.encounters.startedAt, end),
      ),
    )
    .orderBy(asc(schema.encounters.startedAt));
  const items: MyQueueItemDto[] = [];
  for (const row of rows) {
    const [patient] = await ctx.tx.select().from(schema.patients).where(eq(schema.patients.id, row.patientId));
    if (!patient) continue;
    items.push({
      encounterId: row.id,
      encounterNumber: row.number,
      startedAt: iso(row.startedAt),
      visitType: row.visitType,
      patient: patientSummary(patient),
      tokenHint: row.number.split('/').pop() ?? null,
    });
  }
  return items;
}

export async function listInpatients(ctx: ClinicalCtx<Tx>): Promise<InpatientRowDto[]> {
  const rows = await ctx.tx
    .select()
    .from(schema.encounters)
    .where(
      and(
        eq(schema.encounters.tenantId, ctx.tenantId),
        eq(schema.encounters.locationId, ctx.locationId),
        eq(schema.encounters.kind, 'ipd'),
        eq(schema.encounters.status, 'open'),
      ),
    )
    .orderBy(asc(schema.encounters.currentWardCode), asc(schema.encounters.currentBedLabel));
  const out: InpatientRowDto[] = [];
  for (const row of rows) {
    const [patient] = await ctx.tx.select().from(schema.patients).where(eq(schema.patients.id, row.patientId));
    if (!patient) continue;
    out.push({
      encounterId: row.id,
      encounterNumber: row.number,
      patient: patientSummary(patient),
      wardCode: row.currentWardCode,
      bedLabel: row.currentBedLabel,
      startedAt: iso(row.startedAt),
      doctorId: row.doctorId,
    });
  }
  return out;
}

export async function vitalsGraph(ctx: ClinicalCtx<Tx>, encounterId: string): Promise<VitalsGraphDto> {
  await readEncounter(ctx, encounterId);
  const rows = await ctx.tx
    .select()
    .from(schema.vitalSigns)
    .where(and(eq(schema.vitalSigns.encounterId, encounterId), isNull(schema.vitalSigns.enteredInErrorAt)))
    .orderBy(asc(schema.vitalSigns.recordedAt));
  return {
    encounterId,
    points: rows.map((row) => ({
      recordedAt: iso(row.recordedAt),
      bpSystolic: row.bpSystolic,
      bpDiastolic: row.bpDiastolic,
      pulse: row.pulse,
      tempC: row.tempCX10 == null ? null : row.tempCX10 / 10,
      spo2: row.spo2,
      weightKg: row.weightG == null ? null : row.weightG / 1000,
    })),
  };
}

export async function admissionRequest(ctx: ClinicalCtx<Tx>, encounterId: string, input: AdmissionRequestInput) {
  const encounter = await readEncounter(ctx, encounterId);
  const doctor = await doctorForUser(ctx);
  const doctorId = doctor?.id ?? encounter.doctorId;
  if (!doctorId) throw new ApiError(422, 'validation', 'No doctor is linked to this visit');
  return admissions.request(ctx, {
    patientId: encounter.patientId,
    fromEncounterId: encounterId,
    doctorId,
    reason: input.reason,
    plannedOn: input.plannedOn,
    wardType: input.wardType,
  });
}

export async function doctorPrintContext(ctx: ClinicalCtx<Tx>, encounterId: string) {
  const encounter = await readEncounter(ctx, encounterId);
  const patient = await readPatient(ctx.tx, encounter.patientId);
  let doctorName = 'Attending doctor';
  let registrationNo = '';
  const doctorId = encounter.doctorId;
  if (doctorId) {
    const [doc] = await ctx.tx.select().from(schema.doctors).where(eq(schema.doctors.id, doctorId));
    if (doc) {
      doctorName = doc.name;
      registrationNo = doc.registrationNo;
    }
  }
  const paper = await loadCasePaper(ctx, encounterId);
  const orderList = paper.orders;
  return { patient, paper, orderList, doctor: { name: doctorName, registrationNo }, encounter };
}
