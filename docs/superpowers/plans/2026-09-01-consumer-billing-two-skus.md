# Consumer Billing: Two SKUs and Report Credits — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the consumer funnel to two one-time SKUs — $149 for one operator report, $299 for three redeemable report credits — and delete the market-pass and subscription products entirely, including the access path that would have granted all 44 markets for $19/month.

**Architecture:** `ProductKind` narrows to `single_report | three_pack`. A new `ReportCredit` table holds unredeemed purchases; redemption is a guarded row claim inside a transaction that also writes the `ReportEntitlement`. `MarketPass` and `Subscription` are removed from the schema and from the never-applied migration rather than dropped later. Access resolution keeps only two consumer paths: admin/market entitlement (existing B2B), and a per-PM `ReportEntitlement`.

**Tech Stack:** Next.js 16 (App Router, route handlers), TypeScript, Prisma + Postgres (Neon), Stripe (Checkout + webhooks), `node:test` for unit tests, Vitest + Testing Library for component tests.

## Global Constraints

- Prices are **$149** (`single_report`, 1 credit) and **$299** (`three_pack`, 3 credits). Display only — Stripe Prices are authoritative for the charge.
- **No recurring SKU.** Both products are Stripe `mode: "payment"`.
- **No whole-market consumer product.** `market_pass` is deleted, not repriced.
- Buyers are **guest-or-org**: a signed-in workspace user is keyed by `organizationId`, a guest by a lowercased email from a *signed* magic-link token. Never trust a raw email from user input.
- The existing B2B market gate is unchanged and always wins first. Consumer reads only ever ADD access.
- Migration `20260826000000_consumer_single_report_billing` has **never been applied to production** (verified 2026-09-01: all five tables absent). Amend it in place; do not add a corrective migration.
- `vercel-build` runs only `prisma generate && next build`. There is **no** automatic `migrate deploy` — production migration is a deliberate `npm run db:migrate:production`.
- Never print, log, or commit Stripe keys or Price ids. They are read from `process.env` at call time.
- Spec: `docs/superpowers/specs/2026-09-01-consumer-reports-bifurcation-design.md`

---

## Prerequisites — do this before Task 1

```bash
npm install
npx prisma generate
npx tsc --noEmit 2>&1 | grep -c "error TS"   # must print 0
npm run lint 2>&1 | grep problems            # must print 60 problems (43 errors, 17 warnings)
```

**`tsc` must be at zero before you start.** If it is not, you are looking at a
stale environment rather than a code problem, and every "expected" count later
in this plan will be meaningless. Two specific traps, both encountered while
writing this plan:

- `stripe` is declared in `package.json` (`^22.5.0`) but may be missing from
  `node_modules`, which produces `Cannot find module 'stripe'` in
  `src/lib/stripe.ts` and cascades ~10 errors through the webhook route.
  `npm install` fixes it.
- The generated Prisma client can predate the billing models, producing
  `Property 'reportEntitlement' does not exist on type 'PrismaClient'` and
  similar. `npx prisma generate` fixes it.

Together those two produced a phantom 17-error "baseline" that was purely
local. The real baseline is **0 tsc errors** and **60 lint problems**. Treat
any tsc error you see after this plan as yours.

## File Structure

**Modified**

| File | Responsibility after this plan |
|---|---|
| `src/lib/billing/products.ts` | Two-SKU catalog; `credits` per SKU; price-id resolution |
| `src/lib/auth/report-entitlements.ts` | Pure access precedence: admin → market → report. No pass. |
| `src/lib/auth/report-entitlements.server.ts` | DB resolver; reads `ReportEntitlement` only |
| `src/lib/billing/verify-session.ts` | Post-checkout session check for both SKUs |
| `src/app/api/stripe/checkout/route.ts` | Creates a payment-mode session for either SKU |
| `src/app/api/stripe/webhook/route.ts` | Grants entitlement (single) or mints credits (pack) |
| `src/app/report/account/page.tsx` | Buyer wallet: reports owned + credits remaining |
| `src/components/report/ReportTeaser.tsx` | Offers at $149 / $299 |
| `src/lib/report/delivery.ts` | Purchase email for two SKUs |
| `src/lib/analytics-server.ts` | Event names for two SKUs |
| `prisma/schema.prisma` | `ReportCredit` added; `MarketPass` + `Subscription` removed |
| `prisma/migrations/20260826000000_consumer_single_report_billing/migration.sql` | Amended in place |
| `package.json` | Test globs widened to cover `src/lib/billing` and `tests/database` |

**Created**

| File | Responsibility |
|---|---|
| `src/lib/billing/credits.ts` | Pure credit arithmetic + owner-key validation |
| `src/lib/billing/credits.server.ts` | `mintCredits` / `redeemCredit` — the only writers of `ReportCredit` |
| `src/lib/billing/products.test.ts` | Catalog invariants |
| `src/lib/billing/credits.test.ts` | Pure helpers |
| `tests/database/report-credits.test.ts` | Mint + redeem against a real database |

**Deleted**

- `src/components/report/ManageSubscriptionButton.tsx`
- `src/app/api/report/portal/route.ts`
- `src/lib/billing/customer.server.ts`

---

### Task 1: Two-SKU product catalog

**Files:**
- Modify: `src/lib/billing/products.ts`
- Modify: `package.json` (test glob)
- Test: `src/lib/billing/products.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `type ProductKind = "single_report" | "three_pack"`; `PRODUCTS: Record<ProductKind, BillingProduct>` where `BillingProduct = { kind, label, blurb, priceUsd, credits, stripeMode: "payment", priceEnvVar }`; `resolvePriceId(kind): string`; `productForPriceId(priceId): ProductKind | null`; `creditsFor(kind): number`.

**Why the package.json change:** `test:watch-list` globs `src/lib/*.test.ts`, `src/lib/scorecard/`, `watch-list/`, `operators/`, `auth/`, `styles/`, `ask-tools/`, `report/` — but **not** `src/lib/billing/`. A test added there would silently never run. Widen the glob in this task or every later test in that directory is theatre.

- [ ] **Step 1: Widen the test glob**

In `package.json`, add `src/lib/billing/*.test.ts` to `test:watch-list`:

```json
"test:watch-list": "node --import tsx --test src/lib/*.test.ts src/lib/scorecard/*.test.ts src/lib/watch-list/*.test.ts src/lib/operators/*.test.ts src/lib/auth/*.test.ts src/lib/styles/*.test.ts src/lib/ask-tools/*.test.ts src/lib/report/*.test.ts src/lib/billing/*.test.ts",
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/billing/products.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PRODUCTS,
  creditsFor,
  resolvePriceId,
  productForPriceId,
  type ProductKind,
} from "./products";

// Two one-time SKUs, $149 and $299. The market pass and the $19/mo
// subscription are gone: monitoring is the enterprise product's core claim,
// and the subscription's access path granted every market (it carried no
// marketId and the resolver never filtered by one).

test("exactly two SKUs, both one-time payments", () => {
  assert.deepEqual(Object.keys(PRODUCTS).sort(), ["single_report", "three_pack"]);
  for (const p of Object.values(PRODUCTS)) {
    assert.equal(p.stripeMode, "payment", `${p.kind} must not be recurring`);
  }
});

test("prices are 149 and 299", () => {
  assert.equal(PRODUCTS.single_report.priceUsd, 149);
  assert.equal(PRODUCTS.three_pack.priceUsd, 299);
});

test("credits per SKU", () => {
  assert.equal(creditsFor("single_report"), 1);
  assert.equal(creditsFor("three_pack"), 3);
});

test("the pack is cheaper per report than three singles", () => {
  const single = PRODUCTS.single_report;
  const pack = PRODUCTS.three_pack;
  assert.ok(
    pack.priceUsd < single.priceUsd * pack.credits,
    "the pack must save money or it is not a pack"
  );
});

test("resolvePriceId reads the SKU's env var and throws loudly when unset", () => {
  const prev = process.env.STRIPE_PRICE_REPORT;
  process.env.STRIPE_PRICE_REPORT = "price_test_single";
  assert.equal(resolvePriceId("single_report"), "price_test_single");
  delete process.env.STRIPE_PRICE_REPORT;
  assert.throws(() => resolvePriceId("single_report"), /STRIPE_PRICE_REPORT/);
  if (prev !== undefined) process.env.STRIPE_PRICE_REPORT = prev;
});

test("productForPriceId maps a live price back to its SKU", () => {
  const prevA = process.env.STRIPE_PRICE_REPORT;
  const prevB = process.env.STRIPE_PRICE_THREE_PACK;
  process.env.STRIPE_PRICE_REPORT = "price_a";
  process.env.STRIPE_PRICE_THREE_PACK = "price_b";
  assert.equal(productForPriceId("price_a"), "single_report");
  assert.equal(productForPriceId("price_b"), "three_pack");
  assert.equal(productForPriceId("price_unknown"), null);
  if (prevA === undefined) delete process.env.STRIPE_PRICE_REPORT;
  else process.env.STRIPE_PRICE_REPORT = prevA;
  if (prevB === undefined) delete process.env.STRIPE_PRICE_THREE_PACK;
  else process.env.STRIPE_PRICE_THREE_PACK = prevB;
});

test("no SKU mentions a market or a subscription", () => {
  const kinds = Object.keys(PRODUCTS) as ProductKind[];
  for (const k of kinds) {
    assert.ok(!/market|subscription/i.test(k), `${k} looks like a removed SKU`);
  }
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `node --import tsx --test src/lib/billing/products.test.ts`
Expected: FAIL — `creditsFor` is not exported, and `PRODUCTS` still has three keys.

- [ ] **Step 4: Rewrite the catalog**

Replace the whole of `src/lib/billing/products.ts` with:

```ts
// v0.33 — Consumer product catalog. TWO one-time SKUs.
//
// Each maps to a Stripe Price created out-of-band in the Stripe dashboard and
// referenced here by env var (never hard-coded — test and live prices differ
// per environment, same pattern as every other secret in this repo).
//
// `credits` is the join key to what a completed checkout grants (see
// src/app/api/stripe/webhook/route.ts):
//   single_report → 1 credit, redeemed immediately for the PM in metadata
//   three_pack    → 3 credits, redeemable whenever the buyer chooses
//
// WHY NO RECURRING SKU. A $19/mo "Keep Watching" product used to sit here.
// Two reasons it is gone. Monitoring — "we tell you when an operator's rating
// moves" — is the enterprise product's central claim, so selling it at any
// consumer price undercuts the thing enterprise charges thousands for. And its
// access path was broken: `Subscription` carried no marketId and the resolver
// filtered only on status, so one $19 subscription unlocked all 44 markets.
//
// WHY NO MARKET PASS. $49 for every operator in a market for 30 days
// dominated $149-per-operator, making the ladder incoherent. A whole-market
// consumer product may come back later, priced deliberately.
//
// Prices below are DISPLAY ONLY (marketing copy, receipts). The charged amount
// is whatever the Stripe Price says — Stripe is the source of truth for money.

export type ProductKind = "single_report" | "three_pack";

export interface BillingProduct {
  kind: ProductKind;
  /** Human label for CTAs / receipts. */
  label: string;
  /** Short tagline for the purchase surface. */
  blurb: string;
  /** Display price in whole USD. Stripe is authoritative for the charge. */
  priceUsd: number;
  /** Report credits this SKU grants. */
  credits: number;
  /** Stripe Checkout mode. Both SKUs are one-time. */
  stripeMode: "payment";
  /** Name of the env var holding this SKU's Stripe Price id. */
  priceEnvVar: string;
}

