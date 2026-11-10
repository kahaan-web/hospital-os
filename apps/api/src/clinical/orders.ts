import { schema, type Tx } from '@hos/db';
import type {
  ClinicalCtx,
  ClinicalOrderDto,
  ClinicalOrderItemDto,
  ClinicalOrderItemStatus,
  OrderService,
  PageDto,
  PlaceClinicalOrderInput,
} from '@hos/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import { ApiError } from '../http';
import { charges, prices } from './charges';
import { numbering } from './numbering';

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function itemDto(row: typeof schema.clinicalOrderItems.$inferSelect): ClinicalOrderItemDto {
  return {
    id: row.id,
    orderId: row.orderId,
    lineNo: row.lineNo,
    serviceId: row.serviceId,
    drugName: row.drugName,
    genericCode: row.genericCode,
    strength: row.strength,
    doseForm: row.doseForm,
    dose: row.dose,
    frequencyCode: row.frequencyCode,
    routeCode: row.routeCode,
    durationDays: row.durationDays,
    quantity: row.quantity == null ? null : Number(row.quantity),
    dietCode: row.dietCode,
    instructions: row.instructions,
    status: row.status as ClinicalOrderItemStatus,
    fulfilledQty: Number(row.fulfilledQty),
    fulfilledRefType: row.fulfilledRefType,
    fulfilledRefId: row.fulfilledRefId,
  };
}

async function loadOrder(ctx: ClinicalCtx<Tx>, orderId: string): Promise<ClinicalOrderDto> {
  const [order] = await ctx.tx.select().from(schema.clinicalOrders).where(eq(schema.clinicalOrders.id, orderId));
  if (!order) throw new ApiError(404, 'not_found', 'Order not found');
  const items = await ctx.tx.select().from(schema.clinicalOrderItems).where(eq(schema.clinicalOrderItems.orderId, orderId)).orderBy(asc(schema.clinicalOrderItems.lineNo));
  return {
    id: order.id,
    locationId: order.locationId,
    encounterId: order.encounterId,
    patientId: order.patientId,
    kind: order.kind as ClinicalOrderDto['kind'],
    number: order.number,
    source: order.source as ClinicalOrderDto['source'],
    priority: order.priority as ClinicalOrderDto['priority'],
    status: order.status as ClinicalOrderDto['status'],
    orderingDoctorId: order.orderingDoctorId,
    orderedByUserId: order.orderedByUserId,
    notes: order.notes,
    placedAt: iso(order.placedAt)!,
    cancelledAt: iso(order.cancelledAt),
    cancelReason: order.cancelReason,
    items: items.map(itemDto),
  };
}

