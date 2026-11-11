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

`requireModule` allows the call only when the module’s access is `enabled` (catalogue status available, and at least one feature entitled or an explicit module grant). A coming-soon module stays locked so the UI can show the upsell. `requireFeature` checks the feature key itself, so a Basic hospital can use Patient Registration and still receive `not_entitled` for premium-only MLC Registration (`patient-registration.mlc-registration`). The only module routes in this phase are those two probes, and both go through `requireModule`. The feature probe also calls `requireFeature`. Phase B adds a `TENANT_GUARDS` row per real module route.

### Seat limits

A plan includes a fixed number of users **per purchased location**. Decision: Basic 8, Medium 25, Premium 80. Active and pending users count. Disabled users do not, so turning a disabled user back on needs a free seat. `POST /tenant/users/invite` and a status change to `active` return **403 `seat_limit`** when the next user would pass the cap (`seats per location × subscription.locationCount`).

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

### Who decides a mock payment

The server captures the payment. A client `outcome` on `POST /billing/orders/:id/pay` is ignored unless both of these are true: `NODE_ENV` is not `production`, and `platform_settings.mock_payment_simulator` is true (default false). That flag is the dev simulator. The checkout screen can still send an outcome; the API does not use it while the flag is off, so the demo Pay button records a capture.

A hospital session cannot capture or fail its own pending payment. `POST /billing/payments/:id/resolve` is not a tenant route. The mock gateway calls `POST /api/v1/billing/webhooks/mock` with `Idempotency-Key` and `x-hos-signature` (hex HMAC-SHA256 of the canonical JSON body, keyed with `MOCK_GATEWAY_KEY_SECRET`). The handler looks up the payment’s tenant through `hos_payment_tenant`, then transitions the payment. `hos_app` cannot `SELECT … FOR UPDATE` a payment, because that requires `UPDATE` and those grants were revoked. The lock sits inside `hos_payment_transition`, `hos_order_mark_paid`, and `hos_subscription_apply_order` (`SELECT … FOR UPDATE` as the table owner). Pay still locks the order row directly, which is allowed because `orders` keeps a column `UPDATE` grant. A bad signature is **401 `signature_invalid`**. The route is exempt from the browser CSRF header because the signature is the credential. Verify and fulfil also lock the order and the payment in the request transaction.

`Idempotency-Key` is required on order create, pay, verify, change-apply, and the mock webhook. Change-quote only prices a change, so it does not require a key.

### Financial grants

`hos_app` can insert and read invoices, invoice lines, and payments. It cannot update or delete them (`42501`). Issued invoices and invoice lines are also blocked by a trigger, including for the table owner. Corrections are credit notes: the `credit_notes` table exists (append-only, no API and no UI). A downgrade still does not create one.

Payment status moves only through `hos_payment_transition`. Order status moves through `hos_order_transition` / `hos_order_mark_paid`. `orders` keeps a column grant for `status`, `paid_at`, and `fulfilled_at`, and has no DELETE. `consents` can update only `withdrawn_at`.

`subscriptions` and `subscription_items` are not writable by `hos_app` in any scope. Fulfilment calls `hos_subscription_apply_order(order_id)` after the order is locked, `paid`, and has a captured payment with `signature_verified`. The function checks those facts, writes the subscription from the order quote, and sets `fulfilled_at`. It returns false when the order was already fulfilled, so a second verify does not write a second invoice. A no-payment downgrade and the dev renewal clock call `hos_subscription_admin_change`. Renewal requires platform scope. The no-payment reason is allowed in tenant scope because that is the immediate downgrade, which has no order to apply. In that scope the function keeps the current period, derives credit from catalogue prices, and rejects a period change, a credit above that derived value, or a plan, location count and add-on set whose monthly price is higher. Platform scope still applies the caller’s period and credit. The shared writer `hos_subscription_replace` is not granted to `hos_app`.

## Tests

`npx vitest run apps/api tests/mt` uses a separate database, `hos_mt`. `tests/mt/global-setup.ts` creates it through `DATABASE_ADMIN_URL` (the same bootstrap as `npm run db:migrate`), then runs catalogue seed and demo seed. `HOS_DB_NAME=hos_mt` is set for that Vitest run so the shared `hospital_os` database is left alone.

The suite checks the route inventory, Basic → 403 `not_entitled` on MLC Registration, a grant override → 200, revoke → 403, suspend → `tenant_suspended` with billing reads still allowed, reactivate → 200, a Basic→Medium mock checkout moving sheet entitlements from 66 to 82 with a prorated invoice even when the client asks for a failed outcome, an immediate downgrade back with no credit note, two hospitals whose list endpoints return only their own rows, the seat cap, a pending payment that a tenant cannot resolve and a signed webhook can, and `42501` when `hos_app` writes invoices, payments, or subscriptions directly. The wizard and the paid upgrade still go through the definer functions.

## Review fixes 11 Nov

- Disabling a user revokes their pending invitations and their sessions. `hos_invite_tenant` returns a tenant only when the invitation is pending and unexpired and the user is still `pending`. Accept-invite locks that invitation and the user row and refuses anyone who is not pending, so a disabled invitee cannot become active and take a seat.
- Seat checks take a per-tenant advisory transaction lock before counting active and pending users. Concurrent invites for the last seat cannot all pass the count.
- Authenticator setup and enable are self-service. Any signed-in hospital user can turn on TOTP for their own account. The routes no longer require `tenant.manage`.
- A tenant-scope no-payment subscription change cannot set a new period, cannot store more credit than the current balance plus the unused pre-tax value of the price drop, and cannot move to a combination whose monthly catalogue price is higher. The credit that is stored is computed in SQL. App Admin renewal still passes the period and credit it calculated.
- Creating an order locks the hospital row, and a partial unique index allows only one `created` or `attempted` order per hospital per purpose. Two concurrent onboarding orders leave a single open order.
