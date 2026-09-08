# Phase 3 — Self-serve billing (Paddle)

**Status:** Core shipped (adapter stub + webhook + Settings + dunning). Sandbox purchase not claimed without Paddle credentials.  
**Gate:** lint · typecheck · unit · isolation vs live DB · build · smoke. Additive migration only (ADR-004).

## Goal

A company can upgrade, pay, change seats, see invoices, and cancel **without a platform operator**, using Paddle as merchant of record (tax/invoices). Manual grant/comp/trial on the platform console stays.

## Already in the product (do not rebuild)

- Plans: Starter (free, 10) / Growth ($4) / Scale ($7, unlimited) — `src/modules/billing/plans.ts`
- Org columns: `plan`, `billing_status`, `trial_ends_at`, `seat_limit`, `billing_provider`, `billing_customer_id`, `billing_subscription_id` (migration 0047)
- Hard seat cap on invite (`assertSeatAvailable`)
- Settings → Plan & Billing (read-only + sales mailto)
- Platform PATCH/POST/DELETE grant trial / set plan / cancel
- Hourly `trial_sweep`: no provider → Starter; provider set → `past_due`
- Session gate: `cancelled` blocks login; `past_due` stays usable

The comment in `service.ts` mentions `billingAdapter`. It does not exist yet.

## Build

### 1. Schema — `scripts/migration-0059.sql`

| Object | Why |
|---|---|
| `organizations.seat_overage_policy` `hard` \| `soft` default `hard` | Soft-cap invites vs today's hard-block |
| `organizations.billing_status_changed_at` | Dunning day 1/3/7 without guessing from `updated_at` |
| `organizations.dunning_stage` int default 0 | Last dunning email sent (0, 1, 3, or 7) |
| `billing_events` PK `event_id` | Webhook replay is a no-op |
| `billing_invoices` | Settings invoice list (Paddle-hosted URLs) |

### 2. Adapter seam — `src/modules/billing/adapter.ts`

No Paddle npm SDK (fetch + node crypto). Unset `PADDLE_API_KEY` → adapter reports unconfigured; checkout stays “Talk to sales”.

| Method | Paddle |
|---|---|
| `createCheckout({ orgId, plan, quantity, email })` | `POST /transactions` → `checkout.url`; `custom_data.organizationId` |
| `createPortal({ customerId, subscriptionId })` | `POST /customers/{id}/portal-sessions` |
| `syncSeats({ subscriptionId, priceId, quantity })` | `PATCH /subscriptions/{id}` `proration_billing_mode=prorated_immediately` |
| `cancelSubscription({ subscriptionId })` | `POST /subscriptions/{id}/cancel` |

Env (sandbox until live):

```
PADDLE_API_KEY=
PADDLE_WEBHOOK_SECRET=
PADDLE_ENV=sandbox
PADDLE_PRICE_GROWTH=pri_...
PADDLE_PRICE_SCALE=pri_...
```

API host: `sandbox-api.paddle.com` vs `api.paddle.com`.

### 3. Webhook — `POST /api/v1/billing/webhook` (`auth: false`)

- Raw body + `Paddle-Signature` (`ts=…;h1=…`). HMAC-SHA256 of `${ts}:${rawBody}`. Reject bad sig / skew > 5 minutes.
- Insert `billing_events`; unique `event_id` → 200 replay, no second apply.
- Resolve org: `custom_data.organizationId` → else `billing_subscription_id` → else `billing_customer_id`. Unknown org → 200 (Paddle retries otherwise).
- Map subscription status → `trial|active|past_due|cancelled`. Set provider `paddle` + customer/subscription ids. Reset `dunning_stage` on status change.
- `transaction.completed` / invoice events upsert `billing_invoices`.
- Cross-tenant: event for org A never writes org B.

### 4. Seats

- `hard` (default): invite at cap → 409 (unchanged).
- `soft`: invite allowed; Settings + Home show overage banner; Paddle quantity still syncs after a successful invite (best-effort, never fail the invite).
- Quantity = `activeSeatCount` (active memberships).

### 5. Settings → Plan & Billing

- Plan comparison (Starter / Growth / Scale).
- **Upgrade** → checkout URL (needs `settings.manage` + Paddle configured).
- **Manage billing** → Paddle portal (card, invoices).
- Invoice table from `billing_invoices`.
- **Cancel** with data-retention notice (Paddle cancel; webhook flips status).
- `past_due` banner: pay via portal, not “contact support” only.

### 6. Platform console

Keep grant trial / set plan / cancel. Optional: show `seat_overage_policy`. No Paddle calls required for comps.

### 7. Dunning — job `dunning_sweep` (hourly)

For `billing_status=past_due`, days since `billing_status_changed_at`:

| Day | Email | Product |
|---|---|---|
| 1 | Payment failed — update card | Banner |
| 3 | Reminder | Banner |
| 7 | Last notice | Banner (already); login still works until `cancelled` |
| webhook `canceled` | — | Hard stop (existing session gate) |

Emails go to users with `settings.manage`. Kind `billing.dunning` honors email prefs. Idempotent via `dunning_stage`.

## Edge cases (must have tests)

- Bad signature → 401
- Replay same `event_id` → 200, no second status write
- Org B event cannot change org A
- Soft cap allows invite at limit; hard cap still 409
- Status map: `active`/`trialing` → active/trial; `past_due` → past_due; `canceled`/`cancelled` → cancelled
- Checkout without Paddle env → 503 with a clear message (UI keeps Talk to sales)

## Out of scope

- Stripe adapter (seam allows it later)
- Usage metering / add-ons
- Changing list prices in code (Paddle dashboard owns prices)

## How to try (sandbox)

1. Create Paddle sandbox prices for Growth and Scale (per unit).
2. Set env vars; `node scripts/migrate.mjs`.
3. Settings → Plan & Billing → Upgrade Growth → pay test card.
4. Webhook (Paddle dashboard or CLI) → org `active`, invoices appear.
5. Invite until cap; hard vs soft.
6. Fail payment / cancel in portal → `past_due` / `cancelled`.
