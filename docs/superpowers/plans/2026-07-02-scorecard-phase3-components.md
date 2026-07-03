# Scorecard Redesign — Phase 3: Components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Render the redesigned scorecard — Header, 30-second readout, Scale & Fit, Operating Performance, Momentum, Watch Items, right-nav — by building React components that consume `ScorecardView` (Phase 2) and wiring them into the page, removing Lending Signals. End with a local render + screenshots.

**Architecture:** New components in `src/components/scorecard/redesign/` consuming `ScorecardView` + its sub-view types from `@/lib/scorecard/view-model`. A rewritten `ScorecardBody` composes them; `page.tsx` calls `buildScorecardView(...)` and passes the view. The existing `CoverageMapClient` (Mapbox) is reused for the map. Old layer components (IdentityHero, SynthesisLayer, PerformanceLayer, **LendingSignals**, PortfolioLayer, OperatorTrajectorySection, MethodologyFooter) are removed from the render.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4 (tokens in `globals.css`), TypeScript strict. Components are server components unless they need client interactivity (nav scroll-spy, map).

## Global Constraints

- **Markup source of truth (approved design):** `/Users/jonasbordo/Documents/Claude/Projects/PM Intel/iq-dwellsy/.superpowers/brainstorm/5704-1783039627/content/scorecard-v5.html`. Each component reproduces its section from that file's structure + hierarchy (colors/spacing there are approximate — use the real tokens below).
- **Token map** (mockup inline hex → real Tailwind token class from `globals.css`): `#0f1f3f`→`navy`, `#1a2d54`→`navy-700`, `#1b6e8c`→`teal`, `#155772`→`teal-700`, `#3e7c3e`/greens→`good`, `#a63a2a`/reds→`bad`, `#d5dbe3`→`grid`, `#e6eaf0`→`grid-soft`, `#f2f5f8`→`surface-soft`, `#8a92a2`→`muted-2`. Use existing `.dq-*` utilities (`dq-eyebrow`, `dq-section`, `dq-table`) where they fit. Label chip colors: strong→good token, good→teal token, neutral→grey/muted, watch→amber (`#9a6a12` on `#fbefd8` — inline is fine if no token), mixed→violet (inline ok).
- **Hard constraint:** never render a raw ordinal rank ("#2 of 51") or the raw composite score. Only labels, values-vs-benchmark, stars, position bars (0–1), directions. The view-model already excludes rank/composite — do not reach back into `scorecard.rank.overall`/composite.
- **Consume `ScorecardView` only** for the new sections' data — do not re-derive labels or re-read raw metric percentiles in components (position bars use `metricRow.position`).
- **Voice:** facts-not-judgments in any prose; labels carry the verdict. No "lending/underwriting/credit" strings anywhere.
- `dynamic = "force-dynamic"` stays on the page (per-request auth). DRY, YAGNI, frequent commits. React components are verified by tsc + the final local render (this repo does not unit-test RSC).

## File Structure

