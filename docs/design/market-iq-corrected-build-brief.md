# Market IQ — Corrected Build Brief for Codex

**Branch:** `codex/market-iq-integration`
**Author intent:** Reshape the existing Market IQ work from an owner-facing market *monitor* into a property-manager *market-authority engine*. Date: 2026-08-14.
**Read this first, in full, before writing code.** The current branch builds a competent product aimed at the wrong user. Your job is not to add features to it. Your job is to re-point it.

---

## 1. Mission in one paragraph

Market IQ is the tool a property manager (PM) buys to be the undisputed market expert in front of the owners they serve and the owners they want to win. The core deliverable is a **PM-branded, sendable market report** the PM gives to clients and prospects, backed by a private layer that keeps the PM genuinely current and ready to defend the numbers when pressed. The PM is the **buyer**. The owner and the prospect are the **readers**, not users. Dwellsy stays **backstage**: the report carries the PM's brand, with at most a small "market data by Dwellsy IQ" credit. What makes the report impossible for Altos or CoStar to match is the **operator-scape**: the market-level view of who actually manages and lists in this market and how they are performing, which only Dwellsy can produce.

If you are ever unsure whether a change serves this mission, ask: *does this help a PM look like the market authority to an owner?* If not, stop.

---

## 2. What the branch is today, and why it is wrong

- `/market-iq` (`src/app/market-iq/page.tsx` → `src/components/market-iq/ClevelandPilot.tsx`) is a **monitoring dashboard** for whoever holds an entitled login: asking-rent trends (MSA/city/ZIP), a historical listing pulse, watchlists, alerts, and a weekly digest.
- It is housed inside an **owner-first** shell (nav: Today / Portfolio / Markets / Operators / Reports) whose homepage and Operator IQ product are explicitly *not for PMs*.
- The only outbound "brief" is **owner → PM** (`PortfolioIqPmBrief`). There is no PM → owner artifact.
- Operator depth is **deliberately excluded** by a design guardrail ("operator teaser + deep links, never a second scorecard").
- Everything, including the digest email, is **Dwellsy IQ branded**.

Four things must change: **(1)** the buyer/reader split, **(2)** a sendable PM-branded report as the hero, **(3)** the operator-scape put *into* the report, **(4)** Dwellsy moved backstage. This brief sequences that.

---

## 3. Non-negotiable constraints

1. **Additive only.** New Prisma models and migrations only. Do not alter or drop existing columns/models. Do not mutate production data. Ship to a Vercel preview.
2. **Do not break Operator IQ or Portfolio IQ.** No renaming or moving existing stable routes, models, or components. Market IQ work is additive alongside them.
3. **Fail-closed entitlements.** Every premium read requires both product access (`OrganizationProductAccess`, key `market_iq`) and market access (`OrganizationMarketAccess`). Follow the existing pattern in `src/app/market-iq/page.tsx`.
4. **Source honesty is sacred.** Keep as-of dating, the "asking-market, not occupancy or effective rent" caveat, and the refusal to fabricate a live feed. These must appear on the **outbound report**, worded as rigor, not fine print. Do not invent listing data while the live feed is paused.
5. **Dwellsy backstage on anything an owner sees.** Owner-facing report, emails, and public pages carry the **PM's** brand. A single small "Market data by Dwellsy IQ" credit line is allowed and encouraged for provenance. No Dwellsy IQ headers, logos, or "Open Market IQ" CTAs on owner-facing surfaces.
6. **Two Prisma schemas, respect the split.** Workflow/org/report data → main `prisma/schema.prisma` (client `prisma`). Analytical market data (trends, listings, alerts) → isolated `prisma/market-iq/schema.prisma` (client `marketIqPrisma`, `src/lib/market-iq/prisma.ts`). New report/brand/recipient/delivery models are **workflow data → main schema.**
7. **Tests.** Add/extend Vitest coverage next to the code (the repo has `*.test.ts(x)` beside modules). Every new server module gets unit tests; every new entitlement gate gets a fail-closed test.
8. **Stack conventions.** Next.js 16 App Router, React 19, TypeScript strict, Prisma, Clerk auth, SendGrid (`src/lib/email/send.ts`), Vercel Cron, `@react-pdf/renderer` for PDF, shadcn/Base UI/Radix + Tailwind, Dwellsy IQ tokens for *internal* surfaces only.

**Do NOT:**
- Add more monitoring/dashboard/watchlist features.
- Build a second per-operator scorecard. The operator-scape is **market-aggregated**, not individual-PM profiles.
- Put buyer and reader in one persona.
- Gate Phase 1 on the brand-architecture decision (see gates); build the report first.

---

## 4. Reusable infrastructure (use these, do not reinvent)

