# Multitenancy

How Hospital OS keeps one hospital’s data out of another, how a plan turns into entitlements, and how mock billing changes those entitlements. Prices in the product are sample prices. Payments are mock only.

## Isolation layers

A request is isolated in three places. Each layer is independent, so a miss in one is still caught by the next.

1. **Database role.** The API connects as `hos_app` (`DATABASE_URL`). That role is not a superuser and does not have `BYPASSRLS`. Migrations run as `hos_migrator`. The superuser URL is only for creating the database and the two roles.
2. **Row-level security.** Every tenant-owned table has `tenant_id` and forced RLS. Inside a transaction the API sets `app.tenant_id` and `app.scope` (`tenant` or `platform`). Policies allow a row only when `tenant_id` equals `hos_tenant_id()`. Platform catalogue tables (plans, modules, prices) are readable by every session; tenant rows are not. Another hospital’s id is invisible, so the API returns **404**, not 403.
3. **Request guards.** Tenant routes go through `openTenant` (`apps/api/src/guard.ts`). That loads the session, rejects a suspended or still-onboarding hospital, and applies the route’s entry in `TENANT_GUARDS` (`apps/api/src/route-guards.ts`). There is no cross-request entitlement cache: `computeEntitlements` runs on every request (the result is kept only for the rest of that request). A plan change, add-on purchase, App Admin override, or reactivation is visible on the next call.

`hos_app` sets its own session variables, so RLS stops application bugs. It does not stop a compromised API process. That limit is also stated in `docs/SECURITY_AND_COMPLIANCE.md`.

App Admin routes use `openPlatform` / `openPlatformTenant`. They are not tenant routes. `openPlatformTenant` sets both platform scope and the target `tenant_id`, which is what RLS needs for a grant, suspend, or renewal.

### Suspended hospitals

Every tenant route returns **403 `tenant_suspended`** while the hospital is suspended, except:

- `GET /api/v1/auth/me` and `POST /api/v1/auth/logout` (the session itself)
- billing **reads**: subscription, invoice list, invoice detail, PDF, and HTML

Billing writes (orders, pay, verify, change-quote, change-apply) stay blocked. Reactivation restores the previous status (`active` or `onboarding`).

### Route inventory

`TENANT_GUARDS` is the list of tenant routes. Each entry has:

| Field | Meaning |
|---|---|
| `permission` | Passed to `requirePermission`. `authenticated` means any active tenant user (the shell: dashboard, entitlements, locations, module probe). `null` is only `/auth/me` and `/auth/logout`. |
| `module` | Optional module key, or `{ param }` to read it from the path. Missing or not `enabled` → **403 `not_entitled`**. |
| `feature` | Optional feature key. Absent from the entitlement set → **403 `not_entitled`**. A feature key must start with its module key (`patient-registration.mlc-registration`). |
| `allowWhenSuspended` | The route still runs for a suspended hospital. |

`openTenant` returns **500 `guard_missing`** when a handler uses it without a matching entry, so a new route cannot ship unguarded. `tests` print Fastify’s route tree (`printRoutes`) and fail if a tenant URL is missing from the map or a map entry is not registered.

`GET /api/v1/tenant/m/:moduleKey` is the module probe (`requireModule`).

`GET /api/v1/tenant/m/:moduleKey/features/:featureKey` is the feature probe (`requireFeature`). Phase B should not keep piling clinical routes onto that probe. Add a row instead:

```ts
entry('GET', '/api/v1/tenant/m/nurse-station/lab-orders', {
  permission: 'nursing.manage',
  module: 'nurse-station',
  feature: 'nurse-station.lab-orders',
});
```

Call `gate.requireFeature('nurse-station.lab-orders')` in the handler as well. The registry still enforces it if the handler forgets; the second call is free because the request already computed entitlements.

## Entitlement evaluation

Effective entitlements are pure and live in `computeEntitlements` (`packages/shared/src/entitlements.ts`):

1. Features linked to the tenant’s plan (`plan_module_features`). Sheet1 is the seed: Basic 66, Medium 82, Premium 112. Users Management platform features are not in those counts.
2. Purchased add-on modules. Buying a module grants every feature of that module.
3. App Admin overrides, module first, then feature. A feature grant or revoke wins over the module. A module revoke strips that module’s features.

`requireModule` allows the call only when the module’s access is `enabled` (catalogue status available, and at least one feature entitled or an explicit module grant). A coming-soon module stays locked so the UI can show the upsell. `requireFeature` checks the feature key itself, so a Basic hospital can use Patient Registration and still receive `not_entitled` for premium-only MLC Registration (`patient-registration.mlc-registration`).

An add-on purchase or a feature grant override opens that feature on the next request. Deleting the override (or a revoke override) closes it again. Suspending the hospital does not change the entitlement set; the suspend check runs first and returns `tenant_suspended`.

## Billing lifecycle

Mock checkout follows the contract in `docs/CONTRACTS.md`:

1. `POST /billing/change-quote` prices the change. It does not write the subscription.
2. If `change.noPayment` is false, the client creates an order with `purpose: 'change'`, pays, and `POST /billing/verify` checks the mock signature.
3. Verify fulfils the order in the same transaction: subscription items are replaced, entitlements follow on the next read, and an invoice is written from the quote lines. Those lines are the prorated difference (`prorated remaining/total days` in the description), plus GST (CGST+SGST or IGST).
4. If `change.noPayment` is true, `POST /billing/change-apply` writes the subscription immediately and does not create an order.

### Downgrades (decision)

Downgrades apply **immediately**, with **no cash refund**. The unused pre-tax amount becomes `subscriptions.credit_paise` and is applied to a later charge (the next upgrade, or the next renewal). A GST **credit note is out of scope**: downgrades do not create a credit-note document or a negative invoice. The billing page shows the new plan as soon as `change-apply` (or a paid fulfil) commits.

### Renewals

`POST /api/v1/admin/tenants/:id/dev/advance-clock` with `{ "days": N }` is App Admin only and returns **404** when `NODE_ENV` is `production`. It pretends the clock moved forward `N` days. Each time the subscription period end falls on or before that horizon, the API:

- starts the next period at the old period end
- writes a **renewal invoice** for the full next period (plan + add-ons, sample price, GST), marked paid because the invoice table only stores `paid` or `void` and the gateway is mock
- applies any account credit on that invoice
- leaves the plan as it is (a downgrade has already taken effect)

There is no dunning and no real collection. Calling the endpoint does not change other tenants.

## Tests

`npx vitest run apps/api tests/mt` uses a separate database, `hos_mt`. `tests/mt/global-setup.ts` creates it through `DATABASE_ADMIN_URL` (the same bootstrap as `npm run db:migrate`), then runs catalogue seed and demo seed. `HOS_DB_NAME=hos_mt` is set for that Vitest run so the shared `hospital_os` database is left alone.

The suite checks the route inventory, Basic → 403 `not_entitled` on MLC Registration, a grant override → 200, revoke → 403, suspend → `tenant_suspended` with billing reads still allowed, reactivate → 200, a Basic→Medium mock checkout moving sheet entitlements from 66 to 82 with a prorated invoice, an immediate downgrade back with no credit note, and two hospitals whose list endpoints return only their own rows.
