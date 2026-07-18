# Marketing Reframe (Select · Screen · Monitor) + Operator IQ Brand — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe the homepage marketing around "Select · Screen · Monitor property managers," reposition the methodology as proof, and fix the brand hierarchy site-wide (Operator IQ = product; Dwellsy IQ = umbrella).

**Architecture:** Pure copy + one new presentational component. No data, schema, or behavior changes. Edits are exact string swaps plus a new `SelectScreenMonitor` homepage section modeled on the existing `MethodologyPillars`.

**Tech Stack:** Next.js 16 / React 19, Tailwind, TypeScript. Copy lives in page metadata exports, homepage components (`src/components/homepage/*`), layout chrome (`src/components/layout/*`), and per-page `metadata` exports.

## Global Constraints

- **Brand naming rule (apply to EVERY "Dwellsy IQ" instance touched):**
  - Names THE PRODUCT (the thing that produces scorecards / that the user uses) → **"Operator IQ"**.
  - Umbrella / suite attribution ("part of Dwellsy IQ", "A Dwellsy IQ product") → **keep "Dwellsy IQ"**.
  - Marketplace data source / company ("Dwellsy listing record", "Dwellsy's", "Dwellsy, Inc.") → **keep "Dwellsy"** (never "Dwellsy IQ").
  - Logo lockups / OG wordmark → keep the Dwellsy IQ mark as umbrella; name the product "Operator IQ" in adjacent text.
