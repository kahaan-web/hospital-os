import { schema } from '@hos/db';
import { istDateKey } from '@hos/shared';
import { asc, desc, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Deps, TenantGate } from '../../guard';
import { openTenant } from '../../guard';
import { ApiError } from '../../http';

// MVP demo slice (migration 1220). Permission and module are enforced by TENANT_GUARDS (route-guards.ts).
const MODULE = 'equipment-maintenance';
const PREFIX = `/api/v1/tenant/m/${MODULE}`;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const idParams = z.object({ id: z.uuid() });

const assetBody = z.object({
  assetTag: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().max(60).default(''),
  department: z.string().trim().max(60).default(''),
  criticality: z.enum(['high', 'medium', 'low']).default('medium'),
  purchaseCostPaise: z.number().int().min(0).default(0),
  installedOn: isoDate.optional(),
  warrantyUntil: isoDate.optional(),
});

const pmBody = z.object({
  title: z.string().trim().min(1).max(120),
  frequencyDays: z.number().int().min(1).max(3650),
  nextDue: isoDate,
});

const breakdownBody = z.object({
  description: z.string().trim().min(1).max(500),
});

/** Adds whole days to a YYYY-MM-DD key. Calendar arithmetic in UTC, so no timezone drift. */
function addDays(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function registerEquipment(app: FastifyInstance, deps: Deps): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const run = <T>(req: FastifyRequest, reply: FastifyReply, fn: (gate: TenantGate) => Promise<T>) => openTenant(deps, req, reply, fn);

  r.get(`${PREFIX}/assets`, {}, async (req, reply) =>
    run(req, reply, async (gate) => {
      const assets = await gate.tx.select().from(schema.equipmentAssets).orderBy(asc(schema.equipmentAssets.assetTag));
      const pms = await gate.tx.select().from(schema.equipmentPmSchedules);
      const today = istDateKey(new Date());
      return assets.map((asset) => {
        const due = pms.filter((p) => p.equipmentId === asset.id).map((p) => p.nextDue).sort()[0] ?? null;
        return { ...asset, nextPmDue: due, pmOverdue: due !== null && due < today };
      });
    }),
  );

  r.post(`${PREFIX}/assets`, { schema: { body: assetBody } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const body = req.body;
      const [dup] = await gate.tx
        .select({ id: schema.equipmentAssets.id })
        .from(schema.equipmentAssets)
        .where(eq(schema.equipmentAssets.assetTag, body.assetTag));
      if (dup) throw new ApiError(409, 'asset_tag_taken', 'An asset with this tag already exists');
      const [row] = await gate.tx
        .insert(schema.equipmentAssets)
        .values({
          tenantId: gate.actor.tenantId!,
          assetTag: body.assetTag,
          name: body.name,
          category: body.category,
          department: body.department,
          criticality: body.criticality,
          purchaseCostPaise: body.purchaseCostPaise,
          installedOn: body.installedOn ?? null,
          warrantyUntil: body.warrantyUntil ?? null,
        })
        .returning();
      if (!row) throw new ApiError(500, 'insert_failed', 'Equipment was not saved');
      await gate.audit('equipment.asset.create', 'equipment_asset', row.id, null, { assetTag: row.assetTag, criticality: row.criticality });
      return row;
    }),
  );

  r.get(`${PREFIX}/assets/:id`, { schema: { params: idParams } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const [asset] = await gate.tx.select().from(schema.equipmentAssets).where(eq(schema.equipmentAssets.id, req.params.id));
      if (!asset) throw new ApiError(404, 'not_found', 'Equipment not found');
      const pmSchedules = await gate.tx
        .select()
        .from(schema.equipmentPmSchedules)
        .where(eq(schema.equipmentPmSchedules.equipmentId, asset.id))
        .orderBy(asc(schema.equipmentPmSchedules.nextDue));
      const logs = await gate.tx
        .select()
        .from(schema.equipmentServiceLogs)
        .where(eq(schema.equipmentServiceLogs.equipmentId, asset.id))
        .orderBy(desc(schema.equipmentServiceLogs.loggedAt))
        .limit(50);
      return { asset, pmSchedules, logs };
    }),
  );

  r.post(`${PREFIX}/assets/:id/pm-schedules`, { schema: { params: idParams, body: pmBody } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const [asset] = await gate.tx.select({ id: schema.equipmentAssets.id, status: schema.equipmentAssets.status }).from(schema.equipmentAssets).where(eq(schema.equipmentAssets.id, req.params.id));
      if (!asset) throw new ApiError(404, 'not_found', 'Equipment not found');
      if (asset.status === 'condemned') throw new ApiError(409, 'condemned', 'Condemned equipment cannot get PM tasks');
      const [row] = await gate.tx
        .insert(schema.equipmentPmSchedules)
        .values({
          tenantId: gate.actor.tenantId!,
          equipmentId: asset.id,
          title: req.body.title,
          frequencyDays: req.body.frequencyDays,
          nextDue: req.body.nextDue,
        })
        .returning();
      if (!row) throw new ApiError(500, 'insert_failed', 'PM schedule was not saved');
      await gate.audit('equipment.pm.add', 'equipment_pm_schedule', row.id, null, { equipmentId: asset.id, frequencyDays: row.frequencyDays });
      return row;
    }),
  );

  // Key action 1: complete a PM visit. Writes a log line and moves the next due date on by the frequency.
  r.post(`${PREFIX}/pm-schedules/:id/complete`, { schema: { params: idParams } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const [pm] = await gate.tx.select().from(schema.equipmentPmSchedules).where(eq(schema.equipmentPmSchedules.id, req.params.id));
      if (!pm) throw new ApiError(404, 'not_found', 'PM schedule not found');
      const today = istDateKey(new Date());
      const [updated] = await gate.tx
        .update(schema.equipmentPmSchedules)
        .set({ lastDoneOn: today, nextDue: addDays(today, pm.frequencyDays) })
        .where(eq(schema.equipmentPmSchedules.id, pm.id))
        .returning();
      await gate.tx.insert(schema.equipmentServiceLogs).values({
        tenantId: gate.actor.tenantId!,
        equipmentId: pm.equipmentId,
        kind: 'pm',
        description: `${pm.title} done`,
        createdBy: gate.user.id,
      });
      await gate.audit('equipment.pm.complete', 'equipment_pm_schedule', pm.id, { nextDue: pm.nextDue }, { nextDue: updated?.nextDue });
      return updated;
    }),
  );

  // Key action 2: report a breakdown. The asset goes non-operational and the log records the problem.
  r.post(`${PREFIX}/assets/:id/breakdown`, { schema: { params: idParams, body: breakdownBody } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const [asset] = await gate.tx.select().from(schema.equipmentAssets).where(eq(schema.equipmentAssets.id, req.params.id));
      if (!asset) throw new ApiError(404, 'not_found', 'Equipment not found');
      if (asset.status === 'condemned') throw new ApiError(409, 'condemned', 'Condemned equipment cannot be reported');
      if (asset.status === 'non_operational') throw new ApiError(409, 'already_non_operational', 'This equipment is already down');
      const [updated] = await gate.tx
        .update(schema.equipmentAssets)
        .set({ status: 'non_operational' })
        .where(eq(schema.equipmentAssets.id, asset.id))
        .returning();
      await gate.tx.insert(schema.equipmentServiceLogs).values({
        tenantId: gate.actor.tenantId!,
        equipmentId: asset.id,
        kind: 'breakdown',
        description: req.body.description,
        createdBy: gate.user.id,
      });
      await gate.audit('equipment.breakdown.report', 'equipment_asset', asset.id, { status: asset.status }, { status: 'non_operational' });
      return updated;
    }),
  );

  r.post(`${PREFIX}/assets/:id/restore`, { schema: { params: idParams } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const [asset] = await gate.tx.select().from(schema.equipmentAssets).where(eq(schema.equipmentAssets.id, req.params.id));
      if (!asset) throw new ApiError(404, 'not_found', 'Equipment not found');
      if (asset.status !== 'non_operational' && asset.status !== 'under_maintenance') {
        throw new ApiError(409, 'not_down', 'Only equipment that is down can be marked operational');
      }
      const [updated] = await gate.tx
        .update(schema.equipmentAssets)
        .set({ status: 'operational' })
        .where(eq(schema.equipmentAssets.id, asset.id))
        .returning();
      await gate.tx.insert(schema.equipmentServiceLogs).values({
        tenantId: gate.actor.tenantId!,
        equipmentId: asset.id,
        kind: 'restored',
        description: 'Marked operational',
        createdBy: gate.user.id,
      });
      await gate.audit('equipment.asset.restore', 'equipment_asset', asset.id, { status: asset.status }, { status: 'operational' });
      return updated;
    }),
  );
}