- `src/components/scorecard/redesign/ScorecardHeader.tsx` — name, badges, star chip, Dwellsy + website link buttons.
- `.../ExecReadout.tsx` — the 4-row 30-second table.
- `.../ScaleFitSection.tsx` — portfolio range bar + map + concentration + rent-tier + facts + similar-players.
- `.../PortfolioRangeBar.tsx`, `.../ConcentrationBar.tsx`, `.../RentTierMarker.tsx`, `.../PositionBar.tsx`, `.../Sparkline.tsx`, `.../LabelChip.tsx` — small presentational primitives shared across sections.
- `.../OperatingPerformanceSection.tsx` — metric evidence cards + strongest/watch.
- `.../MomentumSection.tsx` — sparklines + takeaway.
- `.../WatchItemsSection.tsx` — typed items.
- `.../ScorecardNav.tsx` — right nav with status labels (client; scroll-spy optional).
- Modify: `src/components/scorecard/ScorecardBody.tsx` (rewrite to compose the new sections), `src/app/property-managers/[state]/[city]/[slug]/page.tsx` (call `buildScorecardView`, pass view; drop removed props), and remove the `LendingSignals` import + render.
- Temp: `src/app/dev/scorecard-preview/page.tsx` — PUBLIC harness rendering the new `ScorecardBody` with a fixture view for local screenshots (added in the final task, gated to non-production, removed/flagged before the phase's PR is marked ready).

---

### Task 1: Shared primitives — `LabelChip`, `PositionBar`, `Sparkline`

**Files:** Create `src/components/scorecard/redesign/LabelChip.tsx`, `PositionBar.tsx`, `Sparkline.tsx`.

**Interfaces (Produces):**
- `LabelChip({ label }: { label: ScoreLabel | string })` — renders a small uppercase pill; color by label (strong=good token, good=teal, neutral=muted, watch=amber, insufficient=muted grey, mixed=violet). Import `ScoreLabel` from `@/lib/scorecard/labels`.
- `PositionBar({ position }: { position: number | null })` — a horizontal track with P25/med/P75 ticks and a marker at `position` (0–1); renders a muted "n/a" state when null. Match the `.pos`/`.posmark` look in the mockup.
- `Sparkline({ series, direction }: { series: number[]; direction: MomentumDirection })` — a small inline SVG polyline (match the mockup's `.sparks` SVGs); renders a muted flat placeholder when `series.length < 2`. Import `MomentumDirection` from `@/lib/scorecard/momentum`.

- [ ] **Step 1: Build the three primitives** matching the mockup's chip/position-bar/sparkline markup, using tokens per the map. Each is a pure server component (no client hooks). Complete the JSX for each; `LabelChip` maps every `ScoreLabel` value to a class; `PositionBar` clamps `position` to [0,1] and hides the marker when null; `Sparkline` computes polyline points from `series` (normalize min→max into the SVG box) and colors the line by `direction` (growing/quality→good token, declining→bad, volatile→amber, stable/insufficient→muted).

- [ ] **Step 2: Verify** `npx tsc --noEmit` → 0 errors.

- [ ] **Step 3: Commit** `git add src/components/scorecard/redesign/ && git commit -m "feat(scorecard): shared redesign primitives (label chip, position bar, sparkline)"`

---

### Task 2: `ScorecardHeader`

**Files:** Create `.../ScorecardHeader.tsx`.

**Interfaces:** `ScorecardHeader({ header }: { header: HeaderView })` (import `HeaderView` from `@/lib/scorecard/view-model`).

- [ ] **Step 1: Build** per the mockup header: eyebrow "Property manager scorecard"; `header.name` as the `text-navy` h1; badge row (7-cell `header.quadrant7Cell`, market `header.marketFullName`, and "Single-market" when `header.singleMarket`); the **star chip** top-right (`{header.goldCount} gold · {header.silverCount} silver`, gold/silver star glyphs — reuse the mockup's `.starchip` style with tokens); and a **link-button row**: "View listings on Dwellsy ↗" (`href={header.dwellsyCompanyUrl}`, render only when non-null) + "Operator website ↗" (`href={header.website}`, `target="_blank" rel="noopener noreferrer"`, render only when non-null). Match the mockup's `.linkbtn` styling with tokens.

- [ ] **Step 2:** `npx tsc --noEmit` → 0 errors.

- [ ] **Step 3: Commit** `feat(scorecard): ScorecardHeader (name, stars, Dwellsy + website links)`

---

### Task 3: `ExecReadout`

**Files:** Create `.../ExecReadout.tsx`.

**Interfaces:** `ExecReadout({ readout }: { readout: ReadoutRow[] })` (import `ReadoutRow` from the view-model). Renders the 4-row bordered table from the mockup ("30-second readout" eyebrow): each row = `row.area` (left, `font-semibold`), `row.value` (flex-1), and a `<LabelChip>` when `row.label` is set. Anchor each area to its section (href `#scale-fit` etc.) — the label chip may link to the section.

- [ ] **Step 1: Build** matching the mockup `.readout`. **Step 2:** tsc 0. **Step 3: Commit** `feat(scorecard): ExecReadout 30-second table`

---

### Task 4: `ScaleFitSection` + `PortfolioRangeBar` + `ConcentrationBar` + `RentTierMarker`

**Files:** Create `.../PortfolioRangeBar.tsx`, `.../ConcentrationBar.tsx`, `.../RentTierMarker.tsx`, `.../ScaleFitSection.tsx`.

**Interfaces:**
- `PortfolioRangeBar({ estimate, observedUnits })` — the full-width range bar: observed tick (`good` token), estimate band (low→high), point marker + "N est", confidence chip. Match the mockup `.rangewrap`/`.track`/`.band`. Handle nulls (no band when low/high null; show `estimate.status` message when point null).
- `ConcentrationBar({ topCities, top3Share, cohortTop3 })` — stacked top-cities bar + a "more/less concentrated than peers" one-liner (compare `top3Share` vs `cohortTop3`).
- `RentTierMarker({ position })` — value↔premium track with a marker at `position` (0–1); muted "not available" when null (position is `scaleFit.rentTierPosition`, currently null until the pricing phase — must degrade gracefully).
- `ScaleFitSection({ scaleFit, peers, geographicCoverage })` — the section: `id="scale-fit"`, `dq-section`, numbered header "01 Scale & Fit", `scaleFit.takeaway`, the range bar (full width), then the 2-col grid **left** = ConcentrationBar + RentTierMarker + facts (property type/cities/footprint), **right** = the map (reuse existing `CoverageMapClient` — import it and pass `geographicCoverage`), then the **Similar local players** table from `peers` (each row: name, est size, relative-size bar `peer.relativeSize`, operating `LabelChip peer.operatingLabel`; focal row highlighted; rows link to `/property-managers/.../${peer.slug}` — build the href from the market + slug). Pass `scaleFit: ScaleFitView`, `peers: SelectedPeer[]`, and `geographicCoverage: ScorecardData["geographicCoverage"]`.

- [ ] **Step 1: Build** the four files per the mockup Scale & Fit (map-right / data-left) layout. Confirm `CoverageMapClient`'s real prop shape by reading `src/components/scorecard/CoverageMapClient.tsx` and pass exactly what it expects (coverageMapPoints/mapBounds/msaBackdropPoints from `geographicCoverage`). **Step 2:** tsc 0. **Step 3: Commit** `feat(scorecard): Scale & Fit section (range bar, map, concentration, rent tier, peers)`

---

### Task 5: `OperatingPerformanceSection`

**Files:** Create `.../OperatingPerformanceSection.tsx`.

**Interfaces:** `OperatingPerformanceSection({ operating }: { operating: OperatingView })`. Section `id="operating-performance"`, header "02 Operating Performance" + `<LabelChip operating.sectionLabel>`, takeaway, a **Strongest / Watch** chip row (`operating.strongest` / `operating.watch`), then one **evidence card per `operating.metrics` row**: title + star glyph (gold/silver) + `<LabelChip metric.label>`; the interpretive line uses `metric.benchmark`; the evidence row = big `metric.value` + `<PositionBar metric.position>` + benchmark text; the sub-metric strip = `metric.sub` joined; a collapsed "▸ Peer comparison" affordance (static disclosure text is fine this phase). Match the mockup `.mcard` cards.

- [ ] **Step 1: Build** per mockup. **Step 2:** tsc 0. **Step 3: Commit** `feat(scorecard): Operating Performance evidence cards`

---

### Task 6: `MomentumSection`

**Files:** Create `.../MomentumSection.tsx`.

**Interfaces:** `MomentumSection({ momentum }: { momentum: MomentumView })`. Section `id="momentum"`, header "03 Momentum" + `<LabelChip>` of the direction, `momentum.takeaway`, then the 4 `momentum.sparklines` as small-multiples (label + direction glyph ↑/→/↓ + `<Sparkline series direction>`; when a sparkline's direction is `insufficient`, show "building history" instead of a line). Collapsed "▸ View full history" affordance (static this phase).

- [ ] **Step 1: Build.** **Step 2:** tsc 0. **Step 3: Commit** `feat(scorecard): Momentum section (sparklines)`

---

### Task 7: `WatchItemsSection` + `ScorecardNav`

**Files:** Create `.../WatchItemsSection.tsx`, `.../ScorecardNav.tsx`.

**Interfaces:**
- `WatchItemsSection({ items }: { items: WatchItem[] })` (import `WatchItem` from `@/lib/scorecard/watch-items`). Section `id="watch-items"`, header "04 Watch Items" + a count chip (non-positive count), a plain-English intro line, then each item per the mockup `.witem`: left type cell (icon glyph + full-word type label colored by kind: risk=bad, data=amber, context=muted, positive=good), right body = bold `item.headline`, `item.explanation`, and the "Ask:" line when `item.ask` is set. Ordered as given (already risk→data→context→positive from the builder).
- `ScorecardNav({ sections }: { sections: Array<{ id: string; label: string; status?: string; statusLabel?: ScoreLabel | string }> }>)` — client component; the right-rail nav with numbered links to `#id` and a small status chip per section (Operating→sectionLabel, Momentum→direction, Watch Items→count). Replaces `ScorecardSidebar`'s section list. Smooth-scroll via `href="#id"` is enough; scroll-spy highlight optional.

- [ ] **Step 1: Build both.** **Step 2:** tsc 0. **Step 3: Commit** `feat(scorecard): Watch Items section + redesigned nav`

---

### Task 8: Assembly — rewrite `ScorecardBody`, wire the page, remove Lending Signals, local render + screenshots

**Files:** Modify `src/components/scorecard/ScorecardBody.tsx`, `src/app/property-managers/[state]/[city]/[slug]/page.tsx`; create temp `src/app/dev/scorecard-preview/page.tsx`; delete/stop-rendering `LendingSignals`.

- [ ] **Step 1: Rewrite `ScorecardBody`** to accept `{ view: ScorecardView; geographicCoverage; ... }` (or compute the view inside from the props it already gets) and compose, in order: `ScorecardHeader` (sticky wrapper ok), `ExecReadout`, `ScaleFitSection`, `OperatingPerformanceSection`, `MomentumSection`, `WatchItemsSection`, the existing `MethodologyFooter` (keep — it's section 05), and `ScorecardNav` in the right rail. Remove `LendingSignals`, `SynthesisLayer`, `PerformanceLayer`, `PortfolioLayer`, `IdentityHero`, `OperatorTrajectorySection` from the render (leave the files for now; just stop importing/rendering them).

- [ ] **Step 2: Wire `page.tsx`** — after loading `scorecard`, `msaPool`, `operatorTrajectory`, compute `const view = buildScorecardView({ scorecard, pool: msaPool, trajectory: operatorTrajectory, marketConcessionMedian })` (derive `marketConcessionMedian` from the existing `concessionContext` — read `src/lib/concession-context.ts` for the market-median field name). Pass `view` + `geographicCoverage` (for the map) to `ScorecardBody`. Drop the now-unused props (peerComparisons/lendingSignals/etc.) from the call.

- [ ] **Step 3: Remove Lending Signals** — delete the `LendingSignals` import + render; grep the repo for user-facing "Lending Signals"/"lending"/"underwriting" strings in scorecard surfaces and remove/reword.

- [ ] **Step 4: Verify build** — `npx tsc --noEmit` → 0 errors; `npm run test:watch-list` → all pass; `npm run build` → succeeds (catches RSC/client boundary issues).

- [ ] **Step 5: Local render harness + screenshots** — create a PUBLIC `src/app/dev/scorecard-preview/page.tsx` (guard: return `notFound()` when `process.env.NODE_ENV === "production"`) that builds a **fixture `ScorecardView`** (representative Doorby-like data, incl. a few momentum points + peers + a couple watch items) and renders the new `ScorecardBody`. Run `npm run dev`, open `http://localhost:3000/dev/scorecard-preview`, and capture full-page screenshots (top → Watch Items). This route is public so no Clerk/DB is needed for the screenshot. **This is the deliverable to show the human.**

- [ ] **Step 6: Commit** `feat(scorecard): assemble redesigned page, remove Lending Signals, add local preview harness`

---

## Self-Review

**Spec coverage:** Header ✓ T2; exec readout ✓ T3; Scale & Fit (range bar/map/concentration/rent-tier/facts/peers) ✓ T4; Operating Performance cards ✓ T5; Momentum ✓ T6; Watch Items + nav ✓ T7; assembly + remove Lending Signals + render/screenshots ✓ T8. Methodology retained (existing `MethodologyFooter`). Deferred (correctly): Momentum share/reach/quality + Watch detectors need the pipeline phase (they degrade to "building history"/absent now); `rentTierPosition` is null until the pricing wiring (RentTierMarker degrades to "not available").

**Placeholder scan:** the plan references the approved mockup file as the markup source of truth (a concrete, complete artifact) + gives exact view-model bindings + the token map per component — implementers translate design→React, they do not invent structure. No "TBD"/"add styling later".

**Type consistency:** components import `ScorecardView`, `HeaderView`, `ReadoutRow`, `ScaleFitView`, `OperatingView`, `MetricRow`, `MomentumView`, `SelectedPeer` from `@/lib/scorecard/view-model`; `ScoreLabel`/`MetricKey` from `./labels`; `MomentumDirection` from `./momentum`; `WatchItem` from `./watch-items`. `CoverageMapClient` reused from existing `src/components/scorecard/`.

**Risk to watch (for the implementer + reviewer):** client/server boundary — `ScorecardNav` (and the Mapbox `CoverageMapClient`) are client components; the sections are server components. Keep `"use client"` only where needed. `npm run build` in T8 is the gate for boundary errors.
