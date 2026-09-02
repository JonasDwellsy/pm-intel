# Bifurcating Operator IQ and the Reports product

**Status:** design, awaiting review
**Date:** 2026-09-01

## Summary

Split the business into two products that differ in kind, sold from one public
front end:

- **Reports** — self-serve, public, no login. A point-in-time verdict on a
  property manager. **$149** for one operator, **$299** for three.
- **Operator IQ** — sales-led, login-gated. Continuous monitoring across a
  portfolio: watch lists, change digests, briefs, Ask AI, exports, seats.

The line that keeps a $149 product from cannibalising a five-figure contract:

> **A report is an answer. Operator IQ is a system that keeps answering.**

Reports are bounded in time and scope by construction. Everything continuous
lives on the enterprise side. This is a difference in kind, not volume, so a
buyer comparing the two is not comparing quantities of the same thing.

## Why now

Nothing is live. There are no clients, the billing tables have never been
migrated (see "Current state"), and no money has changed hands. Every decision
here is cheap today and expensive in six months — particularly pricing, which
is far easier to lower than to raise once channel partners and early buyers
have anchored on a number.

## Current state (verified 2026-09-01)

What already exists on `main`:

- Full consumer funnel: `/report` (landing + search), `/report/r/[slug]`
  (teaser + paid report), `/report/account`. Public, not in
  `PROTECTED_ROUTE_PATTERNS`.
- Stripe checkout, webhook, and entitlement resolution, with guest-email
  ownership so buyers need no account.
- Partner theming (`?partner=`) for co-marketed placements.
- Three SKUs in `src/lib/billing/products.ts`: `single_report` ($29),
  `market_pass` ($49 / 30d), `subscription` ($19/mo).

What is **not** shipped:

- **The billing tables do not exist in production.** Migration
  `20260826000000_consumer_single_report_billing` creates `StripeCustomer`,
  `ReportEntitlement`, `MarketPass`, `Subscription` and `StripeWebhookEvent`,
  but it has never been applied. `vercel-build` runs only
  `prisma generate && next build` — there is no automatic
  `migrate deploy`, so migrations are applied deliberately via
  `npm run db:migrate:production`.
- Because the migration is unapplied and no rows exist, **it can be amended in
  place** rather than followed by a corrective migration.

Two defects in the unshipped billing layer, both fixed by this design:

1. **`Subscription` grants every market.** It carries no `marketId`, and
   `resolveReportAccess` filters only on `status: "active"` and
   `currentPeriodEnd`. An active $19/month subscription would have unlocked all
   44 markets — the entire enterprise dataset for $228/year.
2. **The ladder was inverted.** $49 for a whole market for 30 days undercut
   $29-per-operator, and both undercut enterprise by orders of magnitude.

## Pricing

| SKU | price | grants |
|---|---|---|
| Single report | **$149** one-time | one operator's full scorecard, permanent, web + PDF |
| Three-report pack | **$299** one-time | three report credits, permanent, redeemable at any time |

Both are `payment` mode in Stripe. No recurring SKUs.

**Why $149 rather than $29.** The buyer is deciding whether to hire or fire a
property manager. That relationship costs $2,500–3,500/year per door in
management and leasing fees, and getting it wrong costs multiples of that — a
month of extra vacancy is ~$2,000, an eviction is $3,500–5,000 plus lost rent.
The decision is worth $5,000–15,000 over two years on a single door, so the gap
between $29 and $149 is not a financial decision for the buyer.

Price is also positioning. At $29 the product sits beside a tenant background
check, which is a commodity data pull. At $149 it sits beside a home
inspection — a professional assessment that de-risks a large transaction, and
the correct analogue, since the product is a five-dimension composite with peer
cohorts, a documented methodology and a PDF deliverable.

**Why three.** Owners typically interview two to four managers. The scorecard's
`ScaleFitSection` already names roughly four comparable local operators in its
peer table, so a single report hands the buyer the exact names that create
demand for the pack. $299 against $447 reads as a clear saving.

**Why no recurring SKU.** Monitoring is the enterprise product's core claim.
Selling change alerts at $19–29/month, even scoped to one market, would price
the thing enterprise charges thousands for. Reports stay strictly
point-in-time.

## Architecture: one public front end

One host serves everything, split by authentication rather than by hostname.

```
/                     value story, institutional framing, enterprise CTA
/report               consumer landing + operator search
/report/r/[slug]      teaser (public) -> paid report (entitled)
/report/account       buyer's reports + unredeemed credits
/sample               public sample scorecard
/methodology          public
------------------------------------------------ Clerk gate
/watch-lists, /ask, /operators, /admin, data + PDF APIs
```