| Need | Reuse | Location |
|---|---|---|
| Public-link + email delivery + SendGrid event tracking + recipient fields + status lifecycle | **`PortfolioIqPmBrief`** shape (publicToken, recipientName/Email, deliveryStatus, deliveryProviderId, deliveredAt, lastEmailEventType) and its public route `/pm-briefs/[publicToken]` | `prisma/schema.prisma` (model `PortfolioIqPmBrief`), `src/lib/portfolio-iq/pm-brief*.ts`, `src/app/pm-briefs/[publicToken]` |
| PDF generation | `@react-pdf/renderer` | reference `src/components/scorecard/OperatorProfilePDF.tsx` |
| Email compose + send | SendGrid wrapper + layout | `src/lib/email/send.ts`, `src/lib/email/layout.ts`, event ingest `src/lib/email/sendgrid-events*` |
| Scheduled delivery | Vercel Cron routes | `src/app/api/cron/*`, existing `src/app/api/market-iq/digest` |
| Entitlement gates | product + market access helpers | `src/lib/auth/product-entitlements(.server).ts`, `src/lib/auth/market-entitlements.server.ts` |
| Market trends / listings / alerts data | isolated analytical client | `marketIqPrisma`, `src/lib/market-iq/{trends,historical,alerts}*.ts` |
| Operator data for the operator-scape | existing Operator IQ data | main schema models `PM`, `CanonicalOperator`, `OperatorSnapshot`; logic in `src/lib/scorecard`, `src/lib/operators` |

---

## 5. Build sequence

Phases are ordered to de-risk the business thesis fastest. **Phase 1 is the whole bet.** Do not start a later phase before the prior one meets its Definition of Done. Phases 2+ are scoped here but expect refinement after Phase 1 lands.

### PHASE 1 — Prove the hero artifact on one market (Cleveland)

Goal: a Cleveland market report, **PM-branded**, **leading with the operator-scape**, that a PM can generate, preview, get a shareable owner-facing link for, and send by email. One market, one PM persona, one artifact. This phase is brand-agnostic about the PM's *dashboard* surface (that is Phase 2); it only requires that the **artifact and its public page/email are PM-branded**.

**1a. Data model (additive, main schema).**
- `OrganizationBrandProfile` — per-organization PM brand: displayName, logoUrl, primaryColor, accentColor, contactName, contactEmail, contactPhone, websiteUrl. One per organization.
- `MarketIqReport` — a generated report instance: `organizationId`, `marketId`, `periodLabel`, `publicToken @unique`, `status` (draft | published | revoked), `snapshot` (String, JSON of the fully-rendered report data at generation time, mirroring the `PortfolioIqPmBrief.snapshot` pattern so the report is immutable once sent), `brandProfileId`, `generatedBy`, `publishedAt`, timestamps.
- `MarketIqReportRecipient` — `reportId` or org-owned list entry: name, email, kind (client | prospect).
- `MarketIqReportSend` — delivery record mirroring PmBrief delivery fields: recipientEmail, deliveryStatus, deliveryProviderId, deliveredAt, lastEmailEventType, error. Wire SendGrid events through the existing ingest.
- Migration is additive; include a Vitest that asserts the models exist and relations resolve.

**1b. Report data assembly (server).** New `src/lib/market-iq/report/build.server.ts`:
- Input: `organizationId`, `marketId` (Cleveland), period.
- Assemble a `MarketIqReportSnapshot` with sections in this order:
  1. **Operator-scape (LEAD SECTION).** Market-aggregated operator view from `PM` / `CanonicalOperator` / `OperatorSnapshot`: who is active in this market, share gainers/losers, concession behavior, DOM by operator type, institutional vs independent mix, community-size mix (SFR / small multi 2–99 / large multi 100+). **MSA-tier only** (see Gate 2). This is aggregation of existing Operator IQ data, not a new scorecard and not individual-PM profile pages.
  2. **Rent and supply context** (supporting, not hero): asking-rent trends and the historical listing pulse already produced by `src/lib/market-iq/{trends,historical}.server.ts`. Reuse; do not duplicate.
  3. **Source & method note:** as-of dates per source, the asking-market caveat, and the "Market data by Dwellsy IQ" credit.
- Segment by **community size** as the primary cut; keep apartment/house as secondary (see Item G1 in the punch list). Do **not** invent live-listing figures; carry the paused-feed dating honestly.

**1c. PM-facing report composer + preview.** Route under the existing `/market-iq` area (e.g. `/market-iq/report`), gated fail-closed. The PM: picks the market and period, sees the assembled report rendered in the PM's brand (pulls `OrganizationBrandProfile`), and can Publish. Publishing writes a `MarketIqReport` with an immutable snapshot + `publicToken`.

