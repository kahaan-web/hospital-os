import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { schema } from '@hos/db';
import { addonSelectionSchema, facilitySchema, locationsSchema, planSelectionSchema, stateName, type ProvisioningResult } from '@hos/shared';
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { advanceStep, locationDtos, onboardingState, quoteFor, tenantSummary } from '../catalog';
import { openTenant, type Deps, type TenantGate } from '../guard';
import { ApiError } from '../http';

const SAMPLES = [
  ['Dr. Asha Fictional', 'MBBS, MD', 'General Medicine'],
  ['Dr. Rohan Sample', 'MBBS, MS', 'General Surgery'],
  ['Dr. Meera Demo', 'MBBS, DGO', 'Obstetrics & Gynaecology'],
] as const;

export function registerOnboarding(app: FastifyInstance, deps: Deps): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const run = <T>(req: FastifyRequest, reply: FastifyReply, fn: (gate: TenantGate) => Promise<T>) => openTenant(deps, req, reply, fn);

  r.get('/api/v1/onboarding', async (req, reply) => run(req, reply, (gate) => onboardingState(gate.tx)));

  r.get('/api/v1/onboarding/quote', async (req, reply) =>
    run(req, reply, async (gate) => {
      const draft = gate.hospital.onboardingDraft;
      if (!draft.planId) throw new ApiError(422, 'plan_required', 'Choose a plan before asking for a price');
      return quoteFor(gate.tx, { planId: draft.planId, cycle: draft.cycle, locationCount: draft.locationCount, addonModuleIds: draft.addonModuleIds }, 'onboarding');
    }),
  );

  r.put('/api/v1/onboarding/facility', { schema: { body: facilitySchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const step = advanceStep(gate.hospital.onboardingStep, 'locations');
      await gate.tx
        .update(schema.tenants)
        .set({ ...req.body, onboardingStep: step, displayName: req.body.displayName, legalName: req.body.legalName })
        .where(eq(schema.tenants.id, gate.hospital.id));
      await gate.audit('onboarding.facility.update', 'tenant', gate.hospital.id, null, { legalName: req.body.legalName });
      return onboardingState(gate.tx);
    }),
  );

  r.post('/api/v1/onboarding/logo', async (req, reply) =>
    run(req, reply, async (gate) => {
      const file = await req.file({ limits: { fileSize: 1024 * 1024 } });
      if (!file) throw new ApiError(400, 'validation', 'Choose a PNG, JPG or SVG logo up to 1 MB');
      const ext = file.mimetype === 'image/png' ? 'png' : file.mimetype === 'image/jpeg' ? 'jpg' : file.mimetype === 'image/svg+xml' ? 'svg' : null;
      if (!ext) throw new ApiError(400, 'validation', 'Logo must be a PNG, JPG or SVG');
      const bytes = await file.toBuffer();
      if (ext === 'svg' && /<script/i.test(bytes.toString('utf8'))) throw new ApiError(400, 'validation', 'This SVG is not allowed');
      const dir = join(deps.env.uploadDir, 'logos', gate.hospital.id);
      await mkdir(dir, { recursive: true });
      const relative = join('logos', gate.hospital.id, `logo.${ext}`);
      await writeFile(join(deps.env.uploadDir, relative), bytes);
      await gate.tx.update(schema.tenants).set({ logoPath: relative }).where(eq(schema.tenants.id, gate.hospital.id));
      await gate.audit('onboarding.logo.upload', 'tenant', gate.hospital.id, null, { logo: true });
      return { logoUrl: '/api/v1/onboarding/logo' };
    }),
  );

  r.get('/api/v1/onboarding/logo', async (req, reply) =>
    run(req, reply, async (gate) => {
      if (!gate.hospital.logoPath) throw new ApiError(404, 'not_found', 'No logo uploaded');
      const bytes = await readFile(join(deps.env.uploadDir, gate.hospital.logoPath));
      const ext = gate.hospital.logoPath.split('.').pop();
      const type = ext === 'png' ? 'image/png' : ext === 'jpg' ? 'image/jpeg' : 'image/svg+xml';
      return reply.type(type).send(bytes);
    }),
  );

  r.put('/api/v1/onboarding/locations', { schema: { body: locationsSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const existing = await gate.tx.select().from(schema.locations);
      const kept = new Set<string>();
      const used = new Set(existing.map((loc) => loc.code));
      for (const [index, input] of req.body.locations.entries()) {
        const current = input.id ? existing.find((loc) => loc.id === input.id) : undefined;
        if (input.id && !current) throw new ApiError(404, 'not_found', 'Location not found');
        const code = current?.code ?? nextCode(input.name, used);
        const values = {
          name: input.name,
          code,
          addressLine1: input.addressLine1,
          addressLine2: input.addressLine2,
          city: input.city,
          stateCode: input.stateCode,
          pincode: input.pincode,
          phone: input.phone,
          isPrimary: index === 0,
          sortOrder: index,
        };
        const locationId = current
          ? current.id
          : (await gate.tx.insert(schema.locations).values({ tenantId: gate.hospital.id, ...values }).returning())[0]!.id;
        if (current) await gate.tx.update(schema.locations).set(values).where(eq(schema.locations.id, current.id));
        kept.add(locationId);
        await gate.tx.delete(schema.departments).where(eq(schema.departments.locationId, locationId));
        await gate.tx.insert(schema.departments).values(input.departments.map((name, sortOrder) => ({ tenantId: gate.hospital.id, locationId, name, sortOrder })));
      }
      for (const loc of existing) {
        if (!kept.has(loc.id)) await gate.tx.delete(schema.locations).where(eq(schema.locations.id, loc.id));
      }
      const count = req.body.locations.length;
      const draft = { ...gate.hospital.onboardingDraft, locationCount: Math.max(gate.hospital.onboardingDraft.locationCount, count) };
      await gate.tx
        .update(schema.tenants)
        .set({ onboardingDraft: draft, onboardingStep: advanceStep(gate.hospital.onboardingStep, 'plan') })
        .where(eq(schema.tenants.id, gate.hospital.id));
      await gate.audit('onboarding.locations.update', 'tenant', gate.hospital.id, null, { locations: count });
      return onboardingState(gate.tx);
    }),
  );

  r.put('/api/v1/onboarding/plan', { schema: { body: planSelectionSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const [plan] = await gate.tx.select().from(schema.plans).where(and(eq(schema.plans.id, req.body.planId), eq(schema.plans.status, 'active')));
      if (!plan) throw new ApiError(422, 'invalid_config', 'That plan is not available');
      const locs = await locationDtos(gate.tx);
      if (req.body.locationCount < Math.max(1, locs.length)) throw new ApiError(422, 'location_count', 'Pay for at least every location you added');
      const draft = { ...gate.hospital.onboardingDraft, planId: plan.id, cycle: req.body.cycle, locationCount: req.body.locationCount };
      await gate.tx
        .update(schema.tenants)
        .set({ onboardingDraft: draft, onboardingStep: advanceStep(gate.hospital.onboardingStep, 'addons') })
        .where(eq(schema.tenants.id, gate.hospital.id));
      await gate.audit('onboarding.plan.update', 'tenant', gate.hospital.id, null, { planId: plan.id, cycle: req.body.cycle });
      return onboardingState(gate.tx);
    }),
  );

  r.put('/api/v1/onboarding/addons', { schema: { body: addonSelectionSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const ids = [...new Set(req.body.moduleIds)];
      if (ids.length > 0) {
        const mods = await gate.tx.select().from(schema.modules);
        for (const id of ids) {
          const mod = mods.find((m) => m.id === id);
          if (!mod?.addonPurchasable) throw new ApiError(422, 'invalid_config', 'That module cannot be bought as an add-on');
        }
      }
      const draft = { ...gate.hospital.onboardingDraft, addonModuleIds: ids };
      await gate.tx
        .update(schema.tenants)
        .set({ onboardingDraft: draft, onboardingStep: advanceStep(gate.hospital.onboardingStep, 'payment') })
        .where(eq(schema.tenants.id, gate.hospital.id));
      await gate.audit('onboarding.addons.update', 'tenant', gate.hospital.id, null, { addonModuleIds: ids });
      return onboardingState(gate.tx);
    }),
  );

  r.post('/api/v1/onboarding/provision', async (req, reply) =>
    run(req, reply, async (gate) => {
      const [paid] = await gate.tx.select().from(schema.orders).where(and(eq(schema.orders.purpose, 'onboarding'), eq(schema.orders.status, 'paid')));
      if (!paid) throw new ApiError(422, 'payment_required', 'Pay for the subscription before provisioning');
      if (gate.hospital.status === 'active' && gate.hospital.onboardingStep === 'done') return provisionResult(gate, true);
      const locs = await gate.tx.select().from(schema.locations).orderBy(asc(schema.locations.sortOrder));
      const doctors = await gate.tx.select({ id: schema.doctors.id }).from(schema.doctors);
      if (doctors.length === 0 && locs.length > 0) {
        await gate.tx.insert(schema.doctors).values(
          locs.flatMap((loc) => SAMPLES.map(([name, qualification, speciality]) => ({ tenantId: gate.hospital.id, locationId: loc.id, name, qualification, speciality, isSample: true }))),
        );
      }
      await gate.tx
        .update(schema.tenants)
        .set({ status: 'active', onboardingStep: 'done', onboardingCompletedAt: new Date() })
        .where(eq(schema.tenants.id, gate.hospital.id));
      await gate.audit('onboarding.tenant.provision', 'tenant', gate.hospital.id, { status: gate.hospital.status }, { status: 'active' });
      return provisionResult(gate, false);
    }),
  );
}