export const PRODUCTS: Record<ProductKind, BillingProduct> = {
  single_report: {
    kind: "single_report",
    label: "Single Report",
    blurb: "Full scorecard for one property manager — web + PDF, yours to keep.",
    priceUsd: 149,
    credits: 1,
    stripeMode: "payment",
    priceEnvVar: "STRIPE_PRICE_REPORT",
  },
  three_pack: {
    kind: "three_pack",
    label: "Three-Report Pack",
    blurb: "Three full scorecards, redeemable whenever you choose.",
    priceUsd: 299,
    credits: 3,
    stripeMode: "payment",
    priceEnvVar: "STRIPE_PRICE_THREE_PACK",
  },
};

/** Report credits granted by one purchase of this SKU. */
export function creditsFor(kind: ProductKind): number {
  return PRODUCTS[kind].credits;
}

/** Resolve the Stripe Price id for a SKU from env. Throws (loud) if unset — a
 *  checkout can't proceed without it and a silent fallback would charge the
 *  wrong price. */
export function resolvePriceId(kind: ProductKind): string {
  const envVar = PRODUCTS[kind].priceEnvVar;
  const priceId = process.env[envVar];
  if (!priceId) {
    throw new Error(`${envVar} is not configured (Stripe Price for ${kind})`);
  }
  return priceId;
}

/** Reverse lookup: which SKU does a given Stripe Price id correspond to?
 *  Used by the webhook to map a completed session back to a product kind
 *  without trusting client-supplied metadata alone. Returns null if the price
 *  id matches no configured SKU. */
export function productForPriceId(priceId: string): ProductKind | null {
  for (const p of Object.values(PRODUCTS)) {
    if (process.env[p.priceEnvVar] === priceId) return p.kind;
  }
  return null;
}
```

- [ ] **Step 5: Run the test**

Run: `node --import tsx --test src/lib/billing/products.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/billing/products.ts src/lib/billing/products.test.ts package.json
git commit -m "Two consumer SKUs at \$149 and \$299; drop market pass and subscription

Also widens test:watch-list to cover src/lib/billing, which it never did —
a test added there would have silently never run."
```

Note: `tsc` is now broken in the files that reference the removed SKUs. That is expected and is exactly the work of Tasks 5–9. Do not chase it yet.

---

### Task 2: Pure access resolver — remove the pass path

**Files:**
- Modify: `src/lib/auth/report-entitlements.ts`
- Test: `src/lib/auth/report-entitlements.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type ReportAccessReason = "admin" | "market" | "report" | null`; `interface ReportAccessInputs { isAdmin: boolean; marketEntitled: boolean; hasReportPurchase: boolean }`; `reportAccessReason(i)`; `isReportAccessible(i)`.

This is the security-relevant task: it deletes the input that a market pass or subscription fed. Do it early so no later task can reintroduce a consumer all-markets grant.

- [ ] **Step 1: Rewrite the test**

Replace the whole of `src/lib/auth/report-entitlements.test.ts` with:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reportAccessReason,
  isReportAccessible,
  type ReportAccessInputs,
} from "./report-entitlements";

// v0.33 — THREE ways to reach a report, not four. The `hasActiveMarketPass`
// input is gone with the market-pass and subscription SKUs. It is worth
// stating why in a test: `Subscription` carried no marketId and the server
// resolver filtered only on status and period end, so a single $19/month
// subscription granted every operator in all 44 markets. Removing the input
// removes the possibility.

const NONE: ReportAccessInputs = {
  isAdmin: false,
  marketEntitled: false,
  hasReportPurchase: false,
};

test("no signals → no access", () => {
  assert.equal(reportAccessReason(NONE), null);
  assert.equal(isReportAccessible(NONE), false);
});

test("admin bypass wins over everything", () => {
  assert.equal(reportAccessReason({ ...NONE, isAdmin: true }), "admin");
  assert.equal(
    reportAccessReason({
      isAdmin: true,
      marketEntitled: true,
      hasReportPurchase: true,
    }),
    "admin"
  );
});

test("the existing B2B market entitlement outranks a consumer purchase", () => {
  assert.equal(
    reportAccessReason({ ...NONE, marketEntitled: true, hasReportPurchase: true }),
    "market"
  );
});

test("a per-PM purchase grants access on its own", () => {
  assert.equal(reportAccessReason({ ...NONE, hasReportPurchase: true }), "report");
  assert.equal(isReportAccessible({ ...NONE, hasReportPurchase: true }), true);
});

test("there is no pass reason any more", () => {
  // A stray "pass" would mean a market-wide consumer grant came back.
  const reasons = [
    reportAccessReason(NONE),
    reportAccessReason({ ...NONE, isAdmin: true }),
    reportAccessReason({ ...NONE, marketEntitled: true }),
    reportAccessReason({ ...NONE, hasReportPurchase: true }),
  ];
  assert.deepEqual(reasons, [null, "admin", "market", "report"]);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --import tsx --test src/lib/auth/report-entitlements.test.ts`
Expected: FAIL — `ReportAccessInputs` still requires `hasActiveMarketPass`, so the object literals do not typecheck under tsx's checks, and the reason list still admits `"pass"`.

- [ ] **Step 3: Rewrite the resolver**

Replace the whole of `src/lib/auth/report-entitlements.ts` with:

```ts
// v0.33 — per-report access (pure logic).
//
// The consumer funnel adds ONE new way to reach a scorecard on top of the
// existing B2B market entitlement (market-entitlements.ts). This module is a
// SIBLING of that one, not a replacement: the existing market gate is
// unchanged and always wins first. A viewer can read an operator's report
// when ANY of these holds:
//   1. isAdmin           — internal bypass (same as market gate)
//   2. marketEntitled    — existing B2B path: entitled to the PM's whole
//                          market (org allMarkets or explicit grant)
//   3. hasReportPurchase — holds a ReportEntitlement for THIS pm, bought
//                          outright ($149) or redeemed from a pack credit
//
// There is deliberately no market-wide consumer path. The removed $19/mo
// subscription carried no marketId and was resolved without one, so it
// granted every operator in all 44 markets. Deleting the input is the fix.
//
// Pure (no Prisma / Clerk / server-only) so it unit-tests like
// market-entitlements.ts. The async gatherer lives in
// report-entitlements.server.ts.

export type ReportAccessReason =
  | "admin"
  | "market" // existing B2B market entitlement
  | "report" // per-PM entitlement: direct purchase or redeemed credit
  | null; // no access — show the purchase CTA

export interface ReportAccessInputs {
  isAdmin: boolean;
  /** Result of the EXISTING market entitlement check for the PM's market. */
  marketEntitled: boolean;
  /** A ReportEntitlement row exists for this pm owned by the viewer. */
  hasReportPurchase: boolean;
}

/** Highest-precedence reason the viewer may read this report, or null if they
 *  may not. Precedence mirrors the market gate (admin first) and keeps the
 *  existing market path ahead of the consumer path. */
export function reportAccessReason(i: ReportAccessInputs): ReportAccessReason {
  if (i.isAdmin) return "admin";
  if (i.marketEntitled) return "market";
  if (i.hasReportPurchase) return "report";
  return null;
}

/** Convenience boolean. */
export function isReportAccessible(i: ReportAccessInputs): boolean {
  return reportAccessReason(i) !== null;
}
```

- [ ] **Step 4: Run the test**

Run: `node --import tsx --test src/lib/auth/report-entitlements.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/report-entitlements.ts src/lib/auth/report-entitlements.test.ts
git commit -m "Remove the market-wide consumer access path

hasActiveMarketPass is gone. Subscription carried no marketId and the server
resolver filtered only on status and period end, so one \$19/mo subscription
would have granted all 44 markets."
```

---

