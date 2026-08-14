# Market IQ — Corrected Build Brief for Codex (Revision 2)

**Branch:** `codex/market-iq-integration`
**Date:** 2026-08-14 (Revision 2)
**Read this first, in full, before writing code.**

## Revision note — what changed from Revision 1 and why
Revision 1 told you to lead the PM report with an **operator-scape** (a market-level view of who manages/lists in the market, share gainers/losers, etc.) and to reverse the existing "operator teaser only" guardrail. **That was wrong. Reverse that instruction.**

A property manager will **never** put competitor or operator-landscape information in front of their own clients and prospects. PMs do not talk about competitors, even when they compare favorably. And once an owner has hired a PM, the owner is not thinking about the PM landscape until they are considering firing their PM. Surfacing the landscape to a happy owner plants exactly the "maybe I should shop around" thought the PM wants suppressed.

So: **the operator-scape stays OUT of anything owner-facing.** It belongs to the owner products (Operator IQ, Portfolio IQ), which serve the owner at the evaluate-my-PM moment. The existing guardrail ("operator context is a teaser + deep links, never a second scorecard") is **correct** for Market IQ; keep it. The report's differentiator relocates from "who else is in your market" to **"your market and your position in it."**

---

## 1. Mission in one paragraph

Market IQ is the tool a property manager (PM) buys to be the undisputed market expert for the owners they serve and the owners they want to win. The core deliverable is a **PM-branded, sendable market report** that answers the question an owner actually asks: *how are we doing in our market.* Not the competitive field. The PM is the **buyer**. The owner and prospect are the **readers**. Dwellsy stays **backstage** (PM brand on the artifact, at most a small "market data by Dwellsy IQ" credit). What makes the report more than a commodity rent chart is **depth about the owner's own position**: the market read keyed to the owner's actual units, granular to submarket, product type, and community size, on the most complete rental coverage, honestly dated. Only Dwellsy can produce that combination of unit-level identity, rental coverage, and locality.

Test every change against: *does this help a PM look like the expert on THIS OWNER'S market and position, without ever mentioning a competitor?* If not, stop.

---

## 2. What the branch is today, and what must change

- `/market-iq` (`src/app/market-iq/page.tsx` → `src/components/market-iq/ClevelandPilot.tsx`) is a **monitoring dashboard** for whoever holds an entitled login. It is housed in an **owner-first** shell. The only outbound "brief" is **owner → PM** (`PortfolioIqPmBrief`). Everything, including the digest email, is **Dwellsy IQ branded**.
- Four changes: **(1)** split the buyer (PM) from the reader (owner/prospect); **(2)** add a sendable **PM-branded report** as the hero; **(3)** the report **leads with the owner's position in the market** (see Phase 1), never competitors; **(4)** move Dwellsy **backstage / white-label**.
- **Keep** the platform consolidation, the product + market entitlement model, the source-honesty discipline, and the operator "teaser only" guardrail.

---

## 3. Non-negotiable constraints

1. **No competitors, ever, on owner-facing surfaces.** The report, its public page, its PDF, and its emails contain **zero** operator/competitor landscape: no named operators, no share rankings, no "who runs this market," no operator league tables. Operator-derived signals that read purely as *market conditions* (e.g., aggregate concession prevalence, supply, pricing behavior) are acceptable only when they cannot be read as a competitive comparison and never name or rank operators. When in doubt, leave it out.
2. **Additive only.** New Prisma models/migrations only. No altering/dropping existing columns or models. No production mutation. Ship to a Vercel preview.
3. **Do not break Operator IQ or Portfolio IQ.** No renaming/moving stable routes, models, or components.
4. **Fail-closed entitlements.** Every premium read requires both product access (`OrganizationProductAccess`, key `market_iq`) and market access (`OrganizationMarketAccess`). Follow `src/app/market-iq/page.tsx`.
5. **Source honesty is sacred, and it is on the outbound report.** As-of dating, the "asking-market, not occupancy or effective rent" caveat, and no fabricated live feed. This is worded as rigor, and it is what lets the PM defend the numbers.
6. **Dwellsy backstage on anything an owner sees.** PM brand on the report, emails, and public pages. A single small "Market data by Dwellsy IQ" credit is allowed. No Dwellsy IQ headers/logos/"Open Market IQ" CTAs on owner-facing surfaces.
7. **Two Prisma schemas.** Workflow/org/report data → main `prisma/schema.prisma` (client `prisma`). Analytical market data → isolated `prisma/market-iq/schema.prisma` (client `marketIqPrisma`). New report/brand/recipient/delivery models are **workflow data → main schema.**
8. **Tests.** Vitest beside the code. Every new server module gets unit tests; every entitlement gate gets a fail-closed test.
9. **Stack.** Next.js 16 App Router, React 19, TypeScript strict, Prisma, Clerk, SendGrid (`src/lib/email/send.ts`), Vercel Cron, `@react-pdf/renderer` for PDF, shadcn/Base UI/Radix + Tailwind.

