# Market IQ — Corrected Build Brief for Codex (Revision 3)

**Branch:** `codex/market-iq-integration`
**Date:** 2026-08-14 (Revision 3)
**Read this first, in full, before writing code.**

## Revision history — what changed and why
- **R1 (wrong):** led the report with an operator-scape. Reversed in R2: PMs never show competitors to clients/prospects.
- **R2 (wrong altitude):** framed "your position" as a single subject-property benchmark (one address vs a comp set). That pointed the build at single-property comping, which is (a) the wrong altitude for a market report, (b) a different Dwellsy product (the comp-report / rent-reasonableness world, the CompIQ shape that already failed as a standalone), and (c) a walk straight into thin-N.
- **R3 (this doc):** the report's primitive moves UP from "one property vs comps" to **"the owner's managed portfolio, at segment and submarket altitude, versus the market."** A single property is demoted to two supporting roles only: a drill-down inside the report, and the prospect single-asset pitch mode. Codex's R2 segment-level aggregation work is reusable; it just gets reframed away from a single subject.

**Why the altitude matters:** Market IQ is a *market* report. An owner's stake in a market is their **portfolio** (the set of units the PM manages for them), not one address. Aggregating across the portfolio and the market segment also dissolves most of the thin-N problem R2 hit, because you stop leaning on one building's three active listings.

---

## 1. Mission in one paragraph

Market IQ is the tool a property manager (PM) buys to be the undisputed market expert for the owners they serve and the owners they want to win. The core deliverable is a **PM-branded, sendable market report** that answers the question an owner actually asks: *how are we doing in our market.* The report's subject is **the market and the owner's portfolio within it**, at segment and submarket altitude: the owner's managed units aggregated against the market for those same segments, across the owner's submarkets. The PM is the **buyer**. The owner and prospect are the **readers**. Dwellsy stays **backstage** (PM brand on the artifact, at most a small "market data by Dwellsy IQ" credit). No competitors ever appear. What makes it more than a commodity rent chart is the depth of the owner's own position, keyed to their actual units, granular to submarket, product type, and community size, on the most complete rental coverage, honestly dated. Only Dwellsy can produce that.

Test every change against: *does this show the owner how their portfolio is doing in their market, without naming a competitor and without collapsing into a single-property report?* If not, stop.

---

## 2. What the branch is today, and what must change

- `/market-iq` (`src/app/market-iq/page.tsx` → `ClevelandPilot.tsx`) is a **monitoring dashboard** for whoever holds an entitled login, inside an **owner-first** shell. Only outbound brief is **owner → PM** (`PortfolioIqPmBrief`). Everything is **Dwellsy IQ branded**.
- Four changes: **(1)** split the buyer (PM) from the reader (owner/prospect); **(2)** add a sendable **PM-branded report** as the hero; **(3)** the report **leads with the owner's portfolio position at segment/submarket altitude**, never competitors, never organized around one property; **(4)** move Dwellsy **backstage / white-label**.
- **Keep:** platform consolidation, product + market entitlements, source-honesty discipline, and the operator "teaser only" guardrail (operators stay out of owner-facing output entirely).

---

## 3. Non-negotiable constraints

1. **Altitude.** The report's primitive is **the market and the owner's portfolio within it, aggregated to segment and submarket.** Never organize the report around a single property. A single address appears only as (a) a drill-down inside a segment, or (b) the prospect single-asset pitch mode. This is not a comp-report product.
2. **No competitors, ever, on owner-facing surfaces.** No named operators, no share rankings, no "who runs this market." The owner's own managed units are not competitors; aggregating them is fine. Operator-derived signals are allowed only when they read purely as market conditions and never name or rank operators. When in doubt, leave it out.
3. **Additive only.** New Prisma models/migrations only. No altering/dropping existing columns or models. No production mutation. Ship to a Vercel preview.
4. **Do not break Operator IQ or Portfolio IQ.** No renaming/moving stable routes, models, or components.
5. **Fail-closed entitlements.** Every premium read requires product access (`OrganizationProductAccess`, key `market_iq`) and market access (`OrganizationMarketAccess`). Follow `src/app/market-iq/page.tsx`.
6. **Source honesty is on the outbound report.** As-of dating, the "asking-market, not occupancy or effective rent" caveat, sample sizes shown, no fabricated live feed. Suppress any cell too thin to defend rather than printing a fragile number.
7. **Dwellsy backstage.** PM brand on the report, emails, and public pages. A single small "Market data by Dwellsy IQ" credit is allowed. No Dwellsy IQ headers/logos/CTAs on owner-facing surfaces.
8. **Two Prisma schemas.** Workflow/org/report data → main `prisma/schema.prisma` (`prisma`). Analytical market data → isolated `prisma/market-iq/schema.prisma` (`marketIqPrisma`). New report/brand/recipient/delivery models are workflow data → main schema.
9. **Tests.** Vitest beside the code. New server modules get unit tests; entitlement gates get fail-closed tests.
10. **Stack.** Next.js 16 App Router, React 19, TypeScript strict, Prisma, Clerk, SendGrid (`src/lib/email/send.ts`), Vercel Cron, `@react-pdf/renderer`, shadcn/Base UI/Radix + Tailwind.

