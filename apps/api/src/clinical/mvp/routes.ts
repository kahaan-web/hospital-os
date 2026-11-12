// MVP demo slice: blood bank (storage-centre mode), marketing campaigns (mock send) and the MIS dashboard.
// Thin by design. Everything runs inside the tenant transaction, so RLS scopes every read and write.
import { schema } from '@hos/db';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Deps, TenantGate } from '../../guard';
import { openTenant } from '../../guard';
import { ApiError } from '../../http';

export const BLOOD_BANK = 'blood-bank';
export const MARKETING = 'marketing';
export const MIS = 'mis-dashboards';
const BB = `/api/v1/tenant/m/${BLOOD_BANK}`;
const MKT = `/api/v1/tenant/m/${MARKETING}`;
const MISP = `/api/v1/tenant/m/${MIS}`;

const COMPONENTS = ['wb', 'prbc', 'ffp', 'pc', 'cryo'] as const;
const ABO = ['A', 'B', 'AB', 'O'] as const;
const RH = ['pos', 'neg'] as const;
const idParams = z.object({ id: z.uuid() });

const receiveUnitBody = z.object({
  unitNo: z.string().trim().min(3).max(40),
  component: z.enum(COMPONENTS),
  abo: z.enum(ABO),
  rh: z.enum(RH),
  volumeMl: z.number().int().min(1).max(1000),
  collectedOn: z.iso.date(),
  expiresAt: z.iso.date(),
  sourceCentre: z.string().trim().max(120).default(''),
  ttiCleared: z.boolean().default(false),
});

const createRequestBody = z.object({
  patientId: z.uuid(),
  patientAbo: z.enum(ABO),
  patientRh: z.enum(RH),
  component: z.enum(COMPONENTS),
  urgency: z.enum(['routine', 'urgent', 'emergency']).default('routine'),
  indication: z.string().trim().max(300).default(''),
});

const issueBody = z.object({
  unitId: z.uuid(),
  receivedBy: z.string().trim().min(2, 'Name the receiving nurse').max(120),
});

const campaignBody = z.object({
  name: z.string().trim().min(3).max(120),
  channel: z.enum(['sms', 'email', 'whatsapp']),
  segmentNote: z.string().trim().max(300).default(''),
  message: z.string().trim().min(5).max(600),
  audienceCount: z.number().int().min(0).max(100000).default(0),
});

function ctx(gate: TenantGate) {
  if (!gate.locationId || !gate.actor.tenantId) throw new ApiError(422, 'location_required', 'Choose a location');
  return { tx: gate.tx, tenantId: gate.actor.tenantId, locationId: gate.locationId, userId: gate.user.id, audit: gate.audit };
}

/** RBC-bearing components follow red-cell rules; others need an exact ABO match. Rh ignored for plasma products. */
export function bloodCompatible(
  component: string,
  unit: { abo: string; rh: string },
  patient: { abo: string; rh: string },
): boolean {
  const red = component === 'wb' || component === 'prbc';
  if (red) {
    const aboOk = unit.abo === 'O' || unit.abo === patient.abo || patient.abo === 'AB';
    const rhOk = unit.rh === 'neg' || patient.rh === 'pos';
    return aboOk && rhOk;
  }
  return unit.abo === patient.abo;
}

const today = () => new Date().toISOString().slice(0, 10);