**Do NOT:**
- Put operator/competitor landscape in any owner-facing artifact (Constraint 1).
- Add more monitoring/dashboard/watchlist features.
- Collapse buyer and reader into one persona.
- Gate Phase 1 on the brand-architecture decision (Gate 1); build the report first.

---

## 4. Reusable infrastructure (use these, do not reinvent)

| Need | Reuse | Location |
|---|---|---|
| Public-link + email delivery + SendGrid event tracking + recipient fields + status lifecycle | **`PortfolioIqPmBrief`** shape (publicToken, recipientName/Email, deliveryStatus, deliveryProviderId, deliveredAt, lastEmailEventType) and public route `/pm-briefs/[publicToken]` | `prisma/schema.prisma`, `src/lib/portfolio-iq/pm-brief*.ts`, `src/app/pm-briefs/[publicToken]` |
| PDF generation | `@react-pdf/renderer` | reference `src/components/scorecard/OperatorProfilePDF.tsx` |
| Email compose + send | SendGrid wrapper + layout | `src/lib/email/send.ts`, `src/lib/email/layout.ts`, events `src/lib/email/sendgrid-events*` |
| Scheduled delivery | Vercel Cron | `src/app/api/cron/*`, existing `src/app/api/market-iq/digest` |
| Entitlement gates | product + market access helpers | `src/lib/auth/product-entitlements(.server).ts`, `src/lib/auth/market-entitlements.server.ts` |
| Market trends / listings data for the market read | isolated analytical client | `marketIqPrisma`, `src/lib/market-iq/{trends,historical}*.ts` |
| Subject-property "your position" benchmark (owner's or prospect's building vs market) | Dwellsy IQ comp capability, IF reachable from this codebase | assess in Phase 1 Task 0; if not reachable, fall back to segment-level position and flag |

**Note:** `PM` / `CanonicalOperator` / `OperatorSnapshot` (the operator data) are **not** for the Market IQ outbound report. They remain the basis of the owner-facing Operator IQ product. Do not surface them in Market IQ owner-facing output.

---

## 5. Build sequence

Phases are ordered to de-risk the business thesis fastest. **Phase 1 is the whole bet.** Do not start a later phase before the prior one meets its Definition of Done.

### PHASE 1 — Prove the hero artifact on one market (Cleveland)

Goal: a Cleveland market report, **PM-branded**, that **leads with the owner's position in the market** and can be generated, previewed, shared via public link, and emailed. One market, one PM persona, one artifact.

**Task 0 (do this first — feasibility, report back, do not build yet).** Determine whether a **subject-property benchmark** is reachable in this codebase: given a single address (the owner's asset or a prospect's building), can we produce a market-relative read for it (is its rent at / above / below market for its submarket, product type, and community size), using data available to this repo (comp capability and/or `MarketIqListing` + trends)? Report what is reachable. If a true subject-property benchmark is not reachable, Phase 1 falls back to a **segment-level position** (the granular market read cut so an owner can locate their own units in it) and we add the subject benchmark later. **Stop and report before building the lead section.**

**1a. Data model (additive, main schema).**
- `OrganizationBrandProfile` — per-org PM brand: displayName, logoUrl, primaryColor, accentColor, contactName, contactEmail, contactPhone, websiteUrl.
- `MarketIqReport` — a generated report: `organizationId`, `marketId`, `periodLabel`, `publicToken @unique`, `status` (draft | published | revoked), `snapshot` (String JSON, immutable once published, mirroring `PortfolioIqPmBrief.snapshot`), `subjectAddress` (nullable, for the "your position" section), `brandProfileId`, `generatedBy`, `publishedAt`, timestamps.
- `MarketIqReportRecipient` — name, email, kind (client | prospect).
- `MarketIqReportSend` — delivery record mirroring PmBrief delivery fields; wire SendGrid events through existing ingest.
- Additive migration + a Vitest asserting models/relations resolve.

**1b. Report data assembly (server).** New `src/lib/market-iq/report/build.server.ts`. Assemble a `MarketIqReportSnapshot` with sections in this order:
  1. **Your position (LEAD SECTION).** Either the subject-property benchmark (if Task 0 says reachable) or the segment-level position: the market read cut to the owner's relevant submarket(s), product type, and **community size** (SFR / small multi 2–99 / large multi 100+), so the reader sees where their own units sit. Frame: "how you are doing in your market." **No operators, no competitors.**
  2. **Market conditions (supporting).** Asking-rent trends and the historical listing pulse already produced by `src/lib/market-iq/{trends,historical}.server.ts`. Reuse; do not duplicate. Aggregate market conditions only.
  3. **Source & method note:** per-source as-of dates, the asking-market caveat, the "Market data by Dwellsy IQ" credit.
  Do not invent live-listing figures while the feed is paused; carry honest dating.

