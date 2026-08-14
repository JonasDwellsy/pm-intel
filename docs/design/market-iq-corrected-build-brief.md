# Market IQ — Build Brief for Codex (Revision 4, concept locked)

**Branch:** `codex/market-iq-integration`
**Date:** 2026-08-14 (Revision 4)
**Read this first, in full, before writing code.**

## Revision history — how we got here
- **R1 (wrong):** led with an operator-scape. PMs never show competitors to clients/prospects.
- **R2 (wrong altitude):** framed "your position" as a single-property comp benchmark. That is the comp-report product (CompIQ shape, already failed standalone) and walks into thin-N.
- **R3 (wrong direction):** led with the owner's portfolio positioned against the market. Killed because auto-generated claims about the owner's own performance carry real wrong-risk, and a wrong number in the PM's mouth to their client does more damage than a good report earns.
- **R4 (this doc, locked):** the outbound report is a **read on the market**. No competitors. No auto-generated owner-specific performance scoring. The report synthesizes three Dwellsy engines into a PM-branded local market read. Owner-specific positioning, if it exists at all, is the PM's private prep, never auto-published.

---

## 1. Mission in one paragraph

Market IQ is the tool a property manager buys to be the market expert for the owners they serve and the owners they want to win. The outbound deliverable is a **PM-branded, recurring, local market read**: what is happening with rents, supply, and demand in the submarkets and segments where the owner operates. It answers the owner's real question, "what is happening in our market," and it positions the PM as the person who understands it. It does **not** score the owner's own units, and it never mentions a competitor. The PM is the **buyer**; the owner and prospect are the **readers**. Dwellsy stays **backstage** (PM brand on the artifact, small "market data by Dwellsy IQ" credit).

**Differentiation (two sides of one wedge):** the read is built for **SFR and small multifamily**, the segment the incumbents cannot cover well because it is diffuse, and it is **correct where they model and miss**, because every number stands on observed listing data rather than a survey or a model. The category reframe is "the correct local market, where everyone else is guessing." **ICP: SFR and small-multi property managers.** The engine serves any PM, but the differentiation is sharpest here, so sell here first.

**Data engines the read is built from:**
- **Total IQ** — the ground truth. Listing-level observed rental data (SFR + multifamily, national), refreshed on cadence. The coverage-and-correctness substrate.
- **Comp engine(s)** — accurate local rent levels. Used **aggregated to submarket/segment for the report**; address-level comps are reserved for the PM's private prep and the prospect single-asset pitch, never auto-published in the market read.
- **Trends** — local (submarket/city/ZIP) rent trajectory.

Test every change against: *does this help the PM be the authority on their local market, using observed data we can prove is right, without scoring the owner and without naming a competitor?* If not, stop.

---

## 2. What the branch is today, and what must change