**Why one front end rather than two hosts.** The $149 report is the enterprise
product's proof. A prospect evaluating a measurement business wants to know
whether the data is any good, and a public report lets them verify the work on
an operator they already know before they ever take a call. That converts
"trust us" into "check for yourself," which is worth more than the transaction.
It also concentrates brand, SEO and design system in one place, and the report
funnel becomes a demand signal — which operators and markets people pay to look
up.

**The risk this creates is message dilution, not price anchoring.** The
homepage speaks to owners and asset managers ("The best operators drive the
best yield. Know where yours stand."). The $149 buyer is asking a different
question: should I fire my property manager? The resolution is one voice, two
doors, sized by how the visitor arrived:

- **Homepage / brand traffic** keeps the institutional framing. Enterprise is
  the CTA; the report is a self-serve proof point, not the headline.
- **Operator report pages** are the SEO surface — one per operator across 4,468
  of them — and speak to the individual decision. Most buyers arrive here from
  a search and never see the homepage.

The enterprise tease must show what a report cannot do: a watch list, a change
alert firing, a market brief. Not a feature grid.

## Report credits

At the moment of purchase the buyer usually knows **one** operator name — they
arrived by searching it. The peers are revealed after they read the first
report. So the pack cannot grant three entitlements at checkout; it grants
credits.

### Schema

```prisma
model ReportCredit {
  id              String    @id @default(cuid())
  organizationId  String?
  guestEmail      String?   // lowercased, same guest key as ReportEntitlement
  stripeSessionId String    // the pack purchase; NOT unique — 3 rows share it
  redeemedPmSlug  String?   // null while unredeemed
  redeemedAt      DateTime?
  createdAt       DateTime  @default(now())

  organization Organization? @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId, redeemedAt])
  @@index([guestEmail, redeemedAt])
  @@index([stripeSessionId])
}
```

One row per credit — three per pack. A row per credit rather than a counter
column means redemption is a guarded row claim with no read-modify-write race,
and the ledger is auditable.

Credits **do not expire**. The single report grants permanent access; an
expiring credit for the same product would be incoherent.

### Change to `ReportEntitlement`

`stripeSessionId` is currently `String @unique`. A pack produces three
entitlements from one session, so that constraint must go. It becomes
`String?`, non-unique, audit-only, and gains `sourceCreditId String? @unique`
so a credit can be redeemed at most once.

Idempotency does not depend on it. It is already carried by:

- `StripeWebhookEvent`, which dedupes Stripe event replays, and
- the existing `@@unique([pmSlug, organizationId])` and
  `@@unique([pmSlug, guestEmail])`, which are the semantically correct guard —
  an owner cannot hold the same report twice.

### Redemption

```
claim(owner, pmSlug):
  transaction:
    credit = first ReportCredit where owner matches AND redeemedAt is null
             order by createdAt asc
    if none -> { ok: false, reason: "no_credits" }

    claimed = updateMany
                where  id = credit.id AND redeemedAt IS NULL
                data   redeemedPmSlug = pmSlug, redeemedAt = now()
    if claimed.count != 1 -> { ok: false, reason: "raced" }   // retry once

    upsert ReportEntitlement (pmSlug, owner)
           sourceCreditId = credit.id
    -> { ok: true }
```

The guarded `updateMany` makes double-spend impossible even under concurrent
requests: only one transaction can move a row out of the unredeemed state.

### Purchase flow

- **Single ($149)** — the operator is known at checkout. Webhook creates one
  `ReportEntitlement` directly. Unchanged from today apart from the price.
- **Pack ($299)** — webhook creates three `ReportCredit` rows. If the checkout
  carried a `pmSlug` (bought from a report page), one credit is redeemed
  immediately for that operator, leaving two. Bought from the landing page with
  no operator in context, all three remain.

### Where the pack is sold

Two placements, and the second matters more:

1. At checkout, beside the single report.
2. **Inside the first paid report, next to the peer table** — where the buyer
   is looking at four named local operators and wondering about them. Intent is
   highest at the moment the question becomes concrete.

`/report/account` becomes the buyer's wallet: reports owned, credits remaining,
and a redeem action. It exists today as subscription management and is
repurposed rather than built.

## Removals

`market_pass` and `subscription` are removed entirely — catalog entries, access
paths, checkout branches, webhook handlers, UI and models.

**Scope:** 18 files reference them, concentrated in
`src/app/api/stripe/webhook/route.ts` (19 refs), `src/app/report/account/page.tsx`
(10), `src/lib/billing/products.ts` (9), plus `report-entitlements.ts`,
`report-entitlements.server.ts`, `delivery.ts`, `customer.server.ts`,
`checkout/route.ts`, `analytics-server.ts`, `verify-session.ts`,
`MarketLockedUpsell.tsx`, `ManageSubscriptionButton.tsx`,
`CheckoutButtons.tsx`, `ReportTeaser.tsx`, `ReportShell.tsx`,
`access-token.ts`, `report/portal/route.ts`.

Removing the access paths is the real fix for defect (1): a dormant
all-markets grant left in the resolver is a landmine that fires the first time
any `Subscription` row appears for any reason.

Because the migration is unapplied, `MarketPass` and `Subscription` are deleted
from `schema.prisma` and from the migration SQL rather than dropped later. No
expand/contract dance is needed — there is nothing to contract.

`StripeCustomer` and `StripeWebhookEvent` stay; both serve the one-time
products.

## Migration plan

The pending migration is amended in place, not superseded:

1. Edit `prisma/migrations/20260826000000_consumer_single_report_billing/migration.sql`:
   drop the `MarketPass` and `Subscription` table definitions, drop the unique
   index on `ReportEntitlement.stripeSessionId`, make that column nullable, add
   `sourceCreditId`, and add the `ReportCredit` table.
2. Match `schema.prisma` to it.
3. `npx prisma generate` — this also clears the four pre-existing `tsc` errors
   about `reportEntitlement` / `marketPass` / `subscription` / `stripeCustomer`
   not existing on `PrismaClient`, which are stale-client artifacts.
4. Apply with `npm run db:migrate:production` as a deliberate step.

Verification: CI already runs `prisma migrate deploy` against a scratch
database, so an inconsistent migration fails there before it reaches
production.

## Consequences for open work

**PR #413** mounts the funnel at the *root* of a separate host via a
`beforeFiles` rewrite (`/` → `/report` for `FUNNEL_HOST`). Under a single front
end, `/` is the value story and the funnel is a section beneath it, so the
rewrite is contrary to this design. Merge the teaser and shell work — the
stronger hook, the lock states, the sample-report link, the logo and footer —
and drop the hosting rewrite and the `FUNNEL_HOST` env var.

## Implementation sequencing

This is three plans, not one. Each produces working, shippable software on its
own.

**Plan 1 — Billing: two SKUs and credits.** The product catalog, the
`ReportCredit` model and redemption, webhook and checkout changes, the account
wallet, removal of `market_pass` and `subscription`, and the amended migration.
Self-contained and fully testable without touching a single page's design. This
is the plan that closes the all-markets defect, so it goes first.

**Plan 2 — Front end.** The homepage's two-doors framing, the enterprise tease,
and the pack placement beside the peer table. Depends on Plan 1 for the pack to
exist. Includes merging PR #413's teaser and shell work minus its hosting
rewrite.

**Plan 3 — Go public and migrate the host.** The indexing flip with per-path
robots rules, and the `intel.*` → `operators.*` canonical sweep plus permanent
301. Independent of Plans 1 and 2, and gated on decisions 1 and 2 below. Worth
keeping separate precisely because it is the irreversible one: a sweep of
hardcoded hosts and a public search index are both hard to walk back.

## Out of scope

- A whole-market consumer product. Deliberately held back: three SKUs at zero
  traffic optimises a funnel nobody has walked. Add it when a buyer asks.
- Any recurring consumer SKU.
- Enterprise billing. Enterprise stays contract-and-invoice, provisioned by
  admin through Clerk orgs and market entitlements. Stripe is consumer-only.
- Changes to scorecard content, methodology or the data pipeline.

## Decisions still needed

These are business calls, not design gaps. Each has a recommendation; none
blocks writing the implementation plan, but the first two block launch.

**1. Going public.** Launching Reports means indexing operator pages.
`src/lib/seo.ts` carries a single global `INDEXING_ENABLED = false`, feeding
`robots.ts`, `sitemap.ts` and the root layout. Reports cannot work without
search — the whole distribution model is an owner googling a manager's name. So
launch requires flipping it and adding per-path robots rules that allow the
public surface and disallow the app paths.

This publicly reverses the homepage's "no public PM lookup, sales motion only"
rule, and puts 4,468 operator names and ratings on the open web — some of whom
are or could be Dwellsy customers. *Recommendation: proceed, but as an explicit
decision, not a side effect of shipping.*

**2. Canonical host.** `intel.iq.dwellsy.com` is hardcoded as canonical across
emails, PDFs, digest links and checkout redirects (swept there in #297).
*Recommendation: make `operators.iq.dwellsy.com` canonical and 301 `intel.*`
permanently. Do the sweep once, now, while there are no clients to break.*

**3. Partner channels.** If BiggerPockets or a similar partner is a major
distribution path, their audience's reference prices and the rev-share
economics may argue for a different number than a direct-to-owner funnel.
*Recommendation: hold $149/$299 for direct; price partner placements separately
once terms are known.*