### Task 3: Schema and migration — add credits, delete the removed models

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `prisma/migrations/20260826000000_consumer_single_report_billing/migration.sql`
- Test: `src/lib/billing/schema-shape.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: Prisma models `ReportCredit { id, organizationId?, guestEmail?, stripeSessionId, slot, redeemedPmSlug?, redeemedAt?, createdAt }` and an amended `ReportEntitlement { id, pmSlug, organizationId?, guestEmail?, stripeSessionId?, sourceCreditId?, createdAt }`. `prisma.reportCredit` and `prisma.reportEntitlement` become available on the client; `prisma.marketPass` and `prisma.subscription` cease to exist.

**Two design points to preserve:**

*One row per credit, not a counter.* Redemption becomes a guarded row claim with no read-modify-write race, and the ledger is auditable — you can see which credit bought which report.

*`slot` makes minting idempotent.* Three credits share one `stripeSessionId`, so that column cannot be unique. `@@unique([stripeSessionId, slot])` lets `createMany({ skipDuplicates: true })` be safely re-run if Stripe delivers the same event twice concurrently, which the `StripeWebhookEvent` ledger alone does not prevent (it is checked before processing, not atomically with it).

- [ ] **Step 1: Write the failing test**

Create `src/lib/billing/schema-shape.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The billing migration has NEVER been applied to production (verified
// 2026-09-01: all five tables absent, and vercel-build runs only
// `prisma generate && next build` — there is no automatic migrate deploy).
// So it is amended IN PLACE rather than superseded, and schema.prisma and the
// migration SQL must be kept in agreement by hand. This test is that
// agreement, checked at source level; CI's `prisma migrate deploy` against a
// scratch database catches anything structurally invalid.

const SCHEMA = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const MIGRATION = readFileSync(
  join(
    process.cwd(),
    "prisma/migrations/20260826000000_consumer_single_report_billing/migration.sql"
  ),
  "utf8"
);

test("the removed SKUs' tables are gone from both schema and migration", () => {
  for (const model of ["MarketPass", "Subscription"]) {
    assert.ok(
      !new RegExp(`^model ${model} \\{`, "m").test(SCHEMA),
      `model ${model} is still in schema.prisma`
    );
    assert.ok(
      !MIGRATION.includes(`CREATE TABLE "${model}"`),
      `the migration still creates ${model}`
    );
    assert.ok(
      !MIGRATION.includes(`"${model}_`),
      `the migration still has ${model} indexes or constraints`
    );
  }
});

test("ReportCredit exists in both, keyed for idempotent minting", () => {
  assert.match(SCHEMA, /^model ReportCredit \{/m);
  assert.match(SCHEMA, /@@unique\(\[stripeSessionId, slot\]\)/);
  assert.ok(MIGRATION.includes('CREATE TABLE "ReportCredit"'));
  assert.ok(
    MIGRATION.includes('"ReportCredit_stripeSessionId_slot_key"'),
    "minting relies on this unique index to be safely repeatable"
  );
});

test("ReportEntitlement.stripeSessionId is nullable and NOT unique", () => {
  // A three-pack produces up to three entitlements from one session, so a
  // unique constraint on the session id would reject the second redemption.
  // Idempotency comes from the (pmSlug, owner) composite uniques instead.
  const model = SCHEMA.slice(
    SCHEMA.indexOf("model ReportEntitlement {"),
    SCHEMA.indexOf("}", SCHEMA.indexOf("model ReportEntitlement {"))
  );
  assert.match(model, /stripeSessionId\s+String\?/);
  assert.ok(
    !MIGRATION.includes('"ReportEntitlement_stripeSessionId_key"'),
    "the unique index on ReportEntitlement.stripeSessionId must be gone"
  );
  assert.match(model, /sourceCreditId\s+String\?\s+@unique/);
  assert.match(model, /@@unique\(\[pmSlug, organizationId\]\)/);
  assert.match(model, /@@unique\(\[pmSlug, guestEmail\]\)/);
});

test("StripeCustomer and StripeWebhookEvent survive", () => {
  // Both still serve the one-time products: customer linking and event
  // deduplication.
  assert.match(SCHEMA, /^model StripeCustomer \{/m);
  assert.match(SCHEMA, /^model StripeWebhookEvent \{/m);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --import tsx --test src/lib/billing/schema-shape.test.ts`
Expected: FAIL — `model MarketPass` is still present in `schema.prisma`.

- [ ] **Step 3: Edit `prisma/schema.prisma`**

Delete the entire `model MarketPass { ... }` block and the entire `model Subscription { ... }` block.

Remove the two now-dangling back-relations from `model Organization` — search that model for `MarketPass` and `Subscription` and delete those relation lines.

Replace the `model ReportEntitlement { ... }` block with:

```prisma
// Per-PM report purchase ($149) or a redeemed pack credit. Permanent access to
// one operator's scorecard for one owner (an org, or a guest email).
model ReportEntitlement {
  id             String  @id @default(cuid())
  pmSlug         String // → PM.slug (string key, not FK — OrganizationMarketAccess precedent)
  organizationId String?
  guestEmail     String? // lowercased; Lead-style guest key
  // Audit only, and NOT unique: a three-pack yields up to three entitlements
  // from one Checkout Session. Idempotency is carried by the composite uniques
  // below (an owner cannot hold the same report twice) plus StripeWebhookEvent.
  stripeSessionId String?
  // Set when this entitlement came from redeeming a pack credit. Unique, so a
  // credit can be spent at most once.
  sourceCreditId String?  @unique
  createdAt      DateTime @default(now())

  organization Organization? @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  // NULLs are distinct in Postgres, so these only constrain rows that actually
  // carry the respective owner — a guest row (org null) and an org row
  // (guestEmail null) never collide, and duplicate grants to the SAME owner
  // are prevented.
  @@unique([pmSlug, organizationId])
  @@unique([pmSlug, guestEmail])
  @@index([guestEmail])
  @@index([organizationId])
}

// Unredeemed report purchases. A three-pack mints three rows; a single report
// grants its entitlement directly and mints none.
//
// One row per credit rather than a counter column: redemption is then a
// guarded row claim with no read-modify-write race, and the ledger shows which
// credit bought which report.
model ReportCredit {
  id             String  @id @default(cuid())
  organizationId String?
  guestEmail     String? // lowercased, same guest key as ReportEntitlement
  // The pack purchase. NOT unique — three rows share it. Paired with `slot` it
  // makes minting safely repeatable under concurrent webhook delivery.
  stripeSessionId String
  slot            Int
  redeemedPmSlug  String? // null while unredeemed
  redeemedAt      DateTime?
  createdAt       DateTime  @default(now())

  organization Organization? @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([stripeSessionId, slot])
  @@index([organizationId, redeemedAt])
  @@index([guestEmail, redeemedAt])
}
```

Add the matching back-relation inside `model Organization`:

```prisma
  reportCredits ReportCredit[]
```

- [ ] **Step 4: Amend the migration SQL**

Replace the whole of `prisma/migrations/20260826000000_consumer_single_report_billing/migration.sql` with:

```sql
-- CreateTable
CREATE TABLE "StripeCustomer" (
    "id" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "organizationId" TEXT,
    "userId" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StripeCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportEntitlement" (
    "id" TEXT NOT NULL,
    "pmSlug" TEXT NOT NULL,
    "organizationId" TEXT,
    "guestEmail" TEXT,
    "stripeSessionId" TEXT,
    "sourceCreditId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportCredit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "guestEmail" TEXT,
    "stripeSessionId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "redeemedPmSlug" TEXT,
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeWebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StripeCustomer_stripeCustomerId_key" ON "StripeCustomer"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "StripeCustomer_organizationId_key" ON "StripeCustomer"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "StripeCustomer_userId_key" ON "StripeCustomer"("userId");

-- CreateIndex
CREATE INDEX "StripeCustomer_email_idx" ON "StripeCustomer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ReportEntitlement_sourceCreditId_key" ON "ReportEntitlement"("sourceCreditId");

-- CreateIndex
CREATE INDEX "ReportEntitlement_guestEmail_idx" ON "ReportEntitlement"("guestEmail");

-- CreateIndex
CREATE INDEX "ReportEntitlement_organizationId_idx" ON "ReportEntitlement"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportEntitlement_pmSlug_organizationId_key" ON "ReportEntitlement"("pmSlug", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportEntitlement_pmSlug_guestEmail_key" ON "ReportEntitlement"("pmSlug", "guestEmail");

-- CreateIndex
CREATE UNIQUE INDEX "ReportCredit_stripeSessionId_slot_key" ON "ReportCredit"("stripeSessionId", "slot");

-- CreateIndex
CREATE INDEX "ReportCredit_organizationId_redeemedAt_idx" ON "ReportCredit"("organizationId", "redeemedAt");

-- CreateIndex
CREATE INDEX "ReportCredit_guestEmail_redeemedAt_idx" ON "ReportCredit"("guestEmail", "redeemedAt");

-- AddForeignKey
ALTER TABLE "StripeCustomer" ADD CONSTRAINT "StripeCustomer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportEntitlement" ADD CONSTRAINT "ReportEntitlement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportCredit" ADD CONSTRAINT "ReportCredit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 5: Regenerate the client and confirm schema/SQL agree**

```bash
npx prisma generate
npx prisma validate
node --import tsx --test src/lib/billing/schema-shape.test.ts
```

Expected: `prisma validate` prints that the schema is valid; the test PASSES, 4 tests.

`prisma generate` also clears the four pre-existing `tsc` errors about `reportEntitlement` / `marketPass` / `subscription` / `stripeCustomer` not existing on `PrismaClient` — those were a stale generated client, not real defects.

- [ ] **Step 6: Prove the migration actually applies**

The migration is edited by hand, so validate it against a real Postgres exactly as CI does:

```bash
npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "$SHADOW_DATABASE_URL" --exit-code
```

Expected: exit code 0 and "No difference detected" — the hand-written SQL produces exactly the schema. A non-zero exit means the SQL and the schema disagree; fix the SQL, not the schema.

If `SHADOW_DATABASE_URL` is not set locally, skip this step and rely on CI's `prisma migrate deploy` job, which does the same check against a scratch database. **Do not** run `prisma migrate dev` — it would create a second migration instead of amending this one.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260826000000_consumer_single_report_billing/migration.sql src/lib/billing/schema-shape.test.ts
git commit -m "Add ReportCredit, delete MarketPass and Subscription

The billing migration has never been applied to production, so it is amended
in place rather than superseded — no expand/contract, because there is nothing
to contract.

ReportEntitlement.stripeSessionId loses its unique constraint: a three-pack
yields up to three entitlements from one session. Idempotency moves to the
(pmSlug, owner) composite uniques, which are the semantically correct guard.

ReportCredit carries a slot so (stripeSessionId, slot) is unique, making
createMany+skipDuplicates safely repeatable under concurrent delivery."
```

---

### Task 4: Credit minting and redemption

**Files:**
- Create: `src/lib/billing/credits.ts`
- Create: `src/lib/billing/credits.server.ts`
- Create: `src/lib/billing/credits.test.ts`
- Create: `tests/database/report-credits.test.ts`
- Modify: `package.json` (widen `test:seed-atomicity` glob)

**Interfaces:**
- Consumes: `creditsFor(kind)` from Task 1; `prisma.reportCredit` / `prisma.reportEntitlement` from Task 3.
- Produces:
  - `interface CreditOwner { organizationId: string | null; guestEmail: string | null }`
  - `ownerWhere(owner: CreditOwner): { organizationId: string } | { guestEmail: string }` — throws on an empty or ambiguous owner
  - `mintCredits(args: { owner: CreditOwner; stripeSessionId: string; count: number }): Promise<number>` — returns rows created
  - `redeemCredit(owner: CreditOwner, pmSlug: string): Promise<RedeemResult>` where `RedeemResult = { ok: true; pmSlug: string } | { ok: false; reason: "no_credits" | "already_owned" }`
  - `countUnredeemed(owner: CreditOwner): Promise<number>`

**Two things about the test runner you must get right, or this task's test cannot run at all:**

*The glob.* `test:seed-atomicity` names one file. A new file in `tests/database/` would never run in CI.

*The `react-server` condition.* `credits.server.ts` carries `import "server-only"` (the convention every `.server.ts` in this repo follows, to stop a client component pulling Prisma into the browser bundle). That package resolves to a module whose entire body is `throw new Error("This module cannot be imported from a Client Component module...")` under normal Node conditions, and to an empty module under the `react-server` condition. So a `node:test` file that imports it dies on import. Verified: without the flag the suite fails with that error and 0 tests pass; with it, the import succeeds.

`tests/database/` contains no React, so scoping the flag to this script is safe. Do **not** "fix" this by dropping `server-only` from `credits.server.ts` — that guard is load-bearing.

- [ ] **Step 1: Widen the glob and add the condition**

In `package.json`:

```json
"test:seed-atomicity": "node --conditions=react-server --import tsx --test tests/database/*.test.ts",
```

- [ ] **Step 2: Write the failing pure test**

Create `src/lib/billing/credits.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { ownerWhere, type CreditOwner } from "./credits";

// Ownership is guest-OR-org, never both and never neither. Getting this wrong
// is how you build a query that matches on a NULL column and hands one
// buyer's credits to another.

test("an org owner keys on organizationId alone", () => {
  const o: CreditOwner = { organizationId: "org_1", guestEmail: null };
  assert.deepEqual(ownerWhere(o), { organizationId: "org_1" });
});

test("a guest owner keys on guestEmail alone", () => {
  const o: CreditOwner = { organizationId: null, guestEmail: "a@b.com" };
  assert.deepEqual(ownerWhere(o), { guestEmail: "a@b.com" });
});

test("the org wins when both are somehow present", () => {
  // The checkout route sets guestEmail to null whenever an org is known, so
  // this should not occur — but a query that filtered on both would match
  // nothing at all, which fails silently. Prefer the org, deterministically.
  const o: CreditOwner = { organizationId: "org_1", guestEmail: "a@b.com" };
  assert.deepEqual(ownerWhere(o), { organizationId: "org_1" });
});

test("an ownerless credit query throws rather than matching everything", () => {
  assert.throws(
    () => ownerWhere({ organizationId: null, guestEmail: null }),
    /owner/i
  );
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `node --import tsx --test src/lib/billing/credits.test.ts`
Expected: FAIL — `Cannot find module './credits'`.

- [ ] **Step 4: Write the pure module**

Create `src/lib/billing/credits.ts`:

```ts
// v0.33 — Report credits: pure helpers.
//
// A credit is an unredeemed report purchase. The three-pack ($299) mints
// three; the single report ($149) grants its entitlement directly and mints
// none.
//
// WHY CREDITS AT ALL. At the moment of purchase the buyer usually knows ONE
// operator name — they arrived by searching it. The other operators worth
// checking are revealed afterwards, by the scorecard's peer table. So a pack
// cannot grant three entitlements at checkout; it has to grant something
// redeemable later.

/** Who owns a credit or entitlement: an org, or a guest email. Exactly one. */
export interface CreditOwner {
  organizationId: string | null;
  guestEmail: string | null;
}

/** Prisma `where` fragment selecting rows owned by this buyer.
 *
 *  Filters on exactly ONE column. NULLs are distinct in Postgres, so a
 *  fragment naming both columns would match no rows at all — a silent
 *  no-access bug rather than a loud one. Throws when neither is set, because
 *  the alternative is a query that matches every row in the table. */
export function ownerWhere(
  owner: CreditOwner
): { organizationId: string } | { guestEmail: string } {
  if (owner.organizationId) return { organizationId: owner.organizationId };
  if (owner.guestEmail) return { guestEmail: owner.guestEmail };
  throw new Error("credit owner has neither organizationId nor guestEmail");
}
```

- [ ] **Step 5: Run the pure test**

Run: `node --import tsx --test src/lib/billing/credits.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Write the failing database test**

Create `tests/database/report-credits.test.ts`:

```ts
import test from "node:test";
import { strict as assert } from "node:assert";
import { PrismaClient } from "@prisma/client";
// RELATIVE imports, matching tests/database/seed-atomicity.test.ts. The `@/`
// alias is a tsconfig path that this runner does not resolve from here.
import {
  mintCredits,
  redeemCredit,
  countUnredeemed,
} from "../../src/lib/billing/credits.server";
import type { CreditOwner } from "../../src/lib/billing/credits";

// Credits are money. These run against a real database because every property
// worth guaranteeing here — idempotent minting, no double-spend, no credit
// burned on a report the buyer already owns — is a property of the constraints
// and the transaction, not of the TypeScript.

// Same database contract as seed-atomicity.test.ts: CI sets
// SEED_TEST_DATABASE_URL (and DATABASE_URL) against a disposable Postgres and
// runs `prisma migrate deploy` first. Locally, skip rather than scribble on
// whatever DATABASE_URL happens to point at — which may be production.
const DB_URL =
  process.env.SEED_TEST_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();
const IN_CI = Boolean(
  process.env.CI && !["false", "0"].includes(process.env.CI.trim().toLowerCase())
);
if (IN_CI && !DB_URL) {
  throw new Error(
    "SEED_TEST_DATABASE_URL is required in CI; refusing to skip the credit tests"
  );
}

const prisma = new PrismaClient(
  DB_URL ? { datasources: { db: { url: DB_URL } } } : undefined
);

/** Unique per run so parallel or repeated runs never collide. */
function guest(tag: string): CreditOwner {
  return {
    organizationId: null,
    guestEmail: `credits-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.invalid`,
  };
}

async function cleanup(owner: CreditOwner) {
  const email = owner.guestEmail!;
  await prisma.reportEntitlement.deleteMany({ where: { guestEmail: email } });
  await prisma.reportCredit.deleteMany({ where: { guestEmail: email } });
}

test("minting a pack creates exactly `count` credits", { skip: !DB_URL }, async (t) => {
  const owner = guest("mint");
  t.after(() => cleanup(owner));

  const created = await mintCredits({
    owner,
    stripeSessionId: `cs_mint_${owner.guestEmail}`,
    count: 3,
  });
  assert.equal(created, 3);
  assert.equal(await countUnredeemed(owner), 3);
});

test("minting the same session twice is a no-op", { skip: !DB_URL }, async (t) => {
  // Stripe can deliver one event more than once, and the StripeWebhookEvent
  // ledger is checked BEFORE processing rather than atomically with it — so
  // two concurrent deliveries can both get past it. The
  // (stripeSessionId, slot) unique is what actually prevents six credits.
  const owner = guest("dupe");
  t.after(() => cleanup(owner));
  const sessionId = `cs_dupe_${owner.guestEmail}`;

  const first = await mintCredits({ owner, stripeSessionId: sessionId, count: 3 });
  const second = await mintCredits({ owner, stripeSessionId: sessionId, count: 3 });

  assert.equal(first, 3);
  assert.equal(second, 0, "the second mint must create nothing");
  assert.equal(await countUnredeemed(owner), 3);
});

test("concurrent mints of one session still yield `count` credits", { skip: !DB_URL }, async (t) => {
  const owner = guest("race");
  t.after(() => cleanup(owner));
  const sessionId = `cs_race_${owner.guestEmail}`;

  await Promise.all([
    mintCredits({ owner, stripeSessionId: sessionId, count: 3 }),
    mintCredits({ owner, stripeSessionId: sessionId, count: 3 }),
  ]);

  assert.equal(await countUnredeemed(owner), 3);
});

test("redeeming spends one credit and grants the entitlement", { skip: !DB_URL }, async (t) => {
  const owner = guest("redeem");
  t.after(() => cleanup(owner));
  await mintCredits({ owner, stripeSessionId: `cs_r_${owner.guestEmail}`, count: 3 });

  const res = await redeemCredit(owner, "acme-property-management-denver-co");
  assert.deepEqual(res, { ok: true, pmSlug: "acme-property-management-denver-co" });
  assert.equal(await countUnredeemed(owner), 2);

  const ent = await prisma.reportEntitlement.findFirst({
    where: { guestEmail: owner.guestEmail!, pmSlug: "acme-property-management-denver-co" },
    select: { sourceCreditId: true },
  });
  assert.ok(ent, "an entitlement must exist");
  assert.ok(ent.sourceCreditId, "it must record which credit paid for it");
});

test("redeeming with no credits fails without granting anything", { skip: !DB_URL }, async (t) => {
  const owner = guest("empty");
  t.after(() => cleanup(owner));

  const res = await redeemCredit(owner, "some-operator-denver-co");
  assert.deepEqual(res, { ok: false, reason: "no_credits" });
  const ent = await prisma.reportEntitlement.count({
    where: { guestEmail: owner.guestEmail! },
  });
  assert.equal(ent, 0);
});

test("redeeming a report you already own does NOT burn a credit", { skip: !DB_URL }, async (t) => {
  // Otherwise a buyer clicking twice pays twice for the same report.
  const owner = guest("owned");
  t.after(() => cleanup(owner));
  await mintCredits({ owner, stripeSessionId: `cs_o_${owner.guestEmail}`, count: 3 });
  const slug = "dup-operator-denver-co";

  assert.deepEqual(await redeemCredit(owner, slug), { ok: true, pmSlug: slug });
  assert.equal(await countUnredeemed(owner), 2);

  assert.deepEqual(await redeemCredit(owner, slug), {
    ok: false,
    reason: "already_owned",
  });
  assert.equal(await countUnredeemed(owner), 2, "no second credit may be spent");
});

test("three concurrent redemptions of two credits grant exactly two reports", { skip: !DB_URL }, async (t) => {
  // The guarded row claim is the whole point: only one transaction can move a
  // given credit out of the unredeemed state.
  const owner = guest("concurrent");
  t.after(() => cleanup(owner));
  await mintCredits({ owner, stripeSessionId: `cs_c_${owner.guestEmail}`, count: 2 });

  const results = await Promise.all([
    redeemCredit(owner, "op-a-denver-co"),
    redeemCredit(owner, "op-b-denver-co"),
    redeemCredit(owner, "op-c-denver-co"),
  ]);

  const granted = results.filter((r) => r.ok).length;
  assert.equal(granted, 2, `expected 2 grants, got ${granted}`);
  assert.equal(await countUnredeemed(owner), 0);
  assert.equal(
    await prisma.reportEntitlement.count({ where: { guestEmail: owner.guestEmail! } }),
    2
  );
});

test.after(async () => {
  await prisma.$disconnect();
});
```

- [ ] **Step 7: Run it and watch it fail**

Run: `node --conditions=react-server --import tsx --test tests/database/report-credits.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/billing/credits.server'`.

- [ ] **Step 8: Write the server module**

Create `src/lib/billing/credits.server.ts`:

```ts
// v0.33 — Report credits: the only writers of ReportCredit.
//
// Minting is idempotent via the (stripeSessionId, slot) unique index, because
// Stripe can deliver one event twice and the StripeWebhookEvent ledger is
// checked before processing rather than atomically with it.
//
// Redemption is a guarded row claim inside a transaction: the UPDATE names
// `redeemedAt: null` in its WHERE, so only one concurrent caller can move a
// given credit out of the unredeemed state. Claiming and granting share the
// transaction, so a credit is never spent without an entitlement appearing.

import "server-only";
import { prisma } from "@/lib/prisma";
import { ownerWhere, type CreditOwner } from "./credits";

export type RedeemResult =
  | { ok: true; pmSlug: string }
  | { ok: false; reason: "no_credits" | "already_owned" };

/** Create `count` unredeemed credits for one completed pack purchase.
 *  Returns how many rows were created — 0 when this session already minted. */
export async function mintCredits(args: {
  owner: CreditOwner;
  stripeSessionId: string;
  count: number;
}): Promise<number> {
  const { owner, stripeSessionId, count } = args;
  ownerWhere(owner); // validate: throws on an ownerless mint
  if (count <= 0) return 0;

  const res = await prisma.reportCredit.createMany({
    data: Array.from({ length: count }, (_, slot) => ({
      organizationId: owner.organizationId,
      guestEmail: owner.guestEmail,
      stripeSessionId,
      slot,
    })),
    // The (stripeSessionId, slot) unique makes a repeat delivery a no-op
    // rather than a duplicate grant.
    skipDuplicates: true,
  });
  return res.count;
}

/** Unredeemed credits this buyer holds. */
export async function countUnredeemed(owner: CreditOwner): Promise<number> {
  return prisma.reportCredit.count({
    where: { ...ownerWhere(owner), redeemedAt: null },
  });
}

/** Spend one credit to grant `pmSlug` to this buyer. */
export async function redeemCredit(
  owner: CreditOwner,
  pmSlug: string
): Promise<RedeemResult> {
  const where = ownerWhere(owner);

  // Never burn a credit on something they already hold — a double-clicked
  // redeem button would otherwise cost the buyer a report.
  const existing = await prisma.reportEntitlement.findFirst({
    where: { pmSlug, ...where },
    select: { id: true },
  });
  if (existing) return { ok: false, reason: "already_owned" };

  return prisma.$transaction(async (tx) => {
    const credit = await tx.reportCredit.findFirst({
      where: { ...where, redeemedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!credit) return { ok: false, reason: "no_credits" } as const;

    // The guard: only one transaction can satisfy `redeemedAt: null`.
    const claimed = await tx.reportCredit.updateMany({
      where: { id: credit.id, redeemedAt: null },
      data: { redeemedPmSlug: pmSlug, redeemedAt: new Date() },
    });
    if (claimed.count !== 1) return { ok: false, reason: "no_credits" } as const;

    await tx.reportEntitlement.create({
      data: {
        pmSlug,
        organizationId: owner.organizationId,
        guestEmail: owner.guestEmail,
        sourceCreditId: credit.id,
      },
    });
    return { ok: true, pmSlug } as const;
  });
}
```

- [ ] **Step 9: Run the database test**

Run: `SEED_TEST_DATABASE_URL=<a scratch database url> node --conditions=react-server --import tsx --test tests/database/report-credits.test.ts`
Expected: PASS, 7 tests. The database must have this migration applied (`npx prisma migrate deploy` against it first). With no URL set the tests skip — which is correct locally and a hard error in CI.

If the concurrency test fails intermittently with a Prisma write conflict, that is the guard working under serialisation — catch `P2034` around the transaction and return `{ ok: false, reason: "no_credits" }` rather than weakening the guard.

- [ ] **Step 10: Commit**

```bash
git add src/lib/billing/credits.ts src/lib/billing/credits.server.ts src/lib/billing/credits.test.ts tests/database/report-credits.test.ts package.json
git commit -m "Report credits: idempotent minting, guarded redemption

Also widens test:seed-atomicity to a glob — it named a single file, so a new
tests/database file would never have run in CI."
```

---

### Task 5: Server access resolver reads entitlements only

**Files:**
- Modify: `src/lib/auth/report-entitlements.server.ts`
- Modify: `src/lib/billing/verify-session.ts`

**Interfaces:**
- Consumes: `reportAccessReason` with the three-field `ReportAccessInputs` (Task 2).
- Produces: `resolveReportAccess(pmSlug, marketId, opts?): Promise<{ accessible: boolean; reason: ReportAccessReason }>` — signature unchanged, so no caller needs editing; `sessionGrantsReport(sessionId, slug): Promise<boolean>` — **`marketId` parameter removed**.

- [ ] **Step 1: Delete the pass and subscription queries**

In `src/lib/auth/report-entitlements.server.ts`, replace the block that begins `const now = new Date();` and ends with the `return { accessible: ..., reason };` at the end of the function with:

```ts
  const purchase = await prisma.reportEntitlement.findFirst({
    where: { pmSlug, OR: owners },
    select: { id: true },
  });

  const reason = reportAccessReason({
    isAdmin: false,
    marketEntitled: false,
    hasReportPurchase: Boolean(purchase),
  });
  return { accessible: reason !== null, reason };
```

Then fix the earlier short-circuit, which also passes the removed field. Replace:

```ts
    const reason = reportAccessReason({
      isAdmin,
      marketEntitled,
      hasReportPurchase: false,
      hasActiveMarketPass: false,
    });
```

with:

```ts
    const reason = reportAccessReason({
      isAdmin,
      marketEntitled,
      hasReportPurchase: false,
    });
```

Update the module's header comment: the doc block lists four access paths and names `MarketPass` / `Subscription`. Reduce it to three and state why the fourth is gone — `Subscription` carried no `marketId`, so the query granted every market.

- [ ] **Step 2: Narrow `sessionGrantsReport`**

Replace the whole of `src/lib/billing/verify-session.ts` with:

```ts
// v0.33 — Post-checkout session verification. Shared by the report page and
// the report PDF route so a buyer sees / downloads their report immediately on
// return from Stripe, even before the webhook has written the durable
// entitlement. Defensive: any mismatch returns false and the caller falls
// through to the normal DB-backed gate.

import "server-only";
import { getStripe, stripeConfigured } from "@/lib/stripe";

/** True iff `sessionId` is a paid Checkout Session that covers `slug`.
 *
 *  Both SKUs stamp the operator they were bought for into session metadata:
 *  `single_report` always, `three_pack` when it was bought from a report page.
 *  A pack bought from the landing page carries no pmSlug and grants nothing
 *  here — the buyer redeems a credit instead, which writes the entitlement the
 *  normal gate reads. */
export async function sessionGrantsReport(
  sessionId: string,
  slug: string
): Promise<boolean> {
  if (!stripeConfigured()) return false;
  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") return false;
    const md = session.metadata ?? {};
    if (md.kind !== "single_report" && md.kind !== "three_pack") return false;
    return Boolean(md.pmSlug) && md.pmSlug === slug;
  } catch {
    return false;
  }
}
```

- [ ] **Step 3: Fix the callers tsc reports**

Run: `npx prisma generate && npx tsc --noEmit 2>&1 | grep -E "verify-session|sessionGrantsReport"`

For each reported call site, drop the third argument. Expected sites: `src/app/report/r/[slug]/page.tsx` and the report PDF route. Change `sessionGrantsReport(sessionId, slug, marketId)` to `sessionGrantsReport(sessionId, slug)`.

- [ ] **Step 4: Confirm the resolver tests still pass**

Run: `npm run test:watch-list 2>&1 | tail -5`
Expected: PASS with no failures. (`tsc` still reports errors in the webhook, checkout route, account page and teaser — those are Tasks 6–9.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/report-entitlements.server.ts src/lib/billing/verify-session.ts src/app/report/r/
git commit -m "Resolve report access from entitlements only

Deletes the MarketPass and Subscription queries. sessionGrantsReport loses its
marketId parameter — there is no market-scoped consumer grant to verify."
```

---

### Task 6: Checkout route for two SKUs

**Files:**
- Modify: `src/app/api/stripe/checkout/route.ts`

**Interfaces:**
- Consumes: `PRODUCTS`, `resolvePriceId` (Task 1).
- Produces: `POST /api/stripe/checkout` accepting `{ kind: "single_report" | "three_pack", pmSlug?, partner? }` and returning `{ url, id }`. `marketId` is no longer accepted. `pmSlug` is **required for `single_report`** and **optional for `three_pack`**.

- [ ] **Step 1: Replace the body schema and target resolution**

In `src/app/api/stripe/checkout/route.ts`, replace the `BodySchema` with:

```ts
const BodySchema = z.object({
  kind: z.enum(["single_report", "three_pack"]),
  // Required for single_report. Optional for three_pack: a pack bought from
  // the landing page has no operator in context, and its credits are redeemed
  // later. When present on a pack, the webhook redeems one credit immediately
  // for this operator.
  pmSlug: z.string().min(1).optional(),
  // Partner attribution (e.g. "biggerpockets") — carried through to analytics
  // so we can rev-share and measure by channel.
  partner: z.string().max(64).optional(),
});
```

Replace the whole target-resolution block (from `const product = PRODUCTS[parsed.kind];` through the end of the `else { ... }` branch that resolves a market) with:

```ts
  const product = PRODUCTS[parsed.kind];

  // Validate the operator when one is supplied, so we never create a Checkout
  // Session against a bogus slug.
  let pmSlug = "";
  let marketId = "";
  let displayName = "";
  if (parsed.pmSlug) {
    const pm = await prisma.pM.findUnique({
      where: { slug: parsed.pmSlug },
      select: { slug: true, name: true, marketId: true },
    });
    if (!pm) {
      return Response.json({ error: "Operator not found" }, { status: 404 });
    }
    pmSlug = pm.slug;
    marketId = pm.marketId;
    displayName = pm.name;
  } else if (parsed.kind === "single_report") {
    // A single report is *about* an operator; without one there is nothing to
    // sell. A pack is fine without one.
    return Response.json({ error: "pmSlug required" }, { status: 400 });
  }
```

`marketId` is kept only so it can be stamped into metadata for analytics; nothing grants on it.

Incidental defect fixed here: the old market-target branch redirected to `/report/market/${marketId}` on both success and cancel, and **that route does not exist** (`src/app/report/` contains only `page.tsx`, `account/` and `r/[slug]/`). Every market-pass purchase would have landed on a 404. Another symptom of a layer that was never exercised.

- [ ] **Step 2: Replace the redirect paths and session params**

Replace the `successPath` / `cancelPath` block with:

```ts
  const base = baseUrl(req);
  // With an operator in context, return to its report. Without one (a pack
  // bought from the landing page), return to the account wallet where the
  // buyer redeems credits.
  const successPath = pmSlug
    ? `/report/r/${pmSlug}?session_id={CHECKOUT_SESSION_ID}`
    : `/report/account?session_id={CHECKOUT_SESSION_ID}`;
  const cancelPath = pmSlug ? `/report/r/${pmSlug}` : `/report`;
```

Replace the `params` construction and the `subscription_data` branch with:

```ts
    const params: Stripe.Checkout.SessionCreateParams = {
      mode: product.stripeMode, // always "payment" — no recurring SKU
      line_items: [{ price: resolvePriceId(parsed.kind), quantity: 1 }],
      success_url: `${base}${successPath}`,
      cancel_url: `${base}${cancelPath}`,
      metadata,
      // Let Checkout collect the email for guests; reused as the entitlement
      // key in the webhook.
      billing_address_collection: "auto",
      allow_promotion_codes: true,
      payment_intent_data: { metadata },
    };
```

- [ ] **Step 3: Typecheck this file**

Run: `npx tsc --noEmit 2>&1 | grep "api/stripe/checkout"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/stripe/checkout/route.ts
git commit -m "Checkout: two payment-mode SKUs, pmSlug optional for the pack

A pack bought from the landing page has no operator in context — the buyer has
not met the peer table yet — so it returns to the account wallet to redeem."
```

---

### Task 7: Webhook grants entitlements and mints credits

**Files:**
- Modify: `src/app/api/stripe/webhook/route.ts`
- Modify: `src/lib/analytics-server.ts`

**Interfaces:**
- Consumes: `creditsFor` (Task 1); `mintCredits`, `redeemCredit` (Task 4); `CreditOwner` (Task 4).
- Produces: `POST /api/stripe/webhook` handling only `checkout.session.completed`. Analytics gains `"pack_purchased"` and loses `"market_pass_purchased"`, `"subscription_started"`, `"subscription_canceled"`.

- [ ] **Step 1: Update the analytics event union**

In `src/lib/analytics-server.ts`, in the `ServerEventName` union, replace:

```ts
  | "report_purchased"
  | "market_pass_purchased"
  | "subscription_started"
  | "subscription_canceled";
```

with:

```ts
  | "report_purchased"
  | "pack_purchased";
```

- [ ] **Step 2: Delete the subscription handlers**

In `src/app/api/stripe/webhook/route.ts`:

- Delete the whole `handleSubscriptionUpsert` function.
- Delete the whole `handleSubscriptionCanceled` function.
- Delete the `subPeriodEnd` helper (only those used it).
- In `dispatch`, delete the three `customer.subscription.*` cases so the switch keeps only `checkout.session.completed` and `default`.

- [ ] **Step 3: Replace the grant logic**

In `handleCheckoutCompleted`, replace the block from `let event: ServerEventName | null = null;` through the end of the `else if (kind === "subscription") { ... }` branch with:

```ts
  const owner: CreditOwner = { organizationId, guestEmail };
  const pmSlug = session.metadata?.pmSlug || null;
  let event: ServerEventName;

  if (kind === "single_report") {
    if (!pmSlug) throw new Error(`single_report session ${session.id} missing pmSlug`);
    // createMany + skipDuplicates rather than upsert: the (pmSlug, owner)
    // composite uniques make this idempotent without branching on which
    // owner column is set, and stripeSessionId is no longer unique.
    await prisma.reportEntitlement.createMany({
      data: [{ pmSlug, organizationId, guestEmail, stripeSessionId: session.id }],
      skipDuplicates: true,
    });
    event = "report_purchased";
  } else {
    // three_pack — mint the credits, then redeem one immediately if the buyer
    // came from an operator's report page. Bought from the landing page there
    // is no operator yet and all three stay unredeemed.
    await mintCredits({
      owner,
      stripeSessionId: session.id,
      count: creditsFor(kind),
    });
    if (pmSlug) {
      // Not fatal if this fails — the credits exist and the buyer can redeem
      // from the account wallet.
      const res = await redeemCredit(owner, pmSlug);
      if (!res.ok) {
        console.warn(
          `[stripe/webhook] pack ${session.id}: immediate redeem of ${pmSlug} returned ${res.reason}`
        );
      }
    }
    event = "pack_purchased";
  }
```

- [ ] **Step 4: Simplify the delivery-email block**

Replace the email block (from `const recipient = ...` through the `sendReportPurchaseEmail({ ... });` call) with:

```ts
  // Deliver the buyer's access links by email (best-effort — the grant above
  // is the source of truth; a failed send never blocks the webhook). Stripe
  // always collects an email at Checkout, so `email` is present for guest and
  // org buyers alike.
  const recipient = (email ?? guestEmail) || null;
  if (recipient) {
    const pm = pmSlug
      ? await prisma.pM.findUnique({ where: { slug: pmSlug }, select: { name: true } })
      : null;
    await sendReportPurchaseEmail({
      email: recipient,
      kind,
      pmSlug,
      pmName: pm?.name ?? null,
      creditsRemaining:
        kind === "three_pack" ? creditsFor(kind) - (pmSlug ? 1 : 0) : 0,
    });
  }
```

- [ ] **Step 5: Fix the imports and the analytics payload**

At the top of the file, remove the `MARKET_PASS_DAYS` import and add:

```ts
import { creditsFor } from "@/lib/billing/products";
import { mintCredits, redeemCredit } from "@/lib/billing/credits.server";
import type { CreditOwner } from "@/lib/billing/credits";
```

In the `captureServerEvent` call at the end, replace the `properties` object with:

```ts
      properties: {
        pmSlug,
        partner,
        buyer: organizationId ? "org" : "guest",
        credits: creditsFor(kind),
      },
```

and change the guard `if (event) {` to an unconditional block, since `event` is now always set.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "stripe/webhook|analytics-server"`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/stripe/webhook/route.ts src/lib/analytics-server.ts
git commit -m "Webhook: grant entitlements, mint pack credits, drop subscriptions

A pack bought from a report page redeems one credit immediately. A failed
immediate redeem is logged, not thrown — the credits exist and the wallet can
redeem them."
```

---

### Task 8: Purchase email for two SKUs

**Files:**
- Modify: `src/lib/report/delivery.ts`

**Interfaces:**
- Consumes: `ProductKind` (Task 1).
- Produces: `sendReportPurchaseEmail(args: { email: string; kind: ProductKind; pmSlug: string | null; pmName: string | null; creditsRemaining: number }): Promise<void>` — `marketName` removed, `creditsRemaining` added.

- [ ] **Step 1: Update the args interface**

In `src/lib/report/delivery.ts`, replace `marketName` in `ReportDeliveryArgs` with:

```ts
  /** Unredeemed credits left after this purchase. 0 for a single report. */
  creditsRemaining: number;
```

- [ ] **Step 2: Replace the copy branches**

Replace the `if (args.kind === "single_report" ...) / else if (args.kind === "subscription") / else` chain with:

```ts
    if (args.kind === "single_report" && args.pmSlug) {
      subject = `Your report on ${args.pmName ?? "your property manager"}`;
      heading = "Your report is ready";
      ctaLabel = "Read the report";
      ctaPath = `/report/r/${args.pmSlug}`;
    } else if (args.pmSlug) {
      // Pack bought from a report page: one redeemed, the rest waiting.
      subject = `Your report on ${args.pmName ?? "your property manager"}, plus ${args.creditsRemaining} to use`;
      heading = "Your report is ready";
      ctaLabel = "Read the report";
      ctaPath = `/report/r/${args.pmSlug}`;
    } else {
      // Pack bought from the landing page: nothing redeemed yet.
      subject = `Your ${args.creditsRemaining} property manager reports`;
      heading = `You have ${args.creditsRemaining} reports to use`;
      ctaLabel = "Choose your first report";
      ctaPath = "/report/account";
    }
```

Keep the existing token-signing and link-building code below unchanged — it already appends a signed magic-link token so a guest can return.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "report/delivery"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/lib/report/delivery.ts
git commit -m "Purchase email covers both SKUs and states credits remaining"
```

---

### Task 9: Account page becomes the buyer's wallet

**Files:**
- Rewrite: `src/app/report/account/page.tsx`
- Create: `src/app/report/account/RedeemCreditForm.tsx`
- Create: `src/app/api/report/redeem/route.ts`
- Delete: `src/components/report/ManageSubscriptionButton.tsx`
- Delete: `src/app/api/report/portal/route.ts`
- Delete: `src/lib/billing/customer.server.ts`

**Interfaces:**
- Consumes: `countUnredeemed`, `redeemCredit` (Task 4); `verifyReportAccessToken` from `src/lib/report/access-token.ts`.
- Produces: `POST /api/report/redeem` accepting `{ pmSlug, token? }` and returning `{ ok: true } | { ok: false, reason }`.

There is no subscription to manage any more, so the Stripe Billing Portal route and its button go. What replaces them is the thing the pack actually needs: a list of reports owned, a count of credits left, and a way to spend one.

- [ ] **Step 1: Delete the subscription surfaces**

```bash
git rm src/components/report/ManageSubscriptionButton.tsx src/app/api/report/portal/route.ts src/lib/billing/customer.server.ts
```

- [ ] **Step 2: Add the redeem route**

Create `src/app/api/report/redeem/route.ts`:

```ts
// v0.33 — Spend one report credit on an operator.
//
// PUBLIC (guests own credits too), but ownership is never taken from the
// request body: a guest is identified by a SIGNED magic-link token, a
// workspace user by their session. An unsigned email would let anyone spend
// anyone's credits.

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { verifyReportAccessToken } from "@/lib/report/access-token";
import { redeemCredit } from "@/lib/billing/credits.server";
import type { CreditOwner } from "@/lib/billing/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  pmSlug: z.string().min(1),
  token: z.string().optional(),
});

export async function POST(req: Request) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  const { organizationId } = await getActiveOrgContext();
  const guestEmail = organizationId ? null : verifyReportAccessToken(body.token);
  if (!organizationId && !guestEmail) {
    return Response.json({ ok: false, reason: "unidentified" }, { status: 401 });
  }

  const pm = await prisma.pM.findUnique({
    where: { slug: body.pmSlug },
    select: { slug: true },
  });
  if (!pm) {
    return Response.json({ ok: false, reason: "not_found" }, { status: 404 });
  }

  const owner: CreditOwner = { organizationId, guestEmail };
  const res = await redeemCredit(owner, pm.slug);
  return Response.json(res, { status: res.ok ? 200 : 409 });
}
```

- [ ] **Step 3: Add the redeem form**

Create `src/app/report/account/RedeemCreditForm.tsx`:

```tsx
"use client";

// v0.33 — Spend a credit from the wallet. Deliberately plain: the buyer types
// or pastes an operator slug they found via search. A richer picker belongs
// with the search UI, not here.

import { useState } from "react";
import { useRouter } from "next/navigation";

const REASONS: Record<string, string> = {
  no_credits: "You have no reports left to use.",
  already_owned: "You already have that report.",
  not_found: "We couldn't find that operator.",
  unidentified: "Open this page from your emailed link to use a report.",
  bad_request: "Please enter an operator.",
};

export function RedeemCreditForm({ token }: { token: string | null }) {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/report/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pmSlug: slug.trim(), token: token ?? undefined }),
      });
      const data: { ok: boolean; reason?: string } = await res.json();
      if (data.ok) {
        router.push(`/report/r/${slug.trim()}`);
        return;
      }
      setError(REASONS[data.reason ?? ""] ?? "That didn't work. Please try again.");
    } catch {
      setError("That didn't work. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
      <input
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        placeholder="operator-name-city-st"
        aria-label="Operator to use a report on"
        className="h-11 flex-1 rounded-md border border-navy/20 px-3 text-[14px]"
      />
      <button
        type="submit"
        disabled={busy || slug.trim().length === 0}
        className="inline-flex h-11 items-center justify-center rounded-md bg-navy px-5 text-[14px] font-semibold text-white disabled:opacity-60"
      >
        {busy ? "Opening…" : "Use a report"}
      </button>
      {error && (
        <p role="alert" className="text-[13px] text-red-600 sm:basis-full">
          {error}
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 4: Rewrite the account page**

Replace the whole of `src/app/report/account/page.tsx` with:

```tsx
// v0.33 — Buyer wallet. PUBLIC, force-dynamic.
//
// Replaces the subscription hub: there is no recurring SKU any more. What a
// three-pack buyer needs instead is the reports they own, the credits they
// have left, and a way to spend one.
//
// Guest-or-org, keyed exactly like the entitlement resolver: a signed-in
// workspace user by organizationId, a guest by a verified magic-link email.

import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { verifyReportAccessToken } from "@/lib/report/access-token";
import { ReportShell } from "@/components/report/ReportShell";
import { countUnredeemed } from "@/lib/billing/credits.server";
import type { CreditOwner } from "@/lib/billing/credits";
import { RedeemCreditForm } from "./RedeemCreditForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your reports",
  robots: { index: false, follow: false },
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; partner?: string }>;
}) {
  const { token, partner } = await searchParams;
  const { organizationId } = await getActiveOrgContext();
  const guestEmail = organizationId ? null : verifyReportAccessToken(token);
  const identified = Boolean(organizationId || guestEmail);

  const owner: CreditOwner = { organizationId, guestEmail };
  const [owned, credits] = identified
    ? await Promise.all([
        prisma.reportEntitlement.findMany({
          where: organizationId ? { organizationId } : { guestEmail: guestEmail! },
          orderBy: { createdAt: "desc" },
          select: { pmSlug: true, createdAt: true },
        }),
        countUnredeemed(owner),
      ])
    : [[], 0];

  const names = owned.length
    ? await prisma.pM.findMany({
        where: { slug: { in: owned.map((o) => o.pmSlug) } },
        select: { slug: true, name: true },
      })
    : [];
  const nameBySlug = new Map(names.map((n) => [n.slug, n.name]));

  return (
    <ReportShell partner={partner}>
      <main className="bg-[#FBFAF6]">
        <section className="mx-auto max-w-[760px] px-6 pb-20 pt-14">
          <h1 className="text-[28px] font-semibold text-navy">Your reports</h1>

          {!identified ? (
            <p className="mt-4 max-w-[60ch] text-[15px] leading-relaxed text-muted-foreground">
              Open this page from the link in your purchase email to see the
              reports you own.{" "}
              <Link href="/report" className="text-teal underline-offset-2 hover:underline">
                Look up a property manager
              </Link>
              .
            </p>
          ) : (
            <>
              <div className="mt-6 rounded-xl border border-navy/15 bg-white p-6">
                <p className="text-[13px] font-medium text-muted-foreground">
                  Reports left to use
                </p>
                <p className="mt-1 text-[32px] font-semibold leading-none text-navy">
                  {credits}
                </p>
                {credits > 0 ? (
                  <>
                    <p className="mt-3 text-[14px] text-muted-foreground">
                      Use one on any property manager. Search for them first if
                      you need their exact name.
                    </p>
                    <RedeemCreditForm token={token ?? null} />
                  </>
                ) : (
                  <p className="mt-3 text-[14px] text-muted-foreground">
                    <Link href="/report" className="text-teal underline-offset-2 hover:underline">
                      Look up another property manager
                    </Link>{" "}
                    to buy more.
                  </p>
                )}
              </div>

              <h2 className="mt-10 text-[18px] font-semibold text-navy">
                Reports you own
              </h2>
              {owned.length === 0 ? (
                <p className="mt-3 text-[14px] text-muted-foreground">
                  Nothing yet.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-navy/10 rounded-xl border border-navy/15 bg-white">
                  {owned.map((o) => (
                    <li key={o.pmSlug} className="flex items-center gap-3 px-5 py-4">
                      <span className="flex-1 text-[15px] font-medium text-navy">
                        {nameBySlug.get(o.pmSlug) ?? o.pmSlug}
                      </span>
                      <Link
                        href={`/report/r/${o.pmSlug}`}
                        className="text-[14px] font-semibold text-teal underline-offset-2 hover:underline"
                      >
                        Open
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </main>
    </ReportShell>
  );
}
```

- [ ] **Step 5: Typecheck and clear any stragglers**

Run: `npx tsc --noEmit 2>&1 | grep -E "report/account|customer.server|ManageSubscription|report/portal"`
Expected: no output. If a stale import of a deleted module is reported, delete that import.

- [ ] **Step 6: Commit**

```bash
git add -A src/app/report/account src/app/api/report src/components/report src/lib/billing
git commit -m "Account page becomes the buyer's wallet

Reports owned, credits left, and a redeem action. Deletes the Stripe Billing
Portal route, its button and customer.server.ts — there is no subscription to
manage."
```

---

### Task 10: Teaser offers at the new prices

**Files:**
- Modify: `src/components/report/ReportTeaser.tsx`
- Modify: `src/components/report/CheckoutButtons.tsx`
- Test: `src/components/report/CheckoutButtons.test.tsx` (create)

**Interfaces:**
- Consumes: `ProductKind` (Task 1).
- Produces: `CheckoutButtons` props `{ pmSlug?: string; partner?: string | null; offers: Array<{ kind: ProductKind; label: string; priceLabel: string; sub?: string }> }` — the `marketId` prop is removed.

Note the pack's second placement — beside the peer table inside a paid report — belongs to **Plan 2**, not here. This task only corrects the prices and the SKU on the teaser.

- [ ] **Step 1: Write the failing component test**

Create `src/components/report/CheckoutButtons.test.tsx`:

```tsx
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CheckoutButtons } from "./CheckoutButtons";

// The buttons are the last thing between a buyer and a charge, so what they
// POST matters more than how they look. marketId is gone with the market pass;
// a stale prop here would send a field the route now rejects.

const OFFERS = [
  { kind: "single_report" as const, label: "Get this report", priceLabel: "$149" },
  { kind: "three_pack" as const, label: "Get three reports", priceLabel: "$299" },
];

beforeEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, "location", {
    value: { assign: vi.fn() },
    writable: true,
  });
});

describe("CheckoutButtons", () => {
  test("renders one button per offer with its price", () => {
    render(<CheckoutButtons pmSlug="acme-denver-co" offers={OFFERS} />);
    expect(screen.getByText("Get this report")).toBeTruthy();
    expect(screen.getByText("$149")).toBeTruthy();
    expect(screen.getByText("Get three reports")).toBeTruthy();
    expect(screen.getByText("$299")).toBeTruthy();
  });

  test("posts kind and pmSlug, and never a marketId", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://checkout.stripe.com/x" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CheckoutButtons pmSlug="acme-denver-co" partner="bp" offers={OFFERS} />);
    await userEvent.click(screen.getByText("Get three reports"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.kind).toBe("three_pack");
    expect(body.pmSlug).toBe("acme-denver-co");
    expect(body.partner).toBe("bp");
    expect("marketId" in body).toBe(false);
  });

  test("surfaces an error instead of silently doing nothing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    render(<CheckoutButtons pmSlug="acme-denver-co" offers={OFFERS} />);
    await userEvent.click(screen.getByText("Get this report"));
    expect(await screen.findByRole("alert")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/components/report/CheckoutButtons.test.tsx`
Expected: FAIL — the component still accepts and forwards `marketId`, so `"marketId" in body` is true.

- [ ] **Step 3: Drop `marketId` from the buttons**

In `src/components/report/CheckoutButtons.tsx`:

Replace the props interface with:

```tsx
interface CheckoutButtonsProps {
  /** Operator being bought. Optional: a pack can be bought with no operator
   *  in context, and its credits redeemed later from the account wallet. */
  pmSlug?: string;
  /** Attribution channel, e.g. "biggerpockets". */
  partner?: string | null;
  /** SKUs to offer, in display order. First is styled as primary. */
  offers: Array<{ kind: ProductKind; label: string; priceLabel: string; sub?: string }>;
}
```

Change the destructuring to `({ pmSlug, partner, offers })` and the fetch body to:

```tsx
        body: JSON.stringify({ kind, pmSlug, partner: partner ?? undefined }),
```

- [ ] **Step 4: Update the teaser offers**

In `src/components/report/ReportTeaser.tsx`, remove the `marketId={scorecard.market.id}` prop from `<CheckoutButtons>` and replace the `offers` array with:

```tsx
                offers={[
                  {
                    kind: "single_report",
                    label: "Get this report",
                    priceLabel: "$149",
                    sub: "Full scorecard + PDF, yours to keep.",
                  },
                  {
                    kind: "three_pack",
                    label: "Get three reports",
                    priceLabel: "$299",
                    sub: "Check this manager and two more, whenever you choose.",
                  },
                ]}
```

If `marketName` becomes unused in that file, delete its declaration — `npm run lint` will flag it.

- [ ] **Step 5: Run the component tests**

Run: `npx vitest run src/components/report/CheckoutButtons.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add src/components/report/ReportTeaser.tsx src/components/report/CheckoutButtons.tsx src/components/report/CheckoutButtons.test.tsx
git commit -m "Teaser offers \$149 single and \$299 pack; drop marketId from checkout"
```

---

### Task 11: Full gate and dead-reference audit

**Files:**
- Modify: whatever the audit turns up.
- Test: `src/lib/billing/no-removed-skus.test.ts` (create)

**Interfaces:**
- Consumes: everything above.
- Produces: a grep-level guard that the removed SKUs stay removed.

- [ ] **Step 1: Write the guard test**

Create `src/lib/billing/no-removed-skus.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// The market pass and the $19/mo subscription were removed across 18 files.
// A single surviving reference is how a dead consumer grant comes back — and
// the subscription's grant path unlocked all 44 markets, so this is a security
// guard, not tidiness.
//
// Grep over src/ rather than a type check, because the dangerous leftovers are
// strings in metadata and Prisma model names, which typecheck fine.

function grep(pattern: string): string[] {
  try {
    const out = execFileSync(
      "grep",
      ["-rIn", "--include=*.ts", "--include=*.tsx", "-E", pattern, "src"],
      { encoding: "utf8" }
    );
    return out.trim().split("\n").filter(Boolean);
  } catch {
    return []; // grep exits 1 when there are no matches
  }
}

test("no code references the removed Prisma models", () => {
  // Allow this file itself, which necessarily names them.
  const hits = grep("prisma\\.(marketPass|subscription)\\b").filter(
    (l) => !l.startsWith("src/lib/billing/no-removed-skus.test.ts")
  );
  assert.deepEqual(hits, [], `dead model access:\n${hits.join("\n")}`);
});

test("no code references the removed SKU kinds", () => {
  const hits = grep('"(market_pass|subscription)"').filter(
    (l) => !l.startsWith("src/lib/billing/no-removed-skus.test.ts")
  );
  assert.deepEqual(hits, [], `dead SKU literal:\n${hits.join("\n")}`);
});

test("no code references the removed analytics events", () => {
  const hits = grep("(market_pass_purchased|subscription_started|subscription_canceled)").filter(
    (l) => !l.startsWith("src/lib/billing/no-removed-skus.test.ts")
  );
  assert.deepEqual(hits, [], `dead analytics event:\n${hits.join("\n")}`);
});

test("MARKET_PASS_DAYS is gone", () => {
  const hits = grep("MARKET_PASS_DAYS").filter(
    (l) => !l.startsWith("src/lib/billing/no-removed-skus.test.ts")
  );
  assert.deepEqual(hits, [], `dead constant:\n${hits.join("\n")}`);
});
```

- [ ] **Step 2: Run it and fix what it finds**

Run: `node --import tsx --test src/lib/billing/no-removed-skus.test.ts`

For each reported line, delete the dead reference. Expected residue after Tasks 1–10 is comment text only.

**Do not touch `src/components/entitlements/MarketLockedUpsell.tsx`.** It reads "isn't part of your Dwellsy IQ subscription yet", which is prose about the **enterprise contract**, not the removed consumer SKU — and it is not a quoted string literal, so the guard above correctly ignores it. Deleting it would break the B2B market gate's upsell.

Re-run until the test passes, 4 tests.

- [ ] **Step 3: Run the whole gate**

```bash
npx prisma generate
npx tsc --noEmit 2>&1 | grep -c "error TS"
npm run lint 2>&1 | tail -2
npm run test:watch-list 2>&1 | tail -5
npm run test:components 2>&1 | tail -5
npm run test:seed-atomicity 2>&1 | tail -5
```

Expected:
- `tsc`: **0** errors. Not "about the same as before" — zero. See Prerequisites: the real baseline on `main` is clean, and the 17-error figure that appears in some earlier PR descriptions was a stale local `node_modules` missing the `stripe` package, plus a stale Prisma client.
- `npm run lint`: **60 problems (43 errors, 17 warnings)** — the genuine pre-existing baseline. Any increase is yours. Most of the 43 are `no-explicit-any` in existing test fixtures; do not add more.
- `test:watch-list`: passes, and the count is **higher than 803** (the count on `main` at the time of writing) by the tests this plan adds.
- `test:components`: passes, 3 tests higher than its previous count.
- `test:seed-atomicity`: passes. With no `SEED_TEST_DATABASE_URL` the credit tests skip — check the output says `skipped 7` rather than `pass 0`, or you have proved nothing.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Guard the removed SKUs and clear dead references

Grep-level rather than type-level: the dangerous leftovers are metadata
strings and Prisma model names, which typecheck fine."
```

- [ ] **Step 5: Open the PR**

```bash
git push -u origin <branch>
gh pr create --base main --title "Consumer billing: two SKUs at \$149/\$299 with report credits" --body-file <notes>
```

The PR body must state: the two SKUs and their prices; that `market_pass` and `subscription` are deleted; that the subscription's access path would have granted all 44 markets; that the migration was amended in place because it had never been applied; and that **production migration is a separate deliberate step** (`npm run db:migrate:production`) that has not been run.

---

## Post-merge: production migration

Not part of any task — this is an operator action, taken deliberately after review.

```bash
npm run db:migrate:production
```

Then confirm the tables exist and the removed ones do not:

```bash
npx tsx -e 'import{PrismaClient}from"@prisma/client";const p=new PrismaClient();(async()=>{for(const t of ["StripeCustomer","ReportEntitlement","ReportCredit","StripeWebhookEvent"]){const r=await p.$queryRawUnsafe(`SELECT COUNT(*) n FROM "${t}"`);console.log(t,Number(r[0].n),"rows");}await p.$disconnect();})()'
```

Expected: all four tables present with 0 rows. `MarketPass` and `Subscription` must not exist.

The three Stripe Price env vars must be set in Vercel before checkout works: `STRIPE_PRICE_REPORT` ($149), `STRIPE_PRICE_THREE_PACK` ($299), plus the existing `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. `resolvePriceId` throws loudly rather than charging a wrong amount if one is missing.
