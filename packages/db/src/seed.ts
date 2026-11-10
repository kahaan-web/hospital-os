// Catalogue seed (idempotent) and the fictional Sunrise Care demo tenant.
// Placeholder plan prices follow the api worker task: ₹12,999 / ₹15,999 / ₹19,999 per location per month,
// annual = 10× monthly. That overrides the lower figures in DEFAULT_PLANS so the running demo matches the task.
import { randomBytes } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  ANNUAL_MONTHS_CHARGED,
  DEFAULT_DEPARTMENTS,
  DEFAULT_PLANS,
  FEATURE_DEFS,
  MODULE_DEFS,
  PERMISSIONS,
  SHEET_FEATURE_DEFS,
  SYSTEM_ROLES,
  addCycle,
  applyGst,
  priceSubscription,
  rupeesToPaise,
  stateName,
  type BillingCycle,
  type PriceBook,
  type QuoteDto,
  type TierKey,
} from '@hos/shared';
import { createDb, type Tx } from './client';
import { dbEnv, loadEnvFile } from './env';
import { hashPassword } from './password';
import * as schema from './schema';
import { seedDemoPeople } from './seed-demo-people';

const PLAN_MONTHLY_RUPEES: Record<TierKey, number> = { basic: 12999, medium: 15999, premium: 19999 };
const SHEET_COUNTS: Record<TierKey, number> = { basic: 66, medium: 82, premium: 112 };
const DEMO_SLUG = 'sunrise-care';
const DEMO_PASSWORD = 'Demo@12345';

const PURPOSES = [
  { key: 'account_management', label: 'Account management', description: 'Create and run your hospital account, users and locations.', required: true },
  { key: 'service_delivery', label: 'Service delivery', description: 'Provide the modules you subscribe to.', required: true },
  { key: 'billing_invoicing', label: 'Billing and invoicing', description: 'Raise GST invoices and keep payment records.', required: true },
  { key: 'security_audit', label: 'Security and audit', description: 'Protect the account and keep an audit trail.', required: true },
  { key: 'product_updates', label: 'Product updates', description: 'Occasional news about Hospital OS. Optional.', required: false },
] as const;

function publicId(prefix: 'order' | 'pay'): string {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const bytes = randomBytes(14);
  let out = '';
  for (let i = 0; i < 14; i++) out += alphabet[bytes[i]! % 62];
  return `${prefix}_${out}`;
}