async function provisionResult(gate: TenantGate, already: boolean): Promise<ProvisioningResult> {
  const locs = await locationDtos(gate.tx);
  const [hospital] = await gate.tx.select().from(schema.tenants);
  const detail = already ? 'Already in place' : 'Created';
  return {
    steps: [
      { key: 'tenant', label: 'Hospital account', detail: `${detail}: ${hospital?.displayName || 'your hospital'}` },
      { key: 'locations', label: 'Locations', detail: `${locs.length} location${locs.length === 1 ? '' : 's'} (${locs.map((l) => `${l.name}, ${stateName(l.stateCode)}`).join('; ')})` },
      { key: 'admin', label: 'Tenant Admin', detail: gate.user.email },
      { key: 'roles', label: 'Roles', detail: 'Tenant Admin, Location Admin, Front Desk, Doctor, Nurse, Cashier and the other system roles' },
      { key: 'entitlements', label: 'Modules', detail: 'Switched on from the plan and any add-ons' },
      { key: 'samples', label: 'Sample doctors', detail: 'Fictional doctors were added at each location so the sandbox is not empty' },
      { key: 'checklist', label: 'Go-live checklist', detail: 'Open the dashboard and work through the checklist' },
    ],
    tenant: tenantSummary(hospital!),
  };
}

function nextCode(name: string, used: Set<string>): string {
  const base = (name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'LOC').slice(0, 8);
  let code = base;
  let n = 2;
  while (used.has(code)) {
    code = `${base.slice(0, 5)}${n}`;
    n += 1;
  }
  used.add(code);
  return code;
}