**Do NOT:** organize the report around a single property (Constraint 1); put operator/competitor landscape in owner-facing output (Constraint 2); add more monitoring/dashboard features; collapse buyer and reader; gate Phase 1 on the brand-architecture decision (Gate 1).

---

## 4. Reusable infrastructure

| Need | Reuse | Location |
|---|---|---|
| Public-link + email delivery + SendGrid event tracking + recipient/status lifecycle | `PortfolioIqPmBrief` shape + `/pm-briefs/[publicToken]` | `prisma/schema.prisma`, `src/lib/portfolio-iq/pm-brief*.ts`, `src/app/pm-briefs/[publicToken]` |
| PDF | `@react-pdf/renderer` | reference `src/components/scorecard/OperatorProfilePDF.tsx` |
| Email compose + send | SendGrid wrapper + layout | `src/lib/email/send.ts`, `src/lib/email/layout.ts`, `sendgrid-events*` |
| Scheduled delivery | Vercel Cron | `src/app/api/cron/*`, `src/app/api/market-iq/digest` |
| Entitlement gates | product + market access helpers | `src/lib/auth/product-entitlements(.server).ts`, `market-entitlements.server.ts` |
| Market read + the owner's units observed in Dwellsy data | isolated analytical client | `marketIqPrisma`, `src/lib/market-iq/{trends,historical}*.ts`; reuse R2's segment aggregation, reframed to portfolio+segment |

**Note:** `PM` / `CanonicalOperator` / `OperatorSnapshot` remain the basis of the owner-facing Operator IQ product. They are not for Market IQ owner-facing output.

---

## 5. Build sequence

**Phase 1 is the whole bet.** Do not start a later phase before the prior meets its Definition of Done.

### PHASE 1 — Prove the hero artifact on one market (Cleveland)

Goal: a Cleveland market report, **PM-branded**, that **leads with the owner's portfolio position at segment/submarket altitude**, generated, previewed, shared via public link, and emailed. One market, one PM persona, one owner portfolio.

**Task 0 (do first — feasibility, report back, do not build the lead yet):**
- **0a. Portfolio resolution.** Can we resolve "the set of units a given PM/owner manages in a market" from Dwellsy data (PM/community identity keyed to listings), or must the Cleveland pilot **seed a defined managed-portfolio set** for one demo owner? Either is acceptable for Phase 1; report which, and if seeded, seed a realistic multi-property Cleveland portfolio.
- **0b. Segment aggregation.** Confirm that aggregating the owner's managed units and the market to segment/submarket (community size where validated, else bedroom + property type + submarket) yields **defensible sample sizes** at the portfolio+segment level. Expect thin-N to largely dissolve versus the single-property attempt. Report the N you get.

**1a. Data model (additive, main schema).**
- `OrganizationBrandProfile` — PM brand: displayName, logoUrl, primaryColor, accentColor, contact fields, websiteUrl.
- `MarketIqReport` — `organizationId`, `marketId`, `periodLabel`, `publicToken @unique`, `status` (draft|published|revoked), `scope` (JSON: the segments/submarkets and the managed-portfolio reference the report covers), `snapshot` (String JSON, immutable once published), `subjectAddress` (nullable — for a drill-down or prospect single-asset mode ONLY, not the organizing primitive), `brandProfileId`, `generatedBy`, `publishedAt`, timestamps.
- `MarketIqReportRecipient` — name, email, kind (client|prospect).
- `MarketIqReportSend` — delivery record mirroring PmBrief delivery fields; wire SendGrid events.
- Additive migration + a Vitest asserting models/relations resolve.

**1b. Report data assembly (server).** New `src/lib/market-iq/report/build.server.ts`. Assemble a `MarketIqReportSnapshot`, sections in order:
  1. **Your portfolio in the market (LEAD).** The owner's managed units aggregated by segment (their observed asking rents/positions, from Dwellsy observations or the seeded pilot set), shown against the market for those same segments, across the owner's submarkets. Frame: "how your portfolio is doing in your market." Show sample sizes; suppress cells too thin to defend. **No operators, no competitors. Not one property.**
  2. **Market conditions (supporting).** Asking-rent trends and the historical listing pulse from `src/lib/market-iq/{trends,historical}.server.ts`, cut to the owner's submarkets/segments. Aggregate conditions only.
  3. **Optional drill-down.** A single segment or, if the PM opts in, a single property (`subjectAddress`) expanded. Never the lead.
  4. **Source & method note:** per-source as-of dates, asking-market caveat, "Market data by Dwellsy IQ" credit.
  Do not invent live-listing figures; carry honest dating.