- `/market-iq` (`src/app/market-iq/page.tsx` → `ClevelandPilot.tsx`) is a monitoring dashboard for the logged-in user, inside an owner-first shell, Dwellsy-branded, with only an owner→PM brief mechanism.
- Its Trends + historical listing pulse are the right raw material and are **reusable**. The reshape: **(1)** split buyer (PM) from reader (owner/prospect); **(2)** produce a sendable **PM-branded local market read** as the hero; **(3)** build the read from Total IQ + comps + Trends, lead with the market (not the owner's units, not operators); **(4)** Dwellsy backstage / white-label; **(5)** make correctness visible (observed listings, sample sizes, dates).

---

## 3. Non-negotiable constraints

1. **It is a market read.** No auto-generated scoring of the owner's own portfolio or units on the outbound artifact. Owner-specific analysis is the PM's private prep only.
2. **No competitors, ever, on owner-facing surfaces.** No named operators, no share, no "who runs this market." Operator data stays in the owner products.
3. **Correctness is the brand promise, so it must be true and visible.** Every published number carries observed provenance: sample size, as-of date, "observed, not modeled." Suppress any cell too thin to defend rather than printing a fragile number. **The Acadian community-size conflict (export said 1 unit, production said 178) is the class of error that, if it reaches a client report branded "the correct one," destroys the positioning. Resolving that class of conflict is existential, not backlog.**
4. **Aggregate in the artifact, address-level only in prep.** The comp engine feeds the report only as submarket/segment aggregates. Address-level comps live in the PM's private prep and the prospect mode.
5. **Additive only.** New Prisma models/migrations. No altering/dropping existing models. No production mutation. Ship to a Vercel preview. Do not depend on the production connector from preview.
6. **Do not break Operator IQ or Portfolio IQ.** No renaming/moving stable routes or models.
7. **Fail-closed entitlements.** Product access (`OrganizationProductAccess`, key `market_iq`) + market access (`OrganizationMarketAccess`). Follow `src/app/market-iq/page.tsx`.
8. **Dwellsy backstage.** PM brand on report, emails, public pages. Small "Market data by Dwellsy IQ" credit only.
9. **Two Prisma schemas.** Workflow/org/report → main `prisma/schema.prisma` (`prisma`). Analytical (listings/trends/alerts) → isolated `prisma/market-iq/schema.prisma` (`marketIqPrisma`).
10. **Tests.** Vitest beside code; fail-closed tests on entitlement gates.
11. **Stack.** Next.js 16 App Router, React 19, TypeScript strict, Prisma, Clerk, SendGrid (`src/lib/email/send.ts`), Vercel Cron, `@react-pdf/renderer`, shadcn/Base UI/Radix + Tailwind.

**Do NOT:** score the owner's units on the page (Constraint 1); name competitors (Constraint 2); publish fragile/unverified numbers (Constraint 3); organize the read around a single property; add monitoring features; gate Phase 1 on brand-architecture (Gate 1).

---

## 4. Reusable infrastructure

| Need | Reuse | Location |
|---|---|---|
| Public-link + email delivery + SendGrid event tracking + recipient/status lifecycle | `PortfolioIqPmBrief` shape + `/pm-briefs/[publicToken]` | `prisma/schema.prisma`, `src/lib/portfolio-iq/pm-brief*.ts`, `src/app/pm-briefs/[publicToken]` |
| PDF | `@react-pdf/renderer` | reference `src/components/scorecard/OperatorProfilePDF.tsx` |
| Email compose + send | SendGrid wrapper + layout | `src/lib/email/send.ts`, `src/lib/email/layout.ts`, `sendgrid-events*` |
| Scheduled delivery | Vercel Cron | `src/app/api/cron/*` |
| Entitlement gates | product + market access helpers | `src/lib/auth/product-entitlements(.server).ts`, `market-entitlements.server.ts` |
| Total IQ (listing-level observed data) | landed analytical data | `marketIqPrisma`, `MarketIqListing`, `src/lib/market-iq/historical*.ts` |
| Trends (local trajectory) | trend engine | `src/lib/market-iq/trends*.ts`, `MarketIqTrendObservation` |
| Comp engine (address-level, later; prep/prospect only) | production comp system / Portfolio IQ comp machinery | assess reachability in Task 0; not required for the Phase 1 aggregate read |

---

## 5. Build sequence

**Phase 1 is the whole bet.**

### PHASE 1 — Prove the hero: a PM-branded local market read on Cleveland

Goal: a Cleveland market read, PM-branded, built from Total IQ + Trends aggregated to the submarkets and segments a PM cares about (SFR and small-multi emphasis), with visible correctness, that a PM can generate, preview, share via public link, and email.

**Task 0 (feasibility first, report back, do not build the lead yet):**
- **0a. Engine reach.** Confirm what Total IQ (listing-level) and Trends data are reachable in-app for Cleveland via `marketIqPrisma` (coverage, cadence/recency, SFR vs multifamily breakdown). Confirm the comp engine's reachability but treat it as **not required** for the Phase 1 aggregate read (aggregate rent levels can be computed from Total IQ listings).
- **0b. Segment integrity.** Confirm community-size / segment classification is reliable enough to cut the read by SFR / small multi / large multi. Where it conflicts (the Acadian class), mark unavailable, never infer. Report the sample sizes you get per submarket/segment.

**1a. Data model (additive, main schema).**
- `OrganizationBrandProfile` — PM brand fields.
- `MarketIqReport` — `organizationId`, `marketId`, `periodLabel`, `publicToken @unique`, `status`, `scope` (JSON: submarkets + segments covered), `snapshot` (immutable JSON once published), `brandProfileId`, `generatedBy`, `publishedAt`, timestamps. (`subjectAddress` nullable, reserved for the later prospect single-asset mode only.)
- `MarketIqReportRecipient` (name, email, kind client|prospect); `MarketIqReportSend` (delivery record; wire SendGrid events).
- Additive migration + Vitest.

**1b. Report assembly (server).** `src/lib/market-iq/report/build.server.ts` produces a `MarketIqReportSnapshot`, sections in order:
  1. **Market read (LEAD).** For the report's submarkets and segments (SFR / small multi where reliable, plus bedroom/product type): current rent **level** (median asking rent, rent/sf) from Total IQ aggregation, and the **trajectory** from Trends. Every figure shows sample size and as-of date. This is the market, not the owner's units.
  2. **Conditions & the so-what.** Supply and listing velocity (new listings, DOM) for those submarkets, plus a defensible **market narrative** (what is moving and why), market-level only.
  3. **Why this is right (correctness spine).** A visible, plain statement that these are observed listings, with counts and dates, contrasting implicitly with modeled/survey data. This is a differentiator, not fine print.
  4. **Source & method note.** As-of dates, asking-market caveat, "Market data by Dwellsy IQ" credit.

**1c. PM composer + preview.** Route under `/market-iq` (e.g. `/market-iq/report`), fail-closed. PM picks market, period, submarkets/segments; sees the read in the PM's brand; Publishes → `MarketIqReport` with immutable snapshot + token.

**1d. Owner-facing public page.** `/reports/market/[publicToken]` — not the Dwellsy shell. Renders the snapshot in the PM's brand from a no-login token. Small Dwellsy credit. No competitors, no owner scoring.

**1e. PDF.** `src/components/market-iq/report/MarketIqReportPDF.tsx`, same snapshot, PM-branded.

**1f. Send.** `src/lib/email/send.ts` to email the link/PDF to a recipient, from the PM as sender-of-record, PM-branded template. Record `MarketIqReportSend`; wire SendGrid events.

**Phase 1 Definition of Done:**
- [ ] Task 0 reported (engine reach + segment integrity + sample sizes).
- [ ] A PM persona generates a Cleveland **market read**, PM-branded, leading with local rent level + trajectory by submarket/segment, with **visible sample sizes and dates, no owner scoring, no competitors**.
- [ ] Thin cells suppressed; segment shown only where classification is reliable.
- [ ] Publish → immutable snapshot + token; `/reports/market/[token]` renders no-login, PM-branded, small Dwellsy credit.
- [ ] PM-branded PDF downloads; report emails to a client and a prospect from the PM as sender; send record + events captured.
- [ ] Fail-closed tests; no existing Operator IQ / Portfolio IQ route or model changed; Vitest green.

### PHASE 2 — PM surface  *(GATE 1)*  Separate PM experience from the owner-facing shell; brand settings; recipient/list management.

### PHASE 3 — Mastery + prep (PM-only)  The PM's private layer: talking points ("what moved and why"), and — reserved here, not in the outbound read — any owner-specific positioning the PM chooses to look at, using address-level comps. Never auto-published.

### PHASE 4 — Recurring + prospect mode  Repoint cron to deliver the PM-branded read on a PM-controlled schedule to client/prospect lists (PM sender-of-record). Prospect single-asset mode (the one place `subjectAddress` and address-level comps belong in an outbound artifact), still no competitors.

### PHASE 5 — Industrialize + price  *(Gates 3, 4)*  Any covered MSA from live pipelines; PM pricing + near-self-serve entitlement; resale/derivative terms protecting the data.

---

## 6. Decision gates (do not guess)
- **GATE 1 — Brand architecture (blocks Phase 2):** own PM-facing brand/surface vs shared Dwellsy shell. Phase 1 does not need it.
- **GATE 2 — Correctness display:** how loudly the report advertises "observed, not modeled" (default: visible spine per 1b.3).
- **GATE 3 — Self-serve vs sales-led.**  **GATE 4 — Live feed prerequisite** (default: ship on Total IQ + Trends with honest dating).

---

## 7. First PR to open
After Task 0: Phase 1a + 1b + 1d as a thin vertical slice — additive models + migration, `report/build.server.ts` assembling a Cleveland **market read** (level from Total IQ aggregation + trajectory from Trends, with sample sizes and dates, no owner scoring, no competitors), and the public `/reports/market/[token]` page rendering it PM-branded. Prove the shape end-to-end before composer polish, PDF, and send. Production untouched; deploy to a preview.