async function seedCatalogue(db: Tx | ReturnType<typeof createDb>['db'], log: (m: string) => void): Promise<void> {
  const haveModule = new Map(
    (await db.select({ id: schema.modules.id, key: schema.modules.key }).from(schema.modules)).map((m) => [m.key, m.id]),
  );
  for (const [i, mod] of MODULE_DEFS.entries()) {
    if (haveModule.has(mod.key)) continue;
    const [row] = await db
      .insert(schema.modules)
      .values({
        key: mod.key,
        code: mod.code,
        docNo: mod.docNo,
        name: mod.name,
        docName: mod.docName,
        kind: mod.kind,
        category: mod.category,
        description: mod.description,
        icon: mod.icon,
        phase: mod.phase,
        sortOrder: i,
        status: mod.defaultStatus,
        addonPurchasable: mod.defaultAddon,
        gstRateBp: 1800,
        sacCode: '998314',
      })
      .returning({ id: schema.modules.id });
    haveModule.set(mod.key, row!.id);
  }

  const haveFeature = new Set((await db.select({ key: schema.moduleFeatures.key }).from(schema.moduleFeatures)).map((f) => f.key));
  const missingFeatures = FEATURE_DEFS.filter((f) => !haveFeature.has(f.key));
  if (missingFeatures.length > 0) {
    await db.insert(schema.moduleFeatures).values(
      missingFeatures.map((f) => ({
        moduleId: haveModule.get(f.moduleKey)!,
        key: f.key,
        name: f.name,
        sourceName: f.sourceName,
        type: f.type,
        source: f.source,
        sheetModule: f.sheetModule,
        sheetStatus: f.sheetStatus,
        sheetRow: f.sheetRow,
        sortOrder: f.sortOrder,
      })),
    );
  }

  const featureId = new Map(
    (await db.select({ id: schema.moduleFeatures.id, key: schema.moduleFeatures.key }).from(schema.moduleFeatures)).map((f) => [f.key, f.id]),
  );

  for (const [i, plan] of DEFAULT_PLANS.entries()) {
    let planId = (await db.select({ id: schema.plans.id }).from(schema.plans).where(eq(schema.plans.key, plan.key)))[0]?.id;
    if (!planId) {
      const [row] = await db
        .insert(schema.plans)
        .values({
          key: plan.key,
          name: plan.name,
          tagline: plan.tagline,
          description: plan.description,
          highlight: plan.highlight,
          badge: plan.badge ?? '',
          sortOrder: i,
          status: 'active',
        })
        .returning({ id: schema.plans.id });
      planId = row!.id;
    }
    const monthly = rupeesToPaise(PLAN_MONTHLY_RUPEES[plan.key]);
    const annual = monthly * ANNUAL_MONTHS_CHARGED;
    for (const [cycle, amountPaise] of [
      ['monthly', monthly],
      ['annual', annual],
    ] as const) {
      const exists = await db
        .select({ id: schema.prices.id })
        .from(schema.prices)
        .where(and(eq(schema.prices.targetType, 'plan'), eq(schema.prices.targetId, planId), eq(schema.prices.billingCycle, cycle)));
      if (exists.length === 0) {
        await db.insert(schema.prices).values({
          targetType: 'plan',
          targetId: planId,
          billingCycle: cycle,
          amountPaise,
          per: 'location',
          currency: 'INR',
          isPlaceholder: true,
        });
      }
    }
    const links = SHEET_FEATURE_DEFS.filter((f) => f.tiers[plan.key]).map((f) => ({
      planId,
      featureId: featureId.get(f.key)!,
    }));
    if (links.length > 0) await db.insert(schema.planModuleFeatures).values(links).onConflictDoNothing();
  }

  for (const mod of MODULE_DEFS) {
    if (mod.defaultAddonMonthlyRupees == null) continue;
    const moduleId = haveModule.get(mod.key)!;
    const monthly = rupeesToPaise(mod.defaultAddonMonthlyRupees);
    for (const [cycle, amountPaise] of [
      ['monthly', monthly],
      ['annual', monthly * ANNUAL_MONTHS_CHARGED],
    ] as const) {
      const exists = await db
        .select({ id: schema.prices.id })
        .from(schema.prices)
        .where(and(eq(schema.prices.targetType, 'module_addon'), eq(schema.prices.targetId, moduleId), eq(schema.prices.billingCycle, cycle)));
      if (exists.length === 0) {
        await db.insert(schema.prices).values({
          targetType: 'module_addon',
          targetId: moduleId,
          billingCycle: cycle,
          amountPaise,
          isPlaceholder: true,
        });
      }
    }
  }

  for (const [key, description] of Object.entries(PERMISSIONS)) {
    await db.insert(schema.permissions).values({ key, description }).onConflictDoNothing();
  }
  for (const [i, role] of SYSTEM_ROLES.entries()) {
    let roleId = (
      await db
        .select({ id: schema.roles.id })
        .from(schema.roles)
        .where(and(isNull(schema.roles.tenantId), eq(schema.roles.key, role.key)))
    )[0]?.id;
    if (!roleId) {
      const [row] = await db
        .insert(schema.roles)
        .values({
          tenantId: null,
          key: role.key,
          name: role.name,
          description: role.description,
          isSystem: true,
          sortOrder: i,
        })
        .returning({ id: schema.roles.id });
      roleId = row!.id;
    }
    if (role.permissions.length > 0) {
      await db
        .insert(schema.rolePermissions)
        .values(role.permissions.map((permissionKey) => ({ roleId: roleId!, permissionKey })))
        .onConflictDoNothing();
    }
  }

  const notice = await db.select({ id: schema.privacyNotices.id }).from(schema.privacyNotices).where(eq(schema.privacyNotices.version, '1'));
  if (notice.length === 0) {
    await db.insert(schema.privacyNotices).values({
      version: '1',
      title: 'Hospital OS privacy notice',
      summary: 'How Hospital OS uses account and billing data under the Digital Personal Data Protection Act, 2023. Sample notice for the demo.',
      body: [
        'Hospital OS is a sample product. Do not enter real patient data.',
        'We store the account you create (name, email, mobile), your facility profile, locations, subscription and invoices.',
        'Consent is collected for specific purposes. You can raise an access, correction, erasure or grievance request from the privacy page.',
        'Payments in this demo are simulated. No money moves and no real gateway is contacted.',
      ].join('\n\n'),
      purposes: [...PURPOSES],
      effectiveFrom: '2026-04-01',
      isCurrent: true,
    });
  }

  const settings = await db.select({ id: schema.platformSettings.id }).from(schema.platformSettings);
  if (settings.length === 0) {
    await db.insert(schema.platformSettings).values({
      id: 1,
      supplierLegalName: 'Hospital OS Technologies Pvt Ltd',
      supplierTradeName: 'Hospital OS',
      supplierGstin: '27HOSPL1234H1Z5',
      supplierStateCode: '27',
      supplierAddress: 'Sample Tower, Bandra Kurla Complex, Mumbai, Maharashtra 400051',
      defaultSacCode: '998314',
      defaultGstRateBp: 1800,
      invoicePrefix: 'HOS',
    });
  }

  loadEnvFile();
  const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@hospitalos.test').toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345';
  const existingAdmin = await db
    .select({ id: schema.platformAdmins.id })
    .from(schema.platformAdmins)
    .where(eq(schema.platformAdmins.email, adminEmail));
  if (existingAdmin.length === 0) {
    await db.insert(schema.platformAdmins).values({
      email: adminEmail,
      name: 'App Admin',
      passwordHash: await hashPassword(adminPassword),
      status: 'active',
    });
  }

  const counts = await db.execute<{ key: string; n: number }>(sql`
    select p.key, count(*)::int as n
    from plan_module_features pmf
    join plans p on p.id = pmf.plan_id
    join module_features f on f.id = pmf.feature_id and f.source = 'sheet'
    group by p.key
  `);
  const byKey = new Map(counts.rows.map((r) => [r.key, Number(r.n)]));
  for (const key of ['basic', 'medium', 'premium'] as const) {
    const n = byKey.get(key) ?? 0;
    log(`plan ${key}: ${n} sheet features`);
    if (n !== SHEET_COUNTS[key]) throw new Error(`Expected ${SHEET_COUNTS[key]} sheet features on ${key}, found ${n}`);
  }
}

