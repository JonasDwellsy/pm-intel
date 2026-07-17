# Marketing Reframe — "Select · Screen · Monitor" + Operator IQ brand hierarchy — Design

**Date:** 2026-07-17
**Status:** Approved (design + all decisions); user said "please proceed"
**Author:** Jonas + Claude
**Origin:** Jonas — "This is a property manager selection, screening and monitoring tool. Let's get sharp on that."

## Problem

The public marketing copy leads with **how we measure** (hero: "Outside-in intelligence on property managers nationwide"; main section = four measurement lenses). It describes what's in the box, not the **job the customer is doing**. Two fixes:

1. **Positioning:** reframe the homepage around the three jobs — **Select, Screen, Monitor** property managers — with the measurement methodology repositioned as the *proof* underneath.
2. **Brand hierarchy (wrong today):** the copy uses **"Dwellsy IQ"** as the product name ("Dwellsy IQ — Property Manager Intelligence"). Per Jonas, **Dwellsy IQ is Dwellsy's B2B umbrella brand** (suite: Total IQ, API IQ, Comp IQ, Trend IQ, and this one); **this product is Operator IQ**. Copy must reflect that hierarchy: **Operator IQ** = product name; **Dwellsy IQ** = umbrella attribution only.

## Scope (per approved decisions)

- **Homepage narrative reframe ("reframe the spine")** — new hero, a new Select/Screen/Monitor section, methodology pillars repositioned as proof, homepage metadata.
- **Brand-hierarchy fix — site-wide** (a half-applied rename is worse than none): product-naming instances of "Dwellsy IQ" → "Operator IQ" across all public surfaces, with umbrella/company/data-source instances preserved.
- **CTA vs invite-only alignment** — lead prospects with "Request access", keep "Build a watch list" for signed-in users.
- **Footer** — drop "Confidential · For institutional use only" from public surfaces; add "A Dwellsy IQ product" attribution.

Out of scope: no narrative rewrites of secondary pages (they get only the brand-name touch); no changes to methodology substance, data, or product behavior; the repeated "top-200 markets on request" line stays.

## Brand naming rule (the decision table for every "Dwellsy IQ" instance)

- **Names THE PRODUCT** (the thing the user uses / that produces scorecards) → **"Operator IQ"**.
- **Umbrella / suite attribution** ("part of Dwellsy IQ", "A Dwellsy IQ product") → **keep "Dwellsy IQ"**.
- **Marketplace data source / company** ("Dwellsy listing record", "Dwellsy's", "Dwellsy, Inc.") → **keep "Dwellsy"** (never "Dwellsy IQ").
- **Logo lockups / aria** → keep the Dwellsy IQ mark as umbrella + "Operator IQ" as the product label.

## Final copy — homepage (the spine)

### Hero (`src/components/homepage/Hero.tsx`)
- **Eyebrow:** `Operator IQ · part of Dwellsy IQ`
- **H1:** `Select, screen, and monitor property managers.`
- **Subhead:** `Operator IQ turns Dwellsy's nationwide listing record into observed, reproducible scorecards on 20,000+ property managers — so you can shortlist the right operator, vet it before you sign, and get alerted the moment performance moves. Every figure is measured, not self-reported.`
- **CTAs (reordered for a prospect-first funnel):**
  - Primary: `Request access →` → `mailto:sales@dwellsy.com?subject=Operator%20IQ%20access` (keep `TrackedLink`, analytics `cta: "request_access"`).
  - Secondary: `See a full sample scorecard →` → `/sample`.
  - Tertiary: `Browse markets →` → `/property-managers`.
  - (Removes "Build a watch list" from the hero — it stays the signed-in in-product CTA.)
- **Trust line:** unchanged (`Methodology … · Design … · {n} markets live · Any top-200 US market on request.`).

### New section — Select · Screen · Monitor (new `src/components/homepage/SelectScreenMonitor.tsx`, rendered in `page.tsx` between `<Hero>` and `<MethodologyPillars>`)
- **Eyebrow:** `What it's for`
- **H2:** `Three jobs. One operator record.`
- **Three cards** (reuse the visual pattern of `MethodologyPillars` cards):
  - **Select — Find the right operator.** `Search 20,000+ managers by market, size, and type, compare them head-to-head, and build a shortlist watch list — so you start from the operators that actually fit.` · link `Browse markets →` → `/property-managers`
  - **Screen — Vet before you sign.** `Pull a full scorecard on any operator — scale, type, operating signals, and footprint — every figure observed from the listing record, so due diligence takes minutes, not weeks.` · link `See a sample scorecard →` → `/sample`
  - **Monitor — Watch what changes.** `Track the operators you care about. Monthly change alerts flag rent, retention, and lease-up moves as they happen — so a slipping manager or a shifting target never surprises you.` · link `Build a watch list →` → `/watch-lists/new`

### Methodology pillars repositioned (`src/components/homepage/MethodologyPillars.tsx`)
- **Eyebrow:** `What we measure` → `The rigor behind it`
- **H2:** `Four lenses on every operator, mapped to the questions that actually matter.` → `How every score is measured.`
- Context paragraph and the four pillar cards (Scale / Type / Operating signals / Footprint): **unchanged** — they now read as the proof under "Screen".

### Other homepage components (brand-name touch only)
- `MethodologyFooter.tsx`: `…produced on Dwellsy IQ…` → `…produced in Operator IQ…`
- `CoveredMarkets.tsx`: `markets currently live on Dwellsy IQ.` → `markets currently live in Operator IQ.`
- `SampleScorecards.tsx`: no product-name instance; leave.