- **Do NOT change `PRIMARY_CTA` in `src/lib/nav.ts`** ("Build a watch list →") — still used by signed-in chrome. Only the marketing hero + signed-out header CTA change to "Request access".
- **Preserve the "20,000+ property managers" figure** (Jonas: correct as the nationwide target range).
- **No logic changes** — copy + one new static component only. `test:watch-list` + `test:components` must stay green (they don't cover copy, but must not break).
- **Verification is grep + tsc + live homepage preview** (there is no copy test harness). After edits, `grep -rn "Dwellsy IQ" src` and confirm every remaining hit is intentional umbrella/company/data-source usage (never product-naming).
- Exact copy strings are authoritative — transcribe them verbatim (curly punctuation and em dashes as written).

---

## File Structure

- **Create** `src/components/homepage/SelectScreenMonitor.tsx` — new "Select · Screen · Monitor" section (Task 1).
- **Modify** `src/components/homepage/Hero.tsx` — eyebrow, H1, subhead, CTAs (Task 1).
- **Modify** `src/app/page.tsx` — render the new section + homepage metadata (Task 1).
- **Modify** `src/components/homepage/MethodologyPillars.tsx` — section-head reframe (Task 1).
- **Modify** `src/components/homepage/MethodologyFooter.tsx`, `CoveredMarkets.tsx` — brand-name touch (Task 1).
- **Modify** `src/app/layout.tsx` — root metadata (Task 2).
- **Modify** `src/components/layout/SiteHeader.tsx`, `SiteFooter.tsx` — CTA + footer line/attribution (Task 2).
- **Modify** `src/app/property-managers/[state]/[city]/[slug]/opengraph-image.tsx` — OG text (Task 2).
- **Modify** `src/app/property-managers/page.tsx`, `methodology/page.tsx`, `methodology/portfolio-estimator/page.tsx`, `briefs/page.tsx`, `sample/page.tsx`, `ask/page.tsx`, `ask/AskChat.tsx`, `privacy/page.tsx` — brand-name sweep (Task 3).

---

## Task 1: Homepage narrative reframe (the spine)

**Files:**
- Create: `src/components/homepage/SelectScreenMonitor.tsx`
- Modify: `src/components/homepage/Hero.tsx`, `src/app/page.tsx`, `src/components/homepage/MethodologyPillars.tsx`, `src/components/homepage/MethodologyFooter.tsx`, `src/components/homepage/CoveredMarkets.tsx`

- [ ] **Step 1: Create the `SelectScreenMonitor` section**

Create `src/components/homepage/SelectScreenMonitor.tsx` (modeled on `MethodologyPillars.tsx`, using the shared `HomepageSectionHead`):

```tsx
import Link from "next/link";
import { HomepageSectionHead } from "./SectionHead";

// The "what it's for" section — the three jobs Operator IQ does, mapped to
// the product surfaces that do them. Sits directly under the hero and above
// MethodologyPillars (which now reads as the proof beneath "Screen").

type UseCase = {
  eyebrow: string;
  title: string;
  description: string;
  linkLabel: string;
  href: string;
};

const USE_CASES: UseCase[] = [
  {
    eyebrow: "Select",
    title: "Find the right operator.",
    description:
      "Search 20,000+ managers by market, size, and type, compare them head-to-head, and build a shortlist watch list — so you start from the operators that actually fit.",
    linkLabel: "Browse markets →",
    href: "/property-managers",
  },
  {
    eyebrow: "Screen",
    title: "Vet before you sign.",
    description:
      "Pull a full scorecard on any operator — scale, type, operating signals, and footprint — every figure observed from the listing record, so due diligence takes minutes, not weeks.",
    linkLabel: "See a sample scorecard →",
    href: "/sample",
  },
  {
    eyebrow: "Monitor",
    title: "Watch what changes.",
    description:
      "Track the operators you care about. Monthly change alerts flag rent, retention, and lease-up moves as they happen — so a slipping manager or a shifting target never surprises you.",
    linkLabel: "Build a watch list →",
    href: "/watch-lists/new",
  },
];

export function SelectScreenMonitor() {
  return (
    <section className="border-t border-grid">
      <div className="mx-auto max-w-[1280px] px-6 py-20 sm:px-16 lg:py-28">
        <HomepageSectionHead
          eyebrow="What it's for"
          title="Three jobs. One operator record."
          context="From first shortlist to ongoing oversight — every operator on one observed, always-current record."
        />
        <div className="grid gap-6 md:grid-cols-3">
          {USE_CASES.map((u) => (
            <div
              key={u.eyebrow}
              className="group flex min-h-[300px] flex-col rounded-md border border-grid bg-white p-7 transition-all duration-[180ms] hover:-translate-y-0.5 hover:border-navy hover:shadow-[0_8px_24px_rgb(15_31_63_/_0.06)]"
            >
              <p className="mb-3.5 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-teal">
                {u.eyebrow}
              </p>
              <h3 className="dq-h2 mb-3.5 text-[22px] leading-[1.2] tracking-[-0.005em]">
                {u.title}
              </h3>
              <p className="flex-1 text-[15.5px] leading-[1.55] text-foreground/85">
                {u.description}
              </p>
              <Link
                href={u.href}
                className="mt-6 inline-block text-[13.5px] font-semibold text-teal transition-colors group-hover:text-teal-700"
              >
                {u.linkLabel}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

Note: confirm `HomepageSectionHead` (in `src/components/homepage/SectionHead.tsx`) accepts `eyebrow`, `title`, and `context` props (it is called with all three in `MethodologyPillars.tsx:61-64`). If `context` is optional there, passing it here is still valid.

- [ ] **Step 2: Rewrite the hero** (`src/components/homepage/Hero.tsx`)

Eyebrow (line 34-36):
```tsx
          <p className="dq-eyebrow tracking-[0.16em]">
            Operator IQ · part of Dwellsy IQ
          </p>
```
H1 (line 45-47):
```tsx
          <h1 className="dq-h1 max-w-[14ch] text-balance text-[44px] leading-[1.04] tracking-[-0.018em] sm:text-[52px] lg:text-[60px]">
            Select, screen, and monitor property managers.
          </h1>
```
Subhead (line 48-53):
```tsx
          <p className="mt-6 max-w-[60ch] text-[17px] leading-[1.55] text-foreground/85 sm:text-[19px]">
            Operator IQ turns Dwellsy&apos;s nationwide listing record into
            observed, reproducible scorecards on 20,000+ property managers — so
            you can shortlist the right operator, vet it before you sign, and
            get alerted the moment performance moves. Every figure is measured,
            not self-reported.
          </p>
```
Primary CTA — replace the `TrackedLink` block at lines 58-68 (currently `PRIMARY_CTA.href` / `PRIMARY_CTA.label`, "build_watch_list") with a "Request access" mailto:
```tsx
            <TrackedLink
              event="pm_card_click"
              properties={{ source: "homepage_hero", cta: "request_access" }}
              href="mailto:sales@dwellsy.com?subject=Operator%20IQ%20access"
              className={
                buttonVariants() +
                " h-11 bg-navy px-6 text-[14.5px] font-semibold text-white hover:bg-navy-700"
              }
            >
              Request access →
            </TrackedLink>
```
Secondary CTA — replace the "Browse markets" block (lines 73-80) with the sample link promoted to secondary (outline style kept):
```tsx
            <TrackedLink
              event="pm_card_click"
              properties={{ source: "homepage_hero", cta: "view_sample_scorecard" }}
              href="/sample"
              className="inline-flex h-11 items-center justify-center rounded-md border border-navy bg-white px-6 text-[14.5px] font-semibold text-navy transition-colors hover:bg-navy-soft"
            >
              See a full sample scorecard →
            </TrackedLink>
```
Tertiary CTA — change the paragraph link (lines 86-98) from the sample link to "Browse markets":
```tsx
          <p className="mt-4">
            <TrackedLink
              event="pm_card_click"
              properties={{ source: "homepage_hero", cta: "browse_markets" }}
              href="/property-managers"
              className="inline-flex items-center gap-1 text-[14.5px] font-semibold text-navy underline-offset-4 hover:underline"
            >
              Browse markets →
            </TrackedLink>
          </p>
```
The `PRIMARY_CTA` import at the top of `Hero.tsx` (line 4) is now unused — **remove that import line** so `tsc`/lint stays clean. Leave the trust line (lines 99-102) unchanged.

- [ ] **Step 3: Reframe the methodology pillars section head** (`src/components/homepage/MethodologyPillars.tsx:61-64`)

```tsx
        <HomepageSectionHead
          eyebrow="The rigor behind it"
          title="How every score is measured."
          context="Scale, type, operating signals, and footprint — applied identically across every market we cover. Each metric is observed, cohort-relative, and reproducible from the underlying Dwellsy listing record. No operator self-reporting."
        />
```
(Only `eyebrow` and `title` change; `context` and the four pillar cards are unchanged.)

- [ ] **Step 4: Brand-name touch on two homepage components**

`MethodologyFooter.tsx` — the body sentence that reads `Every score, rank, and chart on Dwellsy IQ is produced by a single, versioned methodology` → change `on Dwellsy IQ` to `in Operator IQ`.

`CoveredMarkets.tsx` — the H2 `${countWord} markets currently live on Dwellsy IQ.` → change `on Dwellsy IQ` to `in Operator IQ`.

- [ ] **Step 5: Wire the section in + rewrite homepage metadata** (`src/app/page.tsx`)

Add the import alongside the other homepage imports:
```tsx
import { SelectScreenMonitor } from "@/components/homepage/SelectScreenMonitor";
```
Render it between `<Hero>` and `<MethodologyPillars>` (in the `return`, ~line 392-393):
```tsx
      <Hero heroCard={heroSampleCard} marketCount={liveMarkets.length} />
      <SelectScreenMonitor />
      <MethodologyPillars />
```
Rewrite the `metadata` export (lines 25-35):
```tsx
export const metadata: Metadata = {
  title: "Operator IQ — Select, screen & monitor property managers",
  description:
    "Select, screen, and monitor property managers. Operator IQ turns Dwellsy's nationwide listing record into observed, reproducible scorecards on 20,000+ property managers — shortlist the right operator, vet it before you sign, and get alerted when performance moves.",
  openGraph: {
    title: "Operator IQ — Select, screen & monitor property managers",
    description:
      "Select, screen, and monitor property managers. Operator IQ turns Dwellsy's nationwide listing record into observed, reproducible scorecards on 20,000+ property managers — shortlist the right operator, vet it before you sign, and get alerted when performance moves.",
    type: "website",
  },
};
```

- [ ] **Step 6: Verify + commit**

Run: `npx tsc --noEmit` → 0 errors. Then:
```bash
grep -rn "Outside-in intelligence on property managers\|What we measure\|Property Manager Intelligence" src/app/page.tsx src/components/homepage
```
Expected: no hits for the old hero H1, old pillar eyebrow, or old homepage title (all replaced).
```bash
git add src/components/homepage/SelectScreenMonitor.tsx src/components/homepage/Hero.tsx src/components/homepage/MethodologyPillars.tsx src/components/homepage/MethodologyFooter.tsx src/components/homepage/CoveredMarkets.tsx src/app/page.tsx
git commit -m "feat(marketing): reframe homepage around Select · Screen · Monitor"
```

---

## Task 2: Global chrome, root metadata, and OG image

**Files:**
- Modify: `src/app/layout.tsx`, `src/components/layout/SiteHeader.tsx`, `src/components/layout/SiteFooter.tsx`, `src/app/property-managers/[state]/[city]/[slug]/opengraph-image.tsx`

- [ ] **Step 1: Root metadata** (`src/app/layout.tsx:54-59`)

```tsx
  title: {
    default: "Operator IQ — Select, screen & monitor property managers",
    template: "%s · Operator IQ",
  },
  description:
    "Operator IQ helps institutional teams select, screen, and monitor property managers — observed, reproducible scorecards on 20,000+ operators across U.S. rental markets. Part of Dwellsy IQ.",
```

- [ ] **Step 2: Site header signed-out CTA** (`src/components/layout/SiteHeader.tsx:241`)

Change the signed-out anchor's visible label from `Contact sales` to `Request access →` (keep the existing `mailto:sales@dwellsy.com?subject=Operator%20IQ%20enterprise%20access` href and classes). Leave the signed-in `PRIMARY_CTA` branch and the logo lockup/aria unchanged.

- [ ] **Step 3: Site footer** (`src/components/layout/SiteFooter.tsx`)

Trust line (lines 32-40) — drop the "Confidential" + "For institutional use only" segments:
```tsx
          <p className="text-xs text-muted-foreground dq-tnum">
            Methodology {METHODOLOGY_VERSION}
            <span className="mx-1.5 text-muted-2">·</span>
            Design {DESIGN_VERSION}
          </p>
```
Add umbrella attribution in the brand lockup block, immediately after the `Operator IQ` sub-label span (line 30):
```tsx
            <span className="text-xs text-muted-foreground">Operator IQ</span>
            <span aria-hidden className="h-3.5 w-px bg-grid" />
            <span className="text-xs text-muted-2">A Dwellsy IQ product</span>
```
(If the existing lockup markup differs slightly, preserve its structure and just append the "A Dwellsy IQ product" muted span so it reads "Operator IQ · A Dwellsy IQ product".)

- [ ] **Step 4: OG image** (`src/app/property-managers/[state]/[city]/[slug]/opengraph-image.tsx`)

- Line 119: `export const alt = "Dwellsy IQ scorecard preview";` → `"Operator IQ scorecard preview";`
- Line 251: the eyebrow text `Property Manager Scorecard` → `Operator IQ · Property Manager Scorecard`.
- Lines 161, 166, 350: `brandedFallback("Property manager intelligence")` → `brandedFallback("Select, screen & monitor property managers")` (all three call sites).
- Keep the `Dwellsy IQ` wordmark/logo (lines 236, 242, 389) — that's the umbrella mark.

- [ ] **Step 5: Verify + commit**

Run: `npx tsc --noEmit` → 0 errors. Then:
```bash
grep -rn "Confidential\|For institutional use only" src/components/layout/SiteFooter.tsx
grep -rn "Property Manager Intelligence\|Contact sales" src/app/layout.tsx src/components/layout/SiteHeader.tsx
```
Expected: no "Confidential/institutional" in the footer; no "Property Manager Intelligence" in root metadata; no "Contact sales" label in the header.
```bash
git add src/app/layout.tsx src/components/layout/SiteHeader.tsx src/components/layout/SiteFooter.tsx "src/app/property-managers/[state]/[city]/[slug]/opengraph-image.tsx"
git commit -m "chore(marketing): Operator IQ brand in chrome + OG; drop institutional footer line"
```

---

## Task 3: Secondary-page brand sweep (Operator IQ = product)

**Files:**
- Modify: `src/app/property-managers/page.tsx`, `src/app/methodology/page.tsx`, `src/app/methodology/portfolio-estimator/page.tsx`, `src/app/briefs/page.tsx`, `src/app/sample/page.tsx`, `src/app/ask/page.tsx`, `src/app/ask/AskChat.tsx`, `src/app/privacy/page.tsx`

Apply the brand naming rule (Global Constraints) per instance. Exact edits:

- [ ] **Step 1: `property-managers/page.tsx`** — metadata title `All markets — Dwellsy IQ` → `All markets` (the root template appends `· Operator IQ`). Body/H1 unchanged.

- [ ] **Step 2: `methodology/page.tsx`** — title stays `Methodology` (template now yields `Methodology · Operator IQ`). In the body/subhead, any instance that names the **product** "Dwellsy IQ" → "Operator IQ"; **keep** "Dwellsy listing record" and any "Dwellsy's" data-source phrasing. (Grep the file for "Dwellsy IQ" and convert only product-naming hits.)

- [ ] **Step 3: `methodology/portfolio-estimator/page.tsx`** — title `Portfolio Size Estimator — Dwellsy IQ Methodology` → `Portfolio Size Estimator — Operator IQ Methodology` (and the matching `openGraph.title`); body `Dwellsy IQ observes only listing activity` → `Operator IQ observes only listing activity`. Keep "Dwellsy" data-source phrasing.

- [ ] **Step 4: `briefs/page.tsx`** — eyebrow `Dwellsy IQ research` → `Operator IQ research`; intro `across Dwellsy IQ's {n} covered markets` → `across Operator IQ's {n} covered markets`; metadata description `across Dwellsy IQ's covered markets` → `across Operator IQ's covered markets`.

- [ ] **Step 5: `sample/page.tsx`** — metadata title `Sample scorecard — Dwellsy IQ` → `Sample scorecard` (template appends); metadata/body `every Dwellsy IQ operator profile` and `example Dwellsy IQ operator scorecard` → `Operator IQ`. CTA: change the primary `Build a watch list →` (the page's lead CTA) to `Request access →` → `mailto:sales@dwellsy.com?subject=Operator%20IQ%20access`; keep the secondary `Browse markets →`.

- [ ] **Step 6: `ask/page.tsx` + `ask/AskChat.tsx`** — `Ask Dwellsy IQ` → `Ask Operator IQ` (title + both H1/label instances in `AskChat.tsx`). Fix the stale description `across Dwellsy IQ's 10 covered markets` → `across Operator IQ's covered markets` (drop the hard-coded "10").

- [ ] **Step 7: `privacy/page.tsx`** — title `Privacy — Dwellsy IQ` → `Privacy` (template appends). Body product instances → Operator IQ: `Dwellsy IQ is an institutional intelligence product` → `Operator IQ is an institutional intelligence product`; `Access to Dwellsy IQ is provisioned` → `Access to Operator IQ is provisioned`; `to operate Dwellsy IQ on our behalf` → `to operate Operator IQ on our behalf`. **Keep** `Dwellsy's company-wide Privacy Policy` and `Dwellsy, Inc.`

- [ ] **Step 8: Verify + commit**

Run: `npx tsc --noEmit` → 0 errors. Then the site-wide audit:
```bash
grep -rn "Dwellsy IQ" src
```
Manually confirm EVERY remaining hit is intentional: umbrella attribution ("part of Dwellsy IQ", "A Dwellsy IQ product"), the OG/logo wordmark + its comments, the `dwellsy-iq-logo.png` asset ref, aria lockups, or the privacy page's company/umbrella references. **No remaining hit may name the product.** Also:
```bash
grep -rn "10 covered markets" src
```
Expected: no hits (stale count removed).
```bash
git add src/app/property-managers/page.tsx src/app/methodology/page.tsx src/app/methodology/portfolio-estimator/page.tsx src/app/briefs/page.tsx src/app/sample/page.tsx src/app/ask/page.tsx src/app/ask/AskChat.tsx src/app/privacy/page.tsx
git commit -m "chore(marketing): Operator IQ product name across secondary pages"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** hero reframe ✓ (T1); new Select/Screen/Monitor section ✓ (T1); methodology repositioned as proof ✓ (T1); homepage + root metadata ✓ (T1/T2); brand hierarchy site-wide ✓ (T1/T2/T3, per decision table); CTA vs invite-only alignment ✓ (hero + header + sample → "Request access"; PRIMARY_CTA untouched); footer confidential line dropped + umbrella attribution added ✓ (T2); "20,000+" preserved ✓; stale "10 covered markets" de-staled ✓ (T3). Deferred items (secondary-page narrative rewrites, dup "top-200" line) intentionally out of scope.
- **Consistency:** "Operator IQ" is the product name and "Dwellsy IQ" the umbrella in every edited string; "Dwellsy listing record"/"Dwellsy, Inc." preserved; "Request access" mailto used consistently on the marketing CTAs; `PRIMARY_CTA` explicitly left intact for signed-in chrome.
- **Placeholders:** none — every step has exact current→new strings or full code. The two "grep the file and convert product-naming hits" steps (methodology body) are bounded by the decision table + the final site-wide grep audit gate.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-17-marketing-select-screen-monitor.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session with checkpoints.

Which approach?