async function seedDemoTenant(db: ReturnType<typeof createDb>['db'], log: (m: string) => void): Promise<void> {
  const existing = await db.select({ id: schema.tenants.id }).from(schema.tenants).where(eq(schema.tenants.slug, DEMO_SLUG));
  if (existing.length > 0) {
    log('demo tenant already present');
    printLogins(log);
    return;
  }

  const plan = (await db.select().from(schema.plans).where(eq(schema.plans.key, 'medium')))[0];
  if (!plan) throw new Error('Medium plan is missing. Run db:seed first.');
  const settings = (await db.select().from(schema.platformSettings))[0];
  if (!settings) throw new Error('Platform settings are missing. Run db:seed first.');
  const monthly = (
    await db
      .select()
      .from(schema.prices)
      .where(and(eq(schema.prices.targetType, 'plan'), eq(schema.prices.targetId, plan.id), eq(schema.prices.billingCycle, 'monthly')))
  )[0];
  if (!monthly) throw new Error('Medium plan has no monthly price.');

  const cycle: BillingCycle = 'monthly';
  const book: PriceBook = {
    plans: [{ id: plan.id, name: plan.name, monthlyPaise: monthly.amountPaise, annualPaise: monthly.amountPaise * ANNUAL_MONTHS_CHARGED }],
    addons: [],
    planGstRateBp: settings.defaultGstRateBp,
    planSacCode: settings.defaultSacCode,
  };
  const priced = applyGst(priceSubscription(book, { planId: plan.id, cycle, locationCount: 3, addonModuleIds: [] }), settings.supplierStateCode, '27');
  const start = new Date();
  const end = addCycle(start, cycle);
  const quote: QuoteDto = {
    purpose: 'onboarding',
    config: { planId: plan.id, planName: plan.name, cycle, locationCount: 3, addonModuleIds: [] },
    lines: priced.lines,
    totals: priced.totals,
    supplierStateCode: settings.supplierStateCode,
    placeOfSupplyStateCode: '27',
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    change: null,
  };

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const roleRows = await db.select().from(schema.roles).where(isNull(schema.roles.tenantId));
  const roleByKey = new Map(roleRows.map((r) => [r.key, r.id]));

  await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.scope', 'platform', true), set_config('app.tenant_id', '', true)`);
    const [tenant] = await tx
      .insert(schema.tenants)
      .values({
        slug: DEMO_SLUG,
        status: 'active',
        onboardingStep: 'done',
        onboardingDraft: { planId: plan.id, cycle, locationCount: 3, addonModuleIds: [] },
        onboardingCompletedAt: start,
        facilityType: 'hospital',
        legalName: 'Sunrise Care Hospitals (Demo)',
        displayName: 'Sunrise Care Hospitals (Demo)',
        gstin: '27SUNRI1234S1Z5',
        registrationNo: 'DEMO-MH-2026-001',
        bedCount: 120,
        specialities: ['General Medicine', 'General Surgery', 'Obstetrics & Gynaecology'],
        sandbox: true,
      })
      .returning();
    const tenantId = tenant!.id;

    const locationDefs = [
      { name: 'Mumbai', code: 'MUM', city: 'Mumbai', stateCode: '27', pincode: '400001', addressLine1: '12 Demo Sea Road, Fictional Chowk', phone: '02240000001', isPrimary: true, sortOrder: 0 },
      { name: 'Indore', code: 'IDR', city: 'Indore', stateCode: '23', pincode: '452001', addressLine1: '45 Sample Rajwada Lane', phone: '07314000002', isPrimary: false, sortOrder: 1 },
      { name: 'Jaipur', code: 'JAI', city: 'Jaipur', stateCode: '08', pincode: '302001', addressLine1: '8 Fictional MI Road', phone: '01414000003', isPrimary: false, sortOrder: 2 },
    ];
    const locs = [];
    for (const loc of locationDefs) {
      const [row] = await tx.insert(schema.locations).values({ tenantId, ...loc }).returning();
      locs.push(row!);
      await tx.insert(schema.departments).values(DEFAULT_DEPARTMENTS.map((name, sortOrder) => ({ tenantId, locationId: row!.id, name, sortOrder })));
    }

    const sampleDoctors = [
      ['Dr. Asha Fictional', 'MBBS, MD', 'General Medicine'],
      ['Dr. Rohan Sample', 'MBBS, MS', 'General Surgery'],
      ['Dr. Meera Demo', 'MBBS, DGO', 'Obstetrics & Gynaecology'],
    ] as const;
    for (const loc of locs) {
      await tx.insert(schema.doctors).values(
        sampleDoctors.map(([name, qualification, speciality]) => ({
          tenantId,
          locationId: loc.id,
          name,
          qualification,
          speciality,
          isSample: true,
        })),
      );
    }

    const staff = [
      { email: 'owner@sunrise.demo', name: 'Asha Demo Owner', mobile: '9811111111', role: 'tenant_admin', designation: 'owner' as const, locationId: null },
      { email: 'location.admin@sunrise.demo', name: 'Rohan Demo Admin', mobile: '9822222222', role: 'location_admin', designation: null, locationId: locs[0]!.id },
      { email: 'frontdesk@sunrise.demo', name: 'Meera Demo Desk', mobile: '9833333333', role: 'front_desk', designation: null, locationId: locs[0]!.id },
      { email: 'doctor@sunrise.demo', name: 'Dr. Kabir Fictional', mobile: '9844444444', role: 'doctor', designation: null, locationId: locs[0]!.id },
      { email: 'nurse@sunrise.demo', name: 'Nurse Lata Sample', mobile: '9855555555', role: 'nurse', designation: null, locationId: locs[0]!.id },
      { email: 'cashier@sunrise.demo', name: 'Vikram Demo Cashier', mobile: '9866666666', role: 'cashier', designation: null, locationId: locs[0]!.id },
    ];
    let ownerId: string | null = null;
    for (const person of staff) {
      const [user] = await tx
        .insert(schema.users)
        .values({
          tenantId,
          email: person.email,
          mobile: person.mobile,
          name: person.name,
          passwordHash,
          status: 'active',
          designation: person.designation,
          mobileVerifiedAt: start,
        })
        .returning();
      if (person.role === 'tenant_admin') ownerId = user!.id;
      await tx.insert(schema.userLocationRoles).values({
        tenantId,
        userId: user!.id,
        roleId: roleByKey.get(person.role)!,
        locationId: person.locationId,
      });
    }

    const [subscription] = await tx
      .insert(schema.subscriptions)
      .values({
        tenantId,
        planId: plan.id,
        billingCycle: cycle,
        locationCount: 3,
        status: 'active',
        currentPeriodStart: start,
        currentPeriodEnd: end,
        creditPaise: 0,
      })
      .returning();
    await tx.insert(schema.subscriptionItems).values({
      tenantId,
      subscriptionId: subscription!.id,
      kind: 'plan',
      planId: plan.id,
      unitAmountPaise: monthly.amountPaise,
      quantity: 3,
      status: 'active',
    });

    const [order] = await tx
      .insert(schema.orders)
      .values({
        tenantId,
        publicId: publicId('order'),
        purpose: 'onboarding',
        status: 'paid',
        amountPaise: priced.totals.totalPaise,
        quote,
        idempotencyKey: 'demo-sunrise-onboarding',
        createdBy: ownerId,
        paidAt: start,
        fulfilledAt: start,
      })
      .returning();
    const [payment] = await tx
      .insert(schema.payments)
      .values({
        tenantId,
        orderId: order!.id,
        publicId: publicId('pay'),
        method: 'upi',
        methodDetails: { vpa: 'asha@demo' },
        status: 'captured',
        amountPaise: priced.totals.totalPaise,
        signatureVerified: true,
        capturedAt: start,
      })
      .returning();

    const numbered = await tx.execute<{ fy: string; number: string }>(
      sql`select fy, number from hos_next_invoice_number(${start.toISOString()}::timestamptz)`,
    );
    const series = numbered.rows[0];
    if (!series) throw new Error('Invoice number series returned no row');
    const mumbai = locs[0]!;
    const supplier = {
      legalName: settings.supplierLegalName,
      tradeName: settings.supplierTradeName,
      gstin: settings.supplierGstin,
      address: settings.supplierAddress,
      stateCode: settings.supplierStateCode,
      stateName: stateName(settings.supplierStateCode),
    };
    const customer = {
      legalName: 'Sunrise Care Hospitals (Demo)',
      tradeName: 'Sunrise Care Hospitals (Demo)',
      gstin: '27SUNRI1234S1Z5',
      address: `${mumbai.addressLine1}, ${mumbai.city}, ${stateName(mumbai.stateCode)} ${mumbai.pincode}`,
      stateCode: '27',
      stateName: 'Maharashtra',
    };
    const ist = new Date(start.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
    const [invoice] = await tx
      .insert(schema.invoices)
      .values({
        tenantId,
        number: series.number,
        fy: series.fy,
        orderId: order!.id,
        paymentId: payment!.id,
        status: 'paid',
        issueDate: ist,
        description: 'Hospital OS Medium plan — monthly subscription (sample)',
        supplier,
        customer,
        placeOfSupplyStateCode: '27',
        interState: false,
        taxablePaise: priced.totals.taxablePaise,
        cgstPaise: priced.totals.cgstPaise,
        sgstPaise: priced.totals.sgstPaise,
        igstPaise: priced.totals.igstPaise,
        totalPaise: priced.totals.totalPaise,
        periodStart: start,
        periodEnd: end,
        notes: 'Sample price. Mock invoice — no tax is remitted.',
      })
      .returning();
    await tx.insert(schema.invoiceLines).values(
      priced.lines.map((line, sortOrder) => ({
        tenantId,
        invoiceId: invoice!.id,
        sortOrder,
        description: line.description,
        sacCode: line.sacCode,
        quantity: line.quantity,
        unitPaise: line.unitPaise,
        amountPaise: line.amountPaise,
        gstRateBp: line.gstRateBp,
        cgstPaise: line.cgstPaise,
        sgstPaise: line.sgstPaise,
        igstPaise: line.igstPaise,
      })),
    );

    await tx.insert(schema.checklistItems).values([
      { tenantId, key: 'staff', doneAt: start, doneBy: ownerId },
    ]);
    await tx.insert(schema.auditLog).values({
      tenantId,
      actorType: 'system',
      actorLabel: 'Demo seed',
      action: 'demo.tenant.seed',
      entityType: 'tenant',
      entityId: tenantId,
      after: { slug: DEMO_SLUG, plan: 'medium' },
    });
    log(`demo tenant ${tenantId} invoice ${series.number}`);
  });
  printLogins(log);
}