**1c. PM-facing report composer + preview.** Route under `/market-iq` (e.g. `/market-iq/report`), fail-closed. The PM picks market + period, optionally enters a subject address, sees the report rendered in the **PM's** brand (`OrganizationBrandProfile`), and Publishes. Publishing writes a `MarketIqReport` with immutable snapshot + `publicToken`.

**1d. Owner-facing public report page.** New route `/reports/market/[publicToken]` — **not** the Dwellsy IQ shell. Renders the snapshot in the PM's brand from a no-login token (mirroring `/pm-briefs/[publicToken]`). Small Dwellsy provenance credit only. **No competitors on this page.**

**1e. PDF.** `@react-pdf/renderer` component `src/components/market-iq/report/MarketIqReportPDF.tsx` (reference `OperatorProfilePDF.tsx`), same snapshot, PM-branded.

**1f. Send.** Reuse `src/lib/email/send.ts` to email the public link and/or PDF to a `MarketIqReportRecipient`, **from the PM as sender-of-record**, PM-branded template (new template, not the Dwellsy `buildMarketIqDigest`). Record a `MarketIqReportSend`; wire SendGrid events.

**Phase 1 Definition of Done:**
- [ ] Task 0 feasibility reported and the lead section built accordingly (subject benchmark or segment-level position).
- [ ] A PM persona generates a Cleveland report that **leads with the owner's position**, PM-branded, with **no operator/competitor content anywhere**.
- [ ] Publishing produces an immutable snapshot + public token; `/reports/market/[token]` renders it with no login, PM-branded, small Dwellsy credit.
- [ ] A PM-branded PDF of the same snapshot downloads.
- [ ] The report emails to a client and a prospect from the PM as sender; send record + SendGrid events captured.
- [ ] Source dating + asking-market caveat on the report.
- [ ] Fail-closed: no `market_iq` product or no Cleveland access → 404, with tests.
- [ ] No existing Operator IQ / Portfolio IQ route or model changed. Vitest green.

### PHASE 2 — Wrap it in the PM surface  *(GATE 1 required)*
Separate the PM-facing experience from the owner-facing Operator IQ shell so a PM never sees the "grade your PM" framing. `OrganizationBrandProfile` settings UI. Recipient/list management (clients vs prospects).

### PHASE 3 — Mastery + evidence locker
- **Talking-points layer (PM-only, never sent):** "the 3 things that moved in your market and how to explain them," derived from the existing `decisionRead`/signal narrative generators, rewritten as *what to say*. No competitors.
- **Drill-down evidence:** one click from any market claim to the specific listings/comps behind it (the owner's/subject segment), ready to show live when the client presses. Comps of *comparable units*, not operators.

### PHASE 4 — Recurring + prospect mode
- Repoint the digest/cron machinery to deliver the **PM-branded report** on a PM-controlled schedule to the PM's client/prospect lists (PM sender-of-record). Reuse `src/app/api/cron/*` patterns; payload is the branded report.
- **Prospect-pitch variant:** the report pointed at a prospect's own building (market + rent opportunity for that asset), still **no competitors**.

### PHASE 5 — Industrialize + price  *(Gates 3, 4 inform this)*
- Generate reports for any covered MSA from live pipelines (no hand-seeded data).
- PM pricing/packaging + near-self-serve entitlement (priced on markets + report volume; open to every PM in a market).
- Market-IQ-specific resale/derivative terms protecting the underlying data.

---

## 6. Decision gates (do not guess; ask the author)

- **GATE 1 — Brand architecture (blocks Phase 2).** Own PM-facing brand/surface, or the shared Dwellsy IQ shell? Phase 1 does not need this; the artifact is PM-branded regardless.
- **GATE 2 — How much of the owner's own assets to include (confirm during Phase 1).** The "your position" section borders Portfolio IQ. The distinction: this is **PM-authored, favorably framed, and excludes the operator layer**, sent by the PM as a service. Default for Phase 1: subject-property or segment-level position on the owner's/prospect's own units only. Confirm before widening toward full portfolio benchmarking.
- **GATE 3 — Self-serve vs sales-led** (Phase 5 entitlement motion).
- **GATE 4 — Live feed prerequisite** (ship on trends + dated export now, default yes).

---

## 7. First PR to open

After Task 0 is reported: Phase 1a + 1b + 1d as a thin vertical slice — the additive models + migration, `report/build.server.ts` assembling a Cleveland snapshot that **leads with the owner's position (no competitors)**, and the unbranded-by-Dwellsy public `/reports/market/[token]` page rendering it PM-branded from a seeded example. Prove the shape end-to-end before composer polish, PDF, and send. Production untouched; deploy to a preview.
