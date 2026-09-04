# Consumer Funnel Front End — Implementation Plan (Plan 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the $149/$299 consumer offer on the homepage without letting its price anchor the enterprise conversation, and make an operator's report page work for someone who arrives cold from an invite link.

**Architecture:** Search early, price late. The hero gains an operator search box (free, leads to a teaser); the price appears only in a new offer section placed last, after the existing enterprise pitch. The report teaser stops leading with a coverage-stat grid, makes its locked rows read as locked *and* teased, and stops advertising a peer rank the paid report deliberately never shows. The three-pack gets its real placement beside the peer table inside a paid report.

**Tech Stack:** Next.js 16 (App Router, RSC + client islands), TypeScript, Tailwind, Vitest + Testing Library for component tests.

## Global Constraints

- **Never surface rank or composite on a scorecard.** This is a standing hard constraint (PR #132 fixed a leak). Facts, not judgments.
- **Market-observed signals only.** Never imply we can see the owner's P&L or internal numbers.
- **Never adversarial toward property managers.** The frame is selection, evaluation and monitoring — never replacement.
- **Price ordering is the point of this plan:** no price may appear on the homepage above the enterprise section. Search may, because searching is free.
- Prices are exactly **$149** (one report) and **$299** (three credits, non-expiring). Display only; Stripe is authoritative.
- Reuse existing components rather than rebuilding: `ReportSearch`, `ScorecardCard`, `PerformanceAlert`, `TrackedLink`.
- Match the existing design system — `dq-eyebrow` / `dq-h1` / `dq-h2`, navy `#0f1f3f`, teal `#1b6e8c`. Do not introduce new tokens.
- Component tests are Vitest + happy-dom on `*.test.tsx`; **`jest-dom` matchers are NOT available** — use `toBeTruthy()` / `toBe()` and container queries.
- **GIT GUARDRAIL: stage only your task's files by explicit path. Never `git add -A`.**
- Baseline to hold: `tsc --noEmit` **0 errors**; `npm run lint` **60 problems (43 errors / 17 warnings)**.
- Mock: https://claude.ai/code/artifact/09a27092-d36e-4b7d-a792-43004820d6e4 · Spec: `docs/superpowers/specs/2026-09-01-consumer-reports-bifurcation-design.md`

---

## What already exists (do not rebuild)

Surveying before planning cut this plan roughly in half. Already built and approved:

- **`SelectEvaluateMonitor`** — the Select / Evaluate / Monitor section, carrying "Three jobs, one independent standard" and "Know the moment performance moves."
- **`PerformanceAlert`** — a full alert specimen (ABC Property Management, three-metric grid) sitting inside it. **This is the enterprise tease.** The mock proposed rebuilding it; it exists and is better than the mock's version.
- **`ReportSearch`** — a client component with Fuse-backed `searchPMs`, ranked/tracked tiers, confidence badges, already linking to `/report/r/[slug]`. Task 1 mounts it; it does not write it.

Current homepage order in `src/app/page.tsx:392-399`:
`Hero → BlindSpot → OwnerQuestions → SampleScorecards → SelectEvaluateMonitor → CoveredMarkets → MethodologyPillars → FinalCta`

## File Structure

| File | Change |
|---|---|
| `src/components/homepage/Hero.tsx` | Mount `ReportSearch` below the CTAs |
| `src/components/homepage/SingleReportOffer.tsx` | **Create** — the $149/$299 block |
| `src/app/page.tsx` | Insert `<SingleReportOffer />` before `<FinalCta />` |
| `src/components/report/ReportTeaser.tsx` | Locked rows read as locked + teased; fix the rank promise; add the sample link; demote the coverage strip |
| `src/components/scorecard/redesign/ScaleFitSection.tsx` | Pack offer beside the peer table |
| `src/components/homepage/SingleReportOffer.test.tsx` | **Create** |
| `src/components/report/ReportTeaser.test.tsx` | **Create** |

---

### Task 1: Operator search in the hero

**Files:**
- Modify: `src/components/homepage/Hero.tsx`

**Interfaces:**
- Consumes: `ReportSearch` from `@/components/report/ReportSearch` — props `{ partner?: string | null }`.
- Produces: nothing new.

**Why here.** An invited owner's first job is "check my manager." Making them scroll past a five-figure enterprise pitch to find search is hostile. Searching is free and leads to a teaser, so it costs the enterprise framing nothing — and no price appears above the pitch.

- [ ] **Step 1: Add the search block**

In `src/components/homepage/Hero.tsx`, after the closing `</div>` of the CTA row (`<div className="mt-7 flex flex-wrap items-center gap-3">…</div>`), add:

```tsx
          {/* Search early, price late. An invited owner's first job is to look
              up one manager; the price for that lives far below, after the
              enterprise pitch, so nothing here anchors a five-figure
              conversation. Searching is free and lands on the teaser. */}
          <div className="mt-8 max-w-[52ch] border-t border-grid pt-6">
            <p className="text-[13px] font-semibold text-navy">
              Look up a property manager
            </p>
            <div className="mt-3">
              <ReportSearch />
            </div>
            <p className="mt-2 text-[12.5px] text-muted-foreground">
              Free. Their rating, coverage and confidence tier, without an account.
            </p>
          </div>
```

Add the import at the top:

```tsx
import { ReportSearch } from "@/components/report/ReportSearch";
```

- [ ] **Step 2: Verify it renders and the page still builds**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `0`

Run: `npm run lint 2>&1 | grep problems`
Expected: 60 problems (43 errors, 17 warnings)

- [ ] **Step 3: Confirm no price leaked above the pitch**

Run: `grep -n '\$149\|\$299' src/components/homepage/Hero.tsx`
Expected: no output. If this prints anything, the ordering constraint is broken.

- [ ] **Step 4: Commit**

```bash
git add src/components/homepage/Hero.tsx
git commit -m "Operator search in the hero

An invited owner's first job is to look up one manager. Searching is free and
lands on the teaser, so it can sit at the top without any price appearing
above the enterprise pitch."
```

---

### Task 2: The $149 / $299 offer, placed last

**Files:**
- Create: `src/components/homepage/SingleReportOffer.tsx`
- Modify: `src/app/page.tsx`
- Test: `src/components/homepage/SingleReportOffer.test.tsx` (create)

**Interfaces:**
- Consumes: `PRODUCTS` from `@/lib/billing/products` (`PRODUCTS.single_report.priceUsd === 149`, `PRODUCTS.three_pack.priceUsd === 299`).
- Produces: `<SingleReportOffer />`, a server component taking no props.

**Placement is the whole point.** It goes **after** `MethodologyPillars` and **before** `FinalCta` — i.e. after the reader has met `SelectEvaluateMonitor` and `PerformanceAlert`. By the time a number appears, they have already seen the monitoring system, so $149 reads as the smaller question rather than as what Operator IQ costs.

Prices come from `PRODUCTS`, never hard-coded, so the page cannot drift from the catalog.

- [ ] **Step 1: Write the failing test**

Create `src/components/homepage/SingleReportOffer.test.tsx`:

```tsx
import { describe, test, expect } from "vitest";
import { render } from "@testing-library/react";
import { SingleReportOffer } from "./SingleReportOffer";
import { PRODUCTS } from "@/lib/billing/products";

// The offer block's job is to be findable without anchoring the enterprise
// conversation. Two properties matter: the prices match the catalog exactly
// (a hard-coded number here would silently drift from what Stripe charges),
// and the copy frames this by INTENT — "one manager" — rather than as a tier
// of the enterprise product.

describe("SingleReportOffer", () => {
  test("prices come from the catalog, not from hard-coded strings", () => {
    const { container } = render(<SingleReportOffer />);
    const text = container.textContent ?? "";
    expect(text).toContain(`$${PRODUCTS.single_report.priceUsd}`);
    expect(text).toContain(`$${PRODUCTS.three_pack.priceUsd}`);
  });

  test("the pack is stated as non-expiring", () => {
    // Credits have no expiry in the schema; saying so removes the buyer's
    // main hesitation about a pack they cannot fully redeem today.
    const { container } = render(<SingleReportOffer />);
    expect((container.textContent ?? "").toLowerCase()).toContain("expire");
  });

  test("it does not name a price for the enterprise product", () => {
    // Enterprise is priced by conversation. A number here would anchor it.
    const text = render(<SingleReportOffer />).container.textContent ?? "";
    expect(/\$\d[\d,]*\s*(\/|per\s)?\s*(mo|month|year|yr)/i.test(text)).toBe(false);
  });

  test("it routes to the funnel, not to checkout", () => {
    // The block cannot start a purchase: the buyer picks an operator first.
    const { container } = render(<SingleReportOffer />);
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/report");
    expect(hrefs.some((h) => h?.includes("checkout"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/components/homepage/SingleReportOffer.test.tsx`
Expected: FAIL — `Cannot find module './SingleReportOffer'`.

- [ ] **Step 3: Write the component**

Create `src/components/homepage/SingleReportOffer.tsx`:

```tsx
import Link from "next/link";
import { PRODUCTS } from "@/lib/billing/products";

// v0.34 — The consumer offer, placed LAST on the homepage by design.
//
// Ordering is the whole idea. A $149 price visible before the enterprise
// pitch anchors the enterprise conversation against it; the fix is not hiding
// the number but putting it after the reader has already met the monitoring
// system (SelectEvaluateMonitor + PerformanceAlert). By then $149 reads as
// the smaller question, not as what Operator IQ costs.
//
// Framed by INTENT ("one manager"), never as a tier of the enterprise
// product — the two differ in kind, not in volume.
//
// Prices come from PRODUCTS so this can never drift from what Stripe charges.

export function SingleReportOffer() {
  const single = PRODUCTS.single_report;
  const pack = PRODUCTS.three_pack;

  return (
    <section className="border-t border-grid bg-white">
      <div className="mx-auto max-w-[1280px] px-6 py-16 sm:px-16">
        <div className="grid items-center gap-8 rounded-xl border border-teal/20 bg-teal-soft/40 p-8 lg:grid-cols-[1fr_auto]">
          <div>
            <p className="dq-eyebrow">Not ready for a conversation</p>
            <h2 className="dq-h2 text-[24px]">One manager, one report</h2>
            <p className="mt-3 max-w-[56ch] text-[15px] leading-relaxed text-foreground/85">
              The full scorecard for a single operator. Web and PDF, yours to
              keep, no account needed.
            </p>
            <p className="mt-3 text-[13.5px] text-muted-foreground">
              Comparing a shortlist? Three reports for ${pack.priceUsd}. They
              don&rsquo;t expire.
            </p>
          </div>
          <div className="lg:text-right">
            <p className="dq-tnum text-[30px] font-bold leading-none text-navy">
              ${single.priceUsd}
              <span className="ml-2 text-[13px] font-semibold text-muted-foreground">
                one report
              </span>
            </p>
            <Link
              href="/report"
              className="mt-4 inline-flex h-11 items-center justify-center rounded-md bg-navy px-6 text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              Look up a manager
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/components/homepage/SingleReportOffer.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Mount it in the page, in the right place**

In `src/app/page.tsx`, add the import alongside the other homepage imports:

```tsx
import { SingleReportOffer } from "@/components/homepage/SingleReportOffer";
```

Then place it between `<MethodologyPillars />` and `<FinalCta />`:

```tsx
      <MethodologyPillars />
      <SingleReportOffer />
      <FinalCta />
```

**Do not move it earlier.** It must sit after `SelectEvaluateMonitor`, which carries the enterprise pitch and the `PerformanceAlert` specimen.

- [ ] **Step 6: Prove the ordering constraint holds**

Run:

```bash
node -e '
const s=require("fs").readFileSync("src/app/page.tsx","utf8");
const i=n=>s.indexOf("<"+n);
const ok = i("SelectEvaluateMonitor") < i("SingleReportOffer");
console.log("enterprise pitch before the price:", ok ? "OK" : "BROKEN");
process.exit(ok?0:1);'
```

Expected: `enterprise pitch before the price: OK`

- [ ] **Step 7: Commit**

```bash
git add src/components/homepage/SingleReportOffer.tsx src/components/homepage/SingleReportOffer.test.tsx src/app/page.tsx
git commit -m "The \$149 offer, placed after the enterprise pitch

Ordering is the point: a reader meets the monitoring system before any number
appears, so \$149 reads as the smaller question rather than as what Operator IQ
costs. Prices come from PRODUCTS so the page cannot drift from Stripe."
```

---

### Task 3: The teaser stops over-promising and reads as locked

**Files:**
- Modify: `src/components/report/ReportTeaser.tsx`
- Test: `src/components/report/ReportTeaser.test.tsx` (create)

**Interfaces:**
- Consumes: `ScorecardData`, `tierInfo`, `countOperatorStars` — all already imported by the file.
- Produces: `LOCKED_ROWS` changes shape from `string[]` to `Array<{ label: string; reveals: string }>`.

**Three problems, one of them a correctness bug.**

1. **`LOCKED_ROWS[0]` is "Overall peer rank & percentiles" — which the paid report deliberately never shows.** Surfacing rank or composite on a scorecard is a standing hard constraint; PR #132 removed a leak of exactly this. So the teaser currently promises a $149 buyer something they will not receive. **This must change**, and it is the highest-value edit in the task.
2. The locked rows render as `▓▓▓` grey blocks, which read as *broken* or *loading* rather than *locked*, and say nothing about what is behind them.
3. There is no link to the free sample (`grep -c "/sample"` returns 0), so a buyer arriving cold from an invite link has no way to see a complete report before paying.

- [ ] **Step 1: Write the failing test**

Create `src/components/report/ReportTeaser.test.tsx`:

```tsx
import { describe, test, expect } from "vitest";
import { render } from "@testing-library/react";
import { ReportTeaser } from "./ReportTeaser";

// The teaser is the whole sales surface for an invited buyer arriving cold.
// It must not promise what the paid report does not contain, and it must give
// them a way to see a complete report before paying.

const scorecard = {
  pm: { slug: "acme-property-management-denver-co", name: "Acme Property Management",
        quadrant7Cell: "SFR Independent", quadrant: "Scattered / Independent" },
  market: { id: "denver-co", fullName: "Denver MSA", state: "CO", name: "Denver" },
  coverage: { t12Listings: 412, citiesObserved: 9, observedCommunities: 3, monthsOnPlatform: 26 },
  performance: { domStar: "gold" }, tenancy: { star: "silver" },
  rentPerformance: { star: null }, marketing: { compositeScore: 74, star: "silver" },
  communityVisibility: { star: null },
} as never;

const tierInfo = { label: "Full ranking", blurb: "Enough live inventory to score on all five measures." } as never;

const text = () =>
  render(<ReportTeaser scorecard={scorecard} tierInfo={tierInfo} />).container.textContent ?? "";

describe("ReportTeaser", () => {
  test("does not promise a peer rank or percentile", () => {
    // HARD CONSTRAINT: scorecards never surface rank or composite (PR #132).
    // Advertising it here sells a buyer something they will not receive.
    const t = text().toLowerCase();
    expect(t).not.toContain("percentile");
    expect(/\brank\b/.test(t)).toBe(false);
  });

  test("every locked row says what the paid report reveals", () => {
    // Grey blocks alone read as broken, not as locked-and-worth-buying.
    const { container } = render(<ReportTeaser scorecard={scorecard} tierInfo={tierInfo} />);
    const items = [...container.querySelectorAll("li")];
    const locked = items.filter((li) => (li.textContent ?? "").length > 0);
    expect(locked.length).toBeGreaterThan(3);
    for (const li of locked) {
      expect((li.textContent ?? "").length).toBeGreaterThan(24);
    }
  });

  test("offers a free sample report", () => {
    const { container } = render(<ReportTeaser scorecard={scorecard} tierInfo={tierInfo} />);
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/sample");
  });

  test("names the operator and its market so the page stands alone", () => {
    // An invited buyer lands here from a link with no homepage context.
    const t = text();
    expect(t).toContain("Acme Property Management");
    expect(t).toContain("Denver");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/components/report/ReportTeaser.test.tsx`
Expected: FAIL — the first test fails on "Overall peer rank & percentiles", and the sample-link test fails because no `/sample` href exists.

- [ ] **Step 3: Replace `LOCKED_ROWS` with labelled reveals**

In `src/components/report/ReportTeaser.tsx`, replace the `LOCKED_ROWS` constant (currently at line 15) with:

```tsx
// Each locked row states what the PAID report actually contains.
//
// The old first row promised "Overall peer rank & percentiles" — which the
// scorecard deliberately never shows. Surfacing rank or composite is a
// standing hard constraint (PR #132 removed exactly that leak), so the teaser
// was selling something the buyer would not receive. Rows now describe the
// star-and-position treatment the report really gives.
const LOCKED_ROWS: Array<{ label: string; reveals: string }> = [
  {
    label: "Lease-up speed",
    reveals: "Days on market against same-cohort local peers, with the cohort median.",
  },
  {
    label: "Tenant retention",
    reveals: "Share of tenancies reaching 18 months, and how that compares locally.",
  },
  {
    label: "Rent performance",
    reveals: "Year-over-year rent movement against the market, mix-adjusted.",
  },
  {
    label: "Listing quality",
    reveals: "Completeness, photos, description, amenities and stated rules, scored 0-100.",
  },
  {
    label: "Scale and fit",
    reveals: "Portfolio size band, concentration, coverage map, and similar local operators.",
  },
];
```

- [ ] **Step 4: Render the rows as locked and teased**

Replace the `LOCKED_ROWS.map(...)` block (currently around line 91) with:

```tsx
              {LOCKED_ROWS.map((row) => (
                <li
                  key={row.label}
                  className="border-b border-grid/60 pb-3 last:border-0 last:pb-0"
                >
                  <div className="flex items-center gap-2">
                    <svg
                      aria-hidden
                      viewBox="0 0 24 24"
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <rect x="5" y="11" width="14" height="9" rx="2" />
                      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                    </svg>
                    <span className="text-[14px] font-medium text-foreground/85">
                      {row.label}
                    </span>
                    <span className="ml-auto rounded bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                      Locked
                    </span>
                  </div>
                  <p className="mt-1 pl-[22px] text-[12.5px] leading-snug text-muted-foreground">
                    {row.reveals}
                  </p>
                </li>
              ))}
```

- [ ] **Step 5: Fix the paragraph that also names rank, and add the sample link**

The paragraph below the list currently says the report "shows exactly where {name} ranks against local peers". Replace that paragraph with:

```tsx
            <p className="mt-5 text-[13px] leading-relaxed text-muted-foreground">
              The full scorecard shows how {name} performs against same-cohort
              local peers on lease-up speed, tenant retention, rent performance
              and listing quality, measured from the listings they ran.
            </p>
            <p className="mt-3 text-[13px]">
              <Link
                href="/sample"
                className="font-semibold text-teal underline-offset-2 hover:underline"
              >
                See a complete sample report
              </Link>
              <span className="text-muted-foreground"> — a real operator, nothing locked.</span>
            </p>
```

Add `import Link from "next/link";` at the top if it is not already imported.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/components/report/ReportTeaser.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 7: Prove the rank promise is gone everywhere in the file**

Run: `grep -in "percentile\|\brank\b" src/components/report/ReportTeaser.tsx`
Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add src/components/report/ReportTeaser.tsx src/components/report/ReportTeaser.test.tsx
git commit -m "Teaser stops promising a rank the report never shows

LOCKED_ROWS advertised 'Overall peer rank & percentiles'. Scorecards
deliberately never surface rank or composite — PR #132 removed exactly that
leak — so the teaser was selling a \$149 buyer something they would not
receive. Rows now describe what the report really contains, read as locked
rather than broken, and link to the free sample."
```

---

### Task 4: The three-pack beside the peer table

**Files:**
- Modify: `src/components/scorecard/redesign/ScaleFitSection.tsx`

**Interfaces:**
- Consumes: `PRODUCTS.three_pack` from `@/lib/billing/products`; the existing `peers: SelectedPeer[]` prop and `peerHref(slug)` helper already in the file.
- Produces: nothing new.

**Why here.** This is the pack's real home. The peer table names roughly four comparable local operators — the exact names a buyer now wants and does not have. Intent is highest at the moment the question becomes concrete, which is the moment they read that table.

**Only for a paid consumer view.** Add a `showPackOffer?: boolean` prop, default `false`, so the enterprise scorecard, the public `/sample`, and the PDF are all unaffected.

- [ ] **Step 1: Add the opt-in prop**

In `ScaleFitSectionProps` (around line 202), add:

```tsx
  /** Show the three-report pack offer under the peer table. Consumer report
   *  view only — never on the B2B scorecard, /sample, or the PDF, which is
   *  why this defaults to false rather than being inferred. */
  showPackOffer?: boolean;
```

Add `showPackOffer = false` to the destructured parameter list.

- [ ] **Step 2: Render the offer under the peer table**

Inside the existing `{peers.length > 0 && ( … )}` block, immediately after the peer table's closing `</div>` (the `overflowX: "auto"` wrapper), add:

```tsx
          {showPackOffer && (
            <div
              style={{
                marginTop: "14px",
                border: "1px solid #cfe3ea",
                background: "#f4fafc",
                borderRadius: "8px",
                padding: "13px 15px",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <span style={{ fontSize: "13px", color: "#2a3547", flex: "1 1 320px" }}>
                Checking more than one of these? Three reports for $
                {PRODUCTS.three_pack.priceUsd}, redeemable on any operator.
                They don&rsquo;t expire.
              </span>
              <a
                href="/report"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: "34px",
                  padding: "0 14px",
                  borderRadius: "5px",
                  background: "#0f1f3f",
                  color: "#ffffff",
                  fontSize: "13px",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Get three reports
              </a>
            </div>
          )}
```

Add the import: `import { PRODUCTS } from "@/lib/billing/products";`

- [ ] **Step 3: Confirm nothing else renders it**

Run: `grep -rn "showPackOffer" src/`

Expected: only the definition and the render guard in `ScaleFitSection.tsx`. No caller passes it yet — wiring it into the paid consumer view is deliberately left for when that view is assembled, so this task cannot leak the offer onto `/sample`, the B2B scorecard or the PDF.

- [ ] **Step 4: Verify the guard holds by default**

Run: `npm run test:components 2>&1 | tail -5`
Expected: passes, 0 failures. The existing `scorecard-peer-table-scroll.test.ts` guard must still pass — the new block sits **outside** the `overflowX: "auto"` wrapper, so it does not widen the scroll container.

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `0`

- [ ] **Step 5: Commit**

```bash
git add src/components/scorecard/redesign/ScaleFitSection.tsx
git commit -m "Three-pack offer beside the peer table, opt-in only

The peer table names ~4 comparable local operators — the exact names a buyer
now wants and does not have, which makes this the pack's highest-intent
placement. Gated behind showPackOffer (default false) so the B2B scorecard,
/sample and the PDF are untouched."
```

---

### Task 5: Close #413 and run the gate

**Files:**
- No source changes expected.

- [ ] **Step 1: Close the superseded PR**

```bash
gh pr close 413 --comment "Superseded by Plan 2. This branch is 25 commits stale and three of its four files (ReportTeaser, ReportShell, .env.example) were rewritten shipping the two-SKU billing work; the fourth is the next.config.ts host rewrite, which the single-front-end design makes wrong. Its ideas — lead with the real result, make locked rows read as locked and teased, link to the sample — are rebuilt in docs/superpowers/plans/2026-09-03-consumer-funnel-front-end.md."
```

- [ ] **Step 2: Run the full gate**

```bash
npx tsc --noEmit 2>&1 | grep -c "error TS"
npm run lint 2>&1 | grep problems
npm run test:watch-list 2>&1 | tail -5
npm run test:components 2>&1 | tail -5
```

Expected: `tsc` **0**; lint **60 problems (43 errors, 17 warnings)**; both suites pass with 0 failures and counts higher than before by the tests this plan adds.

- [ ] **Step 3: Verify the ordering constraint one final time**

```bash
grep -n "SelectEvaluateMonitor\|SingleReportOffer\|FinalCta" src/app/page.tsx
grep -rn '\$149\|\$299' src/components/homepage/Hero.tsx || echo "no price in the hero — OK"
```

Expected: `SingleReportOffer` appears after `SelectEvaluateMonitor` and before `FinalCta`; no price in the hero.

- [ ] **Step 4: Open the PR**

The body must state: search early / price late and why; that the enterprise tease already existed (`SelectEvaluateMonitor` + `PerformanceAlert`) and was not rebuilt; that the teaser stopped advertising a peer rank the report never shows; and that the pack offer is opt-in and reaches no existing surface yet.

---

## Out of scope

- **Wiring `showPackOffer` into a live view.** Task 4 builds the offer; assembling the paid consumer report view that passes it is separate work.
- **Public indexing.** Stays off — launch is invite-led. That is Plan 4 and unscheduled.
- **The host migration** to `operators.iq.dwellsy.com` — Plan 3, independent.
- **Any change to the enterprise scorecard, `/sample`, or the PDF.**
- **Partner-specific copy or discounting.** `?partner=` theming stays presentational.

## Copy provenance

The strings in Tasks 1–4 are mine, not Jonas's, and were revised after a slop check:

| was | now | why |
|---|---|---|
| "Already have a manager in mind?" | "Look up a property manager" | Rhetorical-question opener; two of them on one page reads as generated |
| "Free — see their rating and coverage before you decide anything." | "Free. Their rating, coverage and confidence tier, without an account." | Em dash plus "before you decide anything", which is filler that would survive on any page |
| "Just checking one manager?" | "One manager, one report" | Same rhetorical-question pattern; also told the reader who they are |
| "…redeemable whenever you choose." | "They don't expire." | States the actual fact rather than a softer paraphrase |
| "A report answers once. Operator IQ keeps answering." | *(deleted)* | Manufactured symmetry. `SelectEvaluateMonitor` already carries "Three jobs, one independent standard" and "Know the moment performance moves", which are Jonas's and better |

Jonas may still want to write the offer-block copy himself; the strings are confined to `SingleReportOffer.tsx` and the two teaser paragraphs, so replacing them touches nothing structural.