function printLogins(log: (m: string) => void): void {
  loadEnvFile();
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@hospitalos.test';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345';
  log('Demo logins');
  log(`  App Admin        ${adminEmail} / ${adminPassword}`);
  log(`  Tenant Admin     owner@sunrise.demo / ${DEMO_PASSWORD}`);
  log(`  Location Admin   location.admin@sunrise.demo / ${DEMO_PASSWORD}`);
  log(`  Front Desk       frontdesk@sunrise.demo / ${DEMO_PASSWORD}`);
  log(`  Doctor           doctor@sunrise.demo / ${DEMO_PASSWORD}`);
  log(`  Nurse            nurse@sunrise.demo / ${DEMO_PASSWORD}`);
  log(`  Cashier          cashier@sunrise.demo / ${DEMO_PASSWORD}`);
}

export async function seed(log: (m: string) => void = console.log): Promise<void> {
  const handle = createDb(dbEnv().migrationUrl, { max: 2 });
  try {
    await seedCatalogue(handle.db, log);
    log('catalogue seed complete');
  } finally {
    await Promise.race([handle.close(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
}

export async function seedDemo(log: (m: string) => void = console.log): Promise<void> {
  const handle = createDb(dbEnv().migrationUrl, { max: 2 });
  try {
    await seedCatalogue(handle.db, log);
    // Demo checkout still offers success / failure / pending. The API honours that
    // choice only when this flag is on and NODE_ENV is not production.
    await handle.db
      .update(schema.platformSettings)
      .set({ mockPaymentSimulator: true })
      .where(eq(schema.platformSettings.id, 1));
    log('mock payment simulator on for the demo checkout');
    await seedDemoTenant(handle.db, log);
    await seedDemoPeople(handle.db, log);
  } finally {
    await Promise.race([handle.close(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
}