export const orders: OrderService<Tx> = {
  async place(ctx, encounterId, input: PlaceClinicalOrderInput) {
    if (input.kind === 'radiology') throw new ApiError(422, 'not_available', 'Radiology orders are not available yet');
    const [encounter] = await ctx.tx.select().from(schema.encounters).where(eq(schema.encounters.id, encounterId));
    if (!encounter) throw new ApiError(404, 'not_found', 'Encounter not found');
    if (encounter.status !== 'open') throw new ApiError(422, 'encounter_closed', 'Orders can only be placed on an open encounter');
    const number = await numbering.next(ctx, 'clinical_order');
    const [order] = await ctx.tx
      .insert(schema.clinicalOrders)
      .values({
        tenantId: ctx.tenantId,
        locationId: encounter.locationId,
        encounterId,
        patientId: encounter.patientId,
        kind: input.kind,
        number,
        source: input.source ?? 'opd',
        priority: input.priority ?? 'routine',
        status: 'placed',
        orderingDoctorId: input.orderingDoctorId ?? encounter.doctorId,
        orderedByUserId: ctx.userId,
        notes: input.notes ?? null,
      })
      .returning();
    for (const [index, item] of input.items.entries()) {
      const lineNo = index + 1;
      const serviceId = 'serviceId' in item ? item.serviceId : null;
      await ctx.tx
        .insert(schema.clinicalOrderItems)
        .values({
          tenantId: ctx.tenantId,
          orderId: order!.id,
          lineNo,
          serviceId,
          drugName: 'drugName' in item ? item.drugName : null,
          genericCode: 'genericCode' in item ? item.genericCode : null,
          strength: 'strength' in item ? (item.strength ?? null) : null,
          doseForm: 'doseForm' in item ? (item.doseForm ?? null) : null,
          dose: 'dose' in item ? (item.dose ?? null) : null,
          frequencyCode: 'frequencyCode' in item ? item.frequencyCode : null,
          routeCode: 'routeCode' in item ? (item.routeCode ?? null) : null,
          durationDays: 'durationDays' in item ? (item.durationDays ?? null) : null,
          quantity: 'quantity' in item ? (item.quantity ?? null) : null,
          dietCode: 'dietCode' in item ? item.dietCode : null,
          instructions: item.instructions ?? null,
          status: 'pending',
        });
      if ((input.kind === 'lab' || input.kind === 'procedure') && serviceId) {
        const [service] = await ctx.tx.select().from(schema.services).where(eq(schema.services.id, serviceId));
        const priced = await prices.priceFor({ ...ctx, locationId: encounter.locationId }, { serviceId });
        await charges.post(
          { ...ctx, locationId: encounter.locationId },
          {
            encounterId,
            patientId: encounter.patientId,
            serviceId,
            description: service?.name ?? 'Service',
            qty: 1,
            unitPricePaise: priced.unitPricePaise,
            gstTreatment: priced.gstTreatment,
            gstRateBp: priced.gstRateBp,
            hsnSac: priced.hsnSac,
            serviceDate: new Date().toISOString().slice(0, 10),
            performingDoctorId: encounter.doctorId,
            source: {
              module: input.kind === 'lab' ? 'lab' : input.source === 'cpoe' ? 'cpoe' : 'opd',
              type: 'clinical_order',
              id: order!.id,
              line: String(lineNo),
            },
          },
        );
      }
    }
    await ctx.audit('clinical.order.place', 'clinical_order', order!.id, null, { kind: input.kind, number });
    return loadOrder(ctx, order!.id);
  },

  async cancel(ctx, orderId, reason) {
    const [order] = await ctx.tx.select().from(schema.clinicalOrders).where(eq(schema.clinicalOrders.id, orderId));
    if (!order) throw new ApiError(404, 'not_found', 'Order not found');
    if (order.status === 'cancelled') return loadOrder(ctx, orderId);
    await ctx.tx
      .update(schema.clinicalOrders)
      .set({ status: 'cancelled', cancelledAt: new Date(), cancelReason: reason })
      .where(eq(schema.clinicalOrders.id, orderId));
    await ctx.tx
      .update(schema.clinicalOrderItems)
      .set({ status: 'cancelled' })
      .where(and(eq(schema.clinicalOrderItems.orderId, orderId), sql`${schema.clinicalOrderItems.status} <> 'done'`));
    await charges.reverseBySource(ctx, { module: 'opd', type: 'clinical_order', id: orderId }, reason);
    await ctx.audit('clinical.order.cancel', 'clinical_order', orderId, { status: order.status }, { status: 'cancelled', reason });
    return loadOrder(ctx, orderId);
  },

  async worklist(ctx, q) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 25;
    const filters = [
      q.kind ? eq(schema.clinicalOrders.kind, q.kind) : undefined,
      q.status ? eq(schema.clinicalOrderItems.status, q.status) : undefined,
      q.locationId ? eq(schema.clinicalOrders.locationId, q.locationId) : undefined,
    ].filter((f): f is NonNullable<typeof f> => !!f);
    const where = filters.length > 0 ? and(...filters) : undefined;
    const rows = await ctx.tx
      .select({ item: schema.clinicalOrderItems })
      .from(schema.clinicalOrderItems)
      .innerJoin(schema.clinicalOrders, eq(schema.clinicalOrders.id, schema.clinicalOrderItems.orderId))
      .where(where)
      .orderBy(asc(schema.clinicalOrderItems.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const totalRows = await ctx.tx
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.clinicalOrderItems)
      .innerJoin(schema.clinicalOrders, eq(schema.clinicalOrders.id, schema.clinicalOrderItems.orderId))
      .where(where);
    const pageDto: PageDto<ClinicalOrderItemDto> = {
      items: rows.map((r) => itemDto(r.item)),
      total: Number(totalRows[0]?.n ?? 0),
      page,
      pageSize,
    };
    return pageDto;
  },

  async recordFulfilment(ctx, itemId, f) {
    const [item] = await ctx.tx.select().from(schema.clinicalOrderItems).where(eq(schema.clinicalOrderItems.id, itemId));
    if (!item) throw new ApiError(404, 'not_found', 'Order item not found');
    const [updated] = await ctx.tx
      .update(schema.clinicalOrderItems)
      .set({
        status: f.status === 'done' ? 'done' : 'in_progress',
        fulfilledQty: f.qty ?? item.fulfilledQty,
        fulfilledRefType: f.refType,
        fulfilledRefId: f.refId,
      })
      .where(eq(schema.clinicalOrderItems.id, itemId))
      .returning();
    await ctx.audit('clinical.order.fulfil', 'clinical_order_item', itemId, { status: item.status }, { status: updated!.status, refType: f.refType, refId: f.refId });
    return itemDto(updated!);
  },
};