export function registerMvp(app: FastifyInstance, deps: Deps): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const run = <T>(req: FastifyRequest, reply: FastifyReply, fn: (gate: TenantGate) => Promise<T>) => openTenant(deps, req, reply, fn);
  const bbGate = async (gate: TenantGate) => {
    await gate.requireModule(BLOOD_BANK);
    gate.requirePermission('pharmacy.manage');
  };
  const mktGate = async (gate: TenantGate) => {
    await gate.requireModule(MARKETING);
    gate.requirePermission('reports.view');
  };

  // ---- Blood bank ----
  r.get(`${BB}/inventory`, async (req, reply) =>
    run(req, reply, async (gate) => {
      await bbGate(gate);
      const c = ctx(gate);
      const units = await c.tx
        .select()
        .from(schema.bbUnits)
        .where(eq(schema.bbUnits.locationId, c.locationId))
        .orderBy(asc(schema.bbUnits.expiresAt), asc(schema.bbUnits.unitNo));
      return { units, today: today() };
    }),
  );

  r.post(`${BB}/units/receive`, { schema: { body: receiveUnitBody } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await bbGate(gate);
      const c = ctx(gate);
      const b = req.body;
      if (b.expiresAt <= b.collectedOn) throw new ApiError(422, 'validation', 'Expiry must be after the collection date', { expiresAt: 'Must be after collection' });
      const dup = await c.tx
        .select({ id: schema.bbUnits.id })
        .from(schema.bbUnits)
        .where(and(eq(schema.bbUnits.locationId, c.locationId), eq(schema.bbUnits.unitNo, b.unitNo)));
      if (dup.length > 0) throw new ApiError(409, 'duplicate', 'A unit with this number is already in stock', { unitNo: 'Already received' });
      const [row] = await c.tx
        .insert(schema.bbUnits)
        .values({ ...b, tenantId: c.tenantId, locationId: c.locationId, createdBy: c.userId })
        .returning();
      await c.audit('bloodbank.unit.receive', 'bb_unit', row!.id, null, { unitNo: b.unitNo, component: b.component, abo: b.abo, rh: b.rh });
      reply.code(201);
      return row;
    }),
  );

  r.get(`${BB}/requests`, async (req, reply) =>
    run(req, reply, async (gate) => {
      await bbGate(gate);
      const c = ctx(gate);
      return c.tx
        .select({
          id: schema.bbRequests.id,
          patientId: schema.bbRequests.patientId,
          uhid: schema.patients.uhid,
          patientName: schema.patients.fullName,
          patientAbo: schema.bbRequests.patientAbo,
          patientRh: schema.bbRequests.patientRh,
          component: schema.bbRequests.component,
          urgency: schema.bbRequests.urgency,
          indication: schema.bbRequests.indication,
          status: schema.bbRequests.status,
          unitId: schema.bbRequests.unitId,
          issuedAt: schema.bbRequests.issuedAt,
          createdAt: schema.bbRequests.createdAt,
        })
        .from(schema.bbRequests)
        .innerJoin(schema.patients, and(eq(schema.patients.tenantId, schema.bbRequests.tenantId), eq(schema.patients.id, schema.bbRequests.patientId)))
        .where(eq(schema.bbRequests.locationId, c.locationId))
        .orderBy(desc(schema.bbRequests.createdAt));
    }),
  );

  r.get(`${BB}/requests/:id`, { schema: { params: idParams } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await bbGate(gate);
      const c = ctx(gate);
      const [row] = await c.tx.select().from(schema.bbRequests).where(eq(schema.bbRequests.id, req.params.id));
      if (!row) throw new ApiError(404, 'not_found', 'Blood request not found');
      const [patient] = await c.tx.select({ uhid: schema.patients.uhid, name: schema.patients.fullName }).from(schema.patients).where(eq(schema.patients.id, row.patientId));
      const units = await c.tx
        .select()
        .from(schema.bbUnits)
        .where(and(eq(schema.bbUnits.locationId, row.locationId), eq(schema.bbUnits.component, row.component), eq(schema.bbUnits.status, 'available')))
        .orderBy(asc(schema.bbUnits.expiresAt));
      const candidates = units.map((u) => ({
        ...u,
        issuable: u.ttiCleared && u.expiresAt >= today() && bloodCompatible(row.component, u, { abo: row.patientAbo, rh: row.patientRh }),
      }));
      return { request: row, patient: patient ?? null, candidates };
    }),
  );

  r.post(`${BB}/requests`, { schema: { body: createRequestBody } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await bbGate(gate);
      const c = ctx(gate);
      const [patient] = await c.tx.select({ id: schema.patients.id }).from(schema.patients).where(eq(schema.patients.id, req.body.patientId));
      if (!patient) throw new ApiError(404, 'not_found', 'Patient not found');
      const [row] = await c.tx
        .insert(schema.bbRequests)
        .values({ ...req.body, tenantId: c.tenantId, locationId: c.locationId, createdBy: c.userId })
        .returning();
      await c.audit('bloodbank.request.create', 'bb_request', row!.id, null, { component: row!.component, urgency: row!.urgency });
      reply.code(201);
      return row;
    }),
  );

  r.post(`${BB}/requests/:id/issue`, { schema: { params: idParams, body: issueBody } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await bbGate(gate);
      const c = ctx(gate);
      const [request] = await c.tx.select().from(schema.bbRequests).where(eq(schema.bbRequests.id, req.params.id)).for('update');
      if (!request) throw new ApiError(404, 'not_found', 'Blood request not found');
      if (request.status !== 'open') throw new ApiError(409, 'conflict', 'This request is already closed');
      const [unit] = await c.tx.select().from(schema.bbUnits).where(eq(schema.bbUnits.id, req.body.unitId)).for('update');
      if (!unit || unit.locationId !== request.locationId) throw new ApiError(404, 'not_found', 'Blood unit not found');
      // Hard safety blocks: no override in the demo slice.
      if (unit.status !== 'available') throw new ApiError(422, 'unit_not_available', 'This unit is not available for issue');
      if (unit.expiresAt < today()) throw new ApiError(422, 'unit_expired', 'This unit has expired');
      if (!unit.ttiCleared) throw new ApiError(422, 'tti_not_cleared', 'This unit is not marked TTI-tested and cleared');
      if (unit.component !== request.component) throw new ApiError(422, 'component_mismatch', 'The unit is not the component that was requested');
      if (!bloodCompatible(request.component, unit, { abo: request.patientAbo, rh: request.patientRh })) {
        throw new ApiError(422, 'group_mismatch', 'The unit is not ABO/Rh compatible with this patient');
      }
      await c.tx.update(schema.bbUnits).set({ status: 'issued' }).where(eq(schema.bbUnits.id, unit.id));
      const [updated] = await c.tx
        .update(schema.bbRequests)
        .set({ status: 'issued', unitId: unit.id, issuedAt: new Date(), issuedBy: c.userId, receivedBy: req.body.receivedBy })
        .where(eq(schema.bbRequests.id, request.id))
        .returning();
      await c.audit('bloodbank.request.issue', 'bb_request', request.id, { status: 'open' }, { status: 'issued', unitNo: unit.unitNo });
      return updated;
    }),
  );

  // ---- Marketing ----
  r.get(`${MKT}/campaigns`, async (req, reply) =>
    run(req, reply, async (gate) => {
      await mktGate(gate);
      return ctx(gate).tx.select().from(schema.mktCampaigns).orderBy(desc(schema.mktCampaigns.createdAt));
    }),
  );

  r.get(`${MKT}/campaigns/:id`, { schema: { params: idParams } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await mktGate(gate);
      const [row] = await ctx(gate).tx.select().from(schema.mktCampaigns).where(eq(schema.mktCampaigns.id, req.params.id));
      if (!row) throw new ApiError(404, 'not_found', 'Campaign not found');
      return row;
    }),
  );

  r.post(`${MKT}/campaigns`, { schema: { body: campaignBody } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await mktGate(gate);
      const c = ctx(gate);
      const [row] = await c.tx.insert(schema.mktCampaigns).values({ ...req.body, tenantId: c.tenantId, createdBy: c.userId }).returning();
      await c.audit('marketing.campaign.create', 'mkt_campaign', row!.id, null, { channel: row!.channel });
      reply.code(201);
      return row;
    }),
  );

  // Mock send: no provider is called. Consent suppression is simulated at a fixed 15% for the demo.
  r.post(`${MKT}/campaigns/:id/mark-sent`, { schema: { params: idParams } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await mktGate(gate);
      const c = ctx(gate);
      const [row] = await c.tx.select().from(schema.mktCampaigns).where(eq(schema.mktCampaigns.id, req.params.id)).for('update');
      if (!row) throw new ApiError(404, 'not_found', 'Campaign not found');
      if (row.status !== 'draft') throw new ApiError(409, 'conflict', 'Only a draft campaign can be marked as sent');
      const suppressed = Math.floor(row.audienceCount * 0.15);
      const [updated] = await c.tx
        .update(schema.mktCampaigns)
        .set({ status: 'sent', sentAt: new Date(), sentBy: c.userId, suppressedCount: suppressed, sentCount: row.audienceCount - suppressed })
        .where(eq(schema.mktCampaigns.id, row.id))
        .returning();
      await c.audit('marketing.campaign.sent_mock', 'mkt_campaign', row.id, { status: 'draft' }, { status: 'sent', sentCount: updated!.sentCount });
      return updated;
    }),
  );

  // ---- MIS dashboard ----
  r.get(`${MISP}/kpis`, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(MIS);
      gate.requirePermission('reports.view');
      const c = ctx(gate);
      const num = (v: unknown) => Number(v ?? 0);
      const rev = await c.tx.execute<{ today: string; month: string; bills: string; outstanding: string }>(sql`
        select
          coalesce(sum(total_paise) filter (where finalised_at >= date_trunc('day', now())), 0) as today,
          coalesce(sum(total_paise) filter (where finalised_at >= date_trunc('month', now())), 0) as month,
          count(*) filter (where finalised_at >= date_trunc('month', now())) as bills,
          coalesce(sum(total_paise - paid_paise) filter (where pay_class = 'credit'), 0) as outstanding
        from bills where status = 'final' and location_id = ${c.locationId}::uuid`);
      const beds = await c.tx.execute<{ total: string; occupied: string }>(sql`
        select count(*) as total, count(*) filter (where status = 'occupied') as occupied
        from beds where location_id = ${c.locationId}::uuid`);
      const adm = await c.tx.execute<{ current: string; month: string }>(sql`
        select count(*) filter (where status = 'admitted') as current,
               count(*) filter (where admitted_at >= date_trunc('month', now())) as month
        from admissions where location_id = ${c.locationId}::uuid`);
      const stock = await c.tx.execute<{ lines: string; units: string; near: string }>(sql`
        select count(*) as lines, coalesce(sum(s.qty), 0) as units,
               count(*) filter (where b.expiry <= current_date + 90 and s.qty > 0) as near
        from pharmacy_stock s join pharmacy_batches b on b.tenant_id = s.tenant_id and b.id = s.batch_id
        where s.location_id = ${c.locationId}::uuid`);
      const r0 = rev.rows[0];
      const b0 = beds.rows[0];
      const a0 = adm.rows[0];
      const s0 = stock.rows[0];
      const totalBeds = num(b0?.total);
      const occupied = num(b0?.occupied);
      return {
        asOf: new Date().toISOString(),
        revenue: { todayPaise: num(r0?.today), monthPaise: num(r0?.month), billsThisMonth: num(r0?.bills), outstandingPaise: num(r0?.outstanding) },
        adt: { totalBeds, occupiedBeds: occupied, occupancyPct: totalBeds > 0 ? Math.round((occupied / totalBeds) * 100) : 0, currentInpatients: num(a0?.current), admissionsThisMonth: num(a0?.month) },
        stores: { stockLines: num(s0?.lines), unitsOnHand: num(s0?.units), nearExpiryLines: num(s0?.near) },
      };
    }),
  );
}