### Homepage metadata (`src/app/page.tsx`)
- **title:** `Operator IQ — Select, screen & monitor property managers`
- **description** (and `openGraph.description`): `Select, screen, and monitor property managers. Operator IQ turns Dwellsy's nationwide listing record into observed, reproducible scorecards on 20,000+ property managers — shortlist the right operator, vet it before you sign, and get alerted when performance moves.`
- **openGraph.title:** `Operator IQ — Select, screen & monitor property managers`

## Final copy — global chrome + metadata

### Root metadata (`src/app/layout.tsx`)
- **title.default:** `Operator IQ — Select, screen & monitor property managers`
- **title.template:** `%s · Operator IQ`
- **description:** `Operator IQ helps institutional teams select, screen, and monitor property managers — observed, reproducible scorecards on 20,000+ operators across U.S. rental markets. Part of Dwellsy IQ.`

### Site header (`src/components/layout/SiteHeader.tsx`)
- Signed-out CTA `Contact sales` → `Request access →` (`mailto:sales@dwellsy.com?subject=Operator%20IQ%20access`).
- Signed-in CTA `Build a watch list →` — unchanged.
- Logo lockup ([Dwellsy IQ mark] · "Operator IQ") and aria `Dwellsy IQ — Operator IQ` — unchanged (already correct umbrella+product).

### Site footer (`src/components/layout/SiteFooter.tsx`)
- Trust line: drop `· Confidential · For institutional use only` → `Methodology {v} · Design {v}`.
- Add umbrella attribution: a muted line `A Dwellsy IQ product` in the brand lockup block (near the "Operator IQ" sub-label).
- `© {year} Dwellsy, Inc.` — unchanged.

### OpenGraph image (`src/app/property-managers/[state]/[city]/[slug]/opengraph-image.tsx`)
- Eyebrow text `Property Manager Scorecard` prefixed by the product: render `Operator IQ · Property Manager Scorecard` (keep the Dwellsy IQ mark as umbrella if present).
- Branded fallback subtitle `Property manager intelligence` → `Select, screen & monitor property managers`.
- `alt` `Dwellsy IQ scorecard preview` → `Operator IQ scorecard preview`.

## Final copy — secondary pages (brand-name touch only, per the decision table)

- `src/app/property-managers/page.tsx`: title `All markets — Dwellsy IQ` → `All markets` (template appends `· Operator IQ`). Body/H1 unchanged.
- `src/app/methodology/page.tsx`: title `Methodology` (unchanged; template now yields `Methodology · Operator IQ`). Any body instance that names the **product** "Dwellsy IQ" → "Operator IQ"; keep "Dwellsy listing record". H1 "How we measure property managers." unchanged.
- `src/app/methodology/portfolio-estimator/page.tsx`: title `… — Dwellsy IQ Methodology` → `… — Operator IQ Methodology`; body `Dwellsy IQ observes only listing activity` → `Operator IQ observes only listing activity`.
- `src/app/briefs/page.tsx`: eyebrow `Dwellsy IQ research` → `Operator IQ research`; intro + description `Dwellsy IQ's … covered markets` → `Operator IQ's … covered markets`.
- `src/app/sample/page.tsx`: metadata `Sample scorecard — Dwellsy IQ` → `Sample scorecard` (template); body `every Dwellsy IQ operator profile` / `example Dwellsy IQ operator scorecard` → `Operator IQ`. CTAs: primary `Build a watch list →` → `Request access →` (sales mailto); secondary `Browse markets →` (unchanged).
- `src/app/ask/page.tsx` + `AskChat.tsx`: `Ask Dwellsy IQ` → `Ask Operator IQ`; ask description's stale `Dwellsy IQ's 10 covered markets` → `Operator IQ's covered markets` (drop the stale hard-coded count).
- `src/app/privacy/page.tsx`: title `Privacy — Dwellsy IQ` → `Privacy` (template); body product instances `Dwellsy IQ is an institutional intelligence product` / `Access to Dwellsy IQ` / `operate Dwellsy IQ` → "Operator IQ"; keep `Dwellsy's company-wide Privacy Policy` and `Dwellsy, Inc.`
- `src/app/sign-up/[[...sign-up]]/page.tsx` (contact-sales): already product-named "Operator IQ"; keep. Logo `alt="Dwellsy IQ"` (umbrella) — keep.

**Safety net:** after edits, `grep -rn "Dwellsy IQ" src` and confirm every remaining instance is intentional umbrella/attribution (never product-naming). Also confirm `nav.ts` `PRIMARY_CTA` ("Build a watch list") is untouched (still used by signed-in chrome).

## Testing / verification

No copy test harness exists; verification is:
- `npx tsc --noEmit` clean; `npm run test:watch-list` + `npm run test:components` still green (no logic touched).
- **Grep audits:** no product-naming "Dwellsy IQ" remains (only umbrella/company/data-source); the old hero eyebrow/H1 strings are gone; no "Confidential · For institutional use only" on public surfaces.
- **Live browser preview (homepage is public — no auth needed):** render `/`, confirm the new hero (eyebrow/H1/subhead/CTAs), the Select·Screen·Monitor section, and the repositioned methodology section; check dark mode + mobile width; screenshot as proof.

## Rollout

Copy-only; additive (one new component) + string edits. No schema/data/behavior change. Ships on deploy.

## Deferred / not doing

- Full narrative rewrites of /methodology, /property-managers, /briefs, /sample (scope = homepage spine + brand fix only).
- De-duplicating the thrice-repeated "top-200 markets on request" line.
- Any new nav item for the Select/Screen/Monitor sections.