**1d. Owner-facing public report page.** `/reports/market/[publicToken]` (a **new, unbranded-by-Dwellsy** public route; do NOT reuse the Dwellsy IQ shell/header). Renders the snapshot in the **PM's** brand from a no-login token, mirroring how `/pm-briefs/[publicToken]` renders without auth. Small Dwellsy provenance credit only.

**1e. PDF.** `@react-pdf/renderer` component `src/components/market-iq/report/MarketIqReportPDF.tsx` (reference `OperatorProfilePDF.tsx`) rendering the same snapshot, PM-branded. Downloadable from the composer and attachable to the email.

**1f. Send.** Reuse `src/lib/email/send.ts` to email the public link (and/or PDF) to a `MarketIqReportRecipient`, **from the PM as sender-of-record**, PM-branded template (new template in `src/lib/email/`, not the Dwellsy `buildMarketIqDigest`). Record a `MarketIqReportSend`; wire SendGrid delivery/open events through existing ingest.

**Phase 1 Definition of Done:**
- [ ] A PM persona can generate a Cleveland report that **leads with the operator-scape**, rendered in the PM's brand with no Dwellsy header/logo/CTA.
- [ ] Publishing produces an immutable snapshot + public token; the `/reports/market/[token]` page renders it with no login, PM-branded, with a small Dwellsy provenance credit.
- [ ] A PDF of the same snapshot downloads, PM-branded.
- [ ] The report can be emailed to a client and to a prospect from the PM as sender; a send record and SendGrid events are captured.
- [ ] Source dating + asking-market caveat appear on the report.
- [ ] Fail-closed: no `market_iq` product or no Cleveland market access → 404, with tests.
- [ ] No existing Operator IQ / Portfolio IQ route or model changed. Vitest green.

### PHASE 2 — Wrap it in the PM surface  *(GATE 1 required before starting)*
Separate the PM-facing experience from the owner-facing Operator IQ shell so a PM never sees the "grade your PM" framing. Add `OrganizationBrandProfile` settings UI. Recipient/list management (clients vs prospects). Scope depends on Gate 1 (own brand/surface vs shared shell).

### PHASE 3 — Mastery + evidence locker
- **Talking-points layer (PM-only, never sent):** for each report, "the 3 things that moved and how to explain them" derived from the existing `decisionRead`/`signal.narrative` generators, rewritten as *what to say*.
- **Drill-down evidence:** one click from any market claim to the specific `MarketIqListing` comps behind it, ready to show live. This is the "when the client presses" layer.

### PHASE 4 — Recurring + prospect mode
- Repoint the digest/cron machinery to deliver the **PM-branded report** on a PM-controlled schedule to the PM's client/prospect lists (PM sender-of-record). Reuse `src/app/api/cron/*` + `MarketDigestPreference` patterns, but the payload is the branded report, not Dwellsy alerts.
- **Prospect-pitch variant** of the report tuned to win a new management contract for a named market or a prospect's asset.

### PHASE 5 — Industrialize + price  *(GATE 3, Gate 4 inform this)*
- Generate reports for any covered MSA from the live trend/listing pipelines (no hand-seeded data).
- PM pricing/packaging + near-self-serve entitlement path (priced on markets covered + report volume; open to every PM in a market).
- Add Market-IQ-specific resale/derivative terms protecting the operator-scape.

---

## 6. Decision gates (do not guess; ask the author)

- **GATE 1 — Brand architecture (blocks Phase 2).** Does Market IQ get its own PM-facing brand/surface, or live under the shared Dwellsy IQ Online shell? Phase 1 does not need this answered because the *artifact* is PM-branded regardless. Phase 2 does.
- **GATE 2 — Operator-scape depth (default set, confirm).** **Default for Phase 1:** operator-scape is **market-aggregated and MSA-tier only**; no individual-PM scorecard pages and no sub-MSA operator stats (thin-N). Rents/supply may go city/ZIP. Confirm before widening.
- **GATE 3 — Self-serve vs sales-led** (Phase 5 entitlement motion).
- **GATE 4 — Live feed prerequisite** (does the outbound report ship on trends + dated export until live listing ingestion lands, or wait). **Default:** ship on trends + honest dating now.

---

## 7. First PR to open

Phase 1a + 1b + 1d as a thin vertical slice: the additive models + migration, `report/build.server.ts` assembling a Cleveland snapshot that **leads with the operator-scape**, and the unbranded public `/reports/market/[token]` page rendering it PM-branded from a seeded example report. Prove the shape end-to-end before layering composer polish, PDF, and send. Keep production untouched; deploy to a preview.