**1c. PM-facing composer + preview.** Route under `/market-iq` (e.g. `/market-iq/report`), fail-closed. The PM picks the market, period, and the owner/portfolio scope (seeded set for the pilot), sees the report in the **PM's** brand, and Publishes → `MarketIqReport` with immutable snapshot + `publicToken`.

**1d. Owner-facing public page.** New route `/reports/market/[publicToken]` — not the Dwellsy IQ shell. Renders the snapshot in the PM's brand from a no-login token (mirroring `/pm-briefs/[publicToken]`). Small Dwellsy credit only. No competitors.

**1e. PDF.** `src/components/market-iq/report/MarketIqReportPDF.tsx` (reference `OperatorProfilePDF.tsx`), same snapshot, PM-branded.

**1f. Send.** Reuse `src/lib/email/send.ts` to email the link/PDF to a `MarketIqReportRecipient`, from the PM as sender-of-record, PM-branded template (not the Dwellsy `buildMarketIqDigest`). Record a `MarketIqReportSend`; wire SendGrid events.

**Phase 1 Definition of Done:**
- [ ] Task 0 reported (portfolio resolution path + segment N), lead built accordingly.
- [ ] A PM persona generates a Cleveland report that **leads with the owner's portfolio position at segment/submarket altitude**, PM-branded, with **no operator/competitor content and not organized around a single property**.
- [ ] Publishing produces an immutable snapshot + public token; `/reports/market/[token]` renders it with no login, PM-branded, small Dwellsy credit.
- [ ] PM-branded PDF downloads.
- [ ] Report emails to a client and a prospect from the PM as sender; send record + SendGrid events captured.
- [ ] Source dating, sample sizes, and asking-market caveat present; thin cells suppressed.
- [ ] Fail-closed: no `market_iq` product or no Cleveland access → 404, with tests.
- [ ] No existing Operator IQ / Portfolio IQ route or model changed. Vitest green.

### PHASE 2 — PM surface  *(GATE 1 required)*
Separate the PM-facing experience from the owner-facing Operator IQ shell. `OrganizationBrandProfile` settings UI. Recipient/list management.

### PHASE 3 — Mastery + evidence locker
- **Talking-points (PM-only, never sent):** "the 3 things that moved in your market and how to explain them," from the existing narrative generators. No competitors.
- **Drill-down evidence:** one click from any segment claim to the comparable-unit listings behind it, ready to show live.

### PHASE 4 — Recurring + prospect mode
- Repoint the digest/cron machinery to deliver the PM-branded report on a PM-controlled schedule to client/prospect lists (PM sender-of-record).
- **Prospect-pitch variant:** here the single-asset view (`subjectAddress`) is appropriate — the market and rent opportunity for the prospect's building, still no competitors.

### PHASE 5 — Industrialize + price  *(Gates 3, 4)*
- Generate reports for any covered MSA from live pipelines. PM pricing + near-self-serve entitlement (priced on markets + volume; open to every PM in a market). Resale/derivative terms.

---

## 6. Decision gates (do not guess; ask the author)

- **GATE 1 — Brand architecture (blocks Phase 2).** Own PM-facing brand/surface vs the shared Dwellsy IQ shell. Phase 1 does not need it.
- **GATE 2 — Portfolio definition and depth (confirm during Phase 1).** How the owner's managed portfolio is resolved (from Dwellsy data vs seeded/claimed) and how much of it to show. This borders Portfolio IQ; the distinction is that Market IQ's version is **PM-authored, favorably framed, excludes the operator layer**, and is sent by the PM as a service.
- **GATE 3 — Self-serve vs sales-led** (Phase 5).
- **GATE 4 — Live feed prerequisite** (default: ship on trends + dated export now).

---

## 7. First PR to open

After Task 0 is reported: Phase 1a + 1b + 1d as a thin vertical slice — additive models + migration, `report/build.server.ts` assembling a Cleveland snapshot that **leads with the owner's portfolio position across segments/submarkets (no competitors, not a single property)**, and the public `/reports/market/[token]` page rendering it PM-branded from a seeded example portfolio. Prove the shape end-to-end before composer polish, PDF, and send. Production untouched; deploy to a preview.
