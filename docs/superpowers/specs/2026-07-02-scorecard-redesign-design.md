# Scorecard redesign — operator diligence & monitoring

_Design spec — 2026-07-02. Comprehensive restructure of the property-manager
scorecard. Approved via visual brainstorming (mockups v1→v5)._

## Context

Two primary users: **owners/investors deciding whether to trust a PM with their
assets**, and **acquirers evaluating a PM as a rollup target** — plus ongoing
**monitoring** of managers already engaged. The current scorecard is framed
around credit underwriting ("Lending Signals"), which is the wrong lens. It also
leads with evidence (peer tables, distributions) before the conclusion.

The redesigned page answers four questions, in order:

1. **Should I trust this PM with my assets?** (Operating Performance)
2. **Is this PM an attractive acquisition/rollup target?** (Scale & Fit + Momentum)
3. **What should I monitor over time?** (Momentum + Watch Items)
4. **What should I investigate before hiring/monitoring/acquiring?** (Watch Items)

**Primary design goal:** a reader can scan the page and answer — is this PM the
right size/type for me? Are they good at operating rentals? Are they improving
or declining? What should I investigate? Everything supports those four answers.

## Decisions locked in brainstorming

1. **Voice — judgment labels, no raw rank/composite.** Adopt qualitative
   judgment labels (**Strong / Good / Neutral / Watch / Insufficient Data**) and
   interpretive one-liners. This is a deliberate reversal of the prior
   "facts-only, no adjectives" voice — BUT the hard constraint stands: **never
   surface precise ordinal rank ("#2 of 51") or the raw composite score
   ("74.9/100").** Labels are backed by operator-value-vs-cohort-benchmark and
   stars/percentiles; the underlying number is used internally to derive the
   label, never displayed. See [[scorecard-sharpening-pr1]].
2. **Label thresholds (percentile bands).** Per metric, from the percentile we
   already compute (direction normalized so higher = better everywhere):
   **Strong ≥75 · Good 50–74 · Neutral 25–49 · Watch <25 · Insufficient Data**
   when the cohort is too small / percentile null. A "Watch" metric auto-seeds a
   Watch Item.
3. **Ship shape — one comprehensive release (big-bang).** Includes the new
   pipeline work for Momentum trends + Watch-Item detectors, not just a
   restructure. (Build is internally phased; see Build sequencing.)
4. **Remove "Lending Signals" and all lending/underwriting/credit language.**
5. **Conclusion-first + progressive disclosure** everywhere: takeaway + key
   metrics + interpretation by default; peer tables, distributions, full
   histories, methodology, sample text behind expanders.

## Page architecture

Top-to-bottom, with a sticky right-side nav carrying status labels.

```
Header            operator name · badges · overall star summary · Dwellsy + website links
30-second readout 4-row exec table (Scale&Fit / Operating Perf / Momentum / Watch Items) w/ labels
01 Scale & Fit
02 Operating Performance
03 Momentum
04 Watch Items
05 Methodology & limits
```

### Old → new component mapping (nothing lost, redistributed)

| Current | Becomes |
|---|---|
| IdentityHero | **Header** — name, badges, restored star summary, Dwellsy + website link buttons |
| SynthesisLayer (exec summary prose + headline tiles) | **30-second readout** + per-section **takeaways** (facts-not-judgments wording) |
| PerformanceLayer | **02 Operating Performance** (enriched evidence cards) |
| **LendingSignals** | **Removed.** Metrics redistributed: geo-concentration + rent/pricing tier → Scale & Fit; rent stability + vacancy proxy → Watch Items |
| PortfolioLayer (map, geo, composition, cross-market, rent traj, share traj, concessions, pricing) | Split: map/geo/composition/pricing/concentration → **Scale & Fit**; rent + share trajectory → **Momentum**; concessions → **Watch Items** |
| OperatorTrajectorySection | **03 Momentum** (portfolio sparkline + full history) |
| MethodologyFooter | **05 Methodology & limits** |
| SimilarOperatorsCta | Superseded by **Similar local players** peer group in Scale & Fit |

## Section specs

### Header
- Operator name; badges (7-cell classification, market, single/multi-market).
- **Overall star summary** (gold/silver counts) restored, top-right. Source:
  `countOperatorStars` (existing).
- **Two link buttons** (prominent, with icons — not badge pills):
  - "View listings on Dwellsy ↗" → `https://dwellsy.com/company/<companyId>`
    (companyId shipped in the seed).
  - "Operator website ↗" → scraped website (`company_enrichment.json`, ~40%
    coverage; render only when present).

### 30-second readout
Four rows — Scale & Fit (descriptive), Operating Performance (label), Momentum
(directional label), Watch Items (count). The primary scan. Labels link to
their section.

### 01 Scale & Fit
**Purpose:** what kind of operator, do they fit my portfolio/thesis.
**Layout (approved):** takeaway → **portfolio range bar (full width)** → 2-col
row: left = concentration + rent-tier + facts; **right = tall map** → Similar
local players.

- **Takeaway** (1 sentence): size + type + footprint + price tier.
- **Portfolio range bar:** observed units (`coverage.urusT12`) as a tick +
  estimated portfolio band (`portfolioEstimate.low/high/point`) + confidence
  tier (`portfolioEstimate.confidence` Low/Med/High). Visually separates
  *observed* from *estimated* — the reader must not have to reconcile the two.
- **Map (right, tall):** `geographicCoverage.coverageMapPoints` +
  `msaBackdropPoints`. Tall panel — better for blobby metro footprints than a
  wide banner.
- **Geographic concentration:** top-cities stacked bar (`topCities`) + a
  vs-cohort read (`lendingSignals.geographicConcentration.top3CityShare` vs
  `cohortMedianTop3`).
- **Rent tier:** value↔premium marker from operator median rent
  (`rentTrajectory` latest) vs MSA distribution.
- **Facts:** property type (`quadrant7Cell`), cities observed, footprint,
  active listings.
- **Similar local players (net-new logic):** operators in the same market +
  same 7-cell + similar size band, ranked by similarity; show ~4, each with est.
  size, relative-size bar, and Operating-Performance label; rows link to their
  scorecards. Derived at load from the market's operators (data exists;
  selection logic is new).
- Expanders: full map & all cities; how the portfolio estimate works.

### 02 Operating Performance
**Purpose:** are they good at managing + marketing rentals. **The heaviest
section.**
- **Takeaway** + **Strongest / Watch summary** chips (top strength + weakest
  scored dimension).
- **Metric evidence cards**, one per dimension (Lease-up, Tenant retention, Rent
  performance, Marketing discipline; **Inventory transparency** as a 5th card
  for MF/BTR). Each card:
  - Name + star + **judgment label**.
  - Interpretive one-liner (facts-not-judgments wording, e.g. "leases ~9 days
    faster than the cohort median").
  - **Big value + units** (operator value).
  - **Position bar** — operator's marker in the cohort P25–median–P75
    distribution (no numeric rank shown).
  - **Cohort benchmark + trend arrow** (improving / steady / declining).
  - **Sub-metric strip** — the "where strong/weak" detail: house vs apt DOM
    (`performance.house/aptDomT12`); re-list rate (`tenancy.multiEpisodePct`) +
    house/apt tenure; rent YoY vs cohort + 6-quarter mini-trend; photo coverage
    + completeness (`marketing.*`).
  - Expanders: peer comparison table (focal + 4 neighbors); distribution bands &
    percentiles.
- Data: all metric values/stars/percentiles/benchmarks + sub-metrics exist. The
  **per-metric trend arrow is net-new** (needs per-metric history — see pipeline
  work).

### 03 Momentum
**Purpose:** getting better/worse, larger/smaller, broader/narrower — its own
major section, not a buried chart.
- **Takeaway** (e.g. "larger than first observed, but recent estimates are
  volatile — interpret recent moves cautiously").
- **Sparkline small-multiples (4):** Portfolio, Listing share, Geographic reach,
  Operating quality — each a direction (↑/→/↓) + trend line.
- **Directional section label:** Growing / Stable / Declining, with a *Volatile*
  qualifier when estimates are noisy.
- Expanders: full history (collapse the ~27-row snapshot table behind "View full
  history"); rent trajectory (6 quarters).
- Data: portfolio trend (`OperatorSnapshot`, monthly) + rent trajectory (6q) +
  listing YoY exist. **Net-new (pipeline):** per-metric quality trend,
  geographic-breadth-over-time, multi-period listing-share history, deeper
  quarterly backfill.

### 04 Watch Items (replaces Lending Signals)
**Purpose:** issues, caveats, and follow-ups for selection / monitoring /
diligence — not all negative.
- **Section intro** in plain English ("signals that need a human read… not
  everything here is bad").
- **Count summary** (e.g. "2 to review · 1 context · 1 positive").
- Each item, ordered risks-first: **type label + icon** (Risk / Data limitation
  / Context / Positive; "Risk" carries a "needs follow-up" note) → **bold
  headline** → plain-English explanation → for risks, an explicit **"Ask:"**
  follow-up question. Color-coded by severity.
- Item sources (mostly existing signals, recategorized): high concession use
  (`concessionRate` vs market median, with a compare bar); short observation
  history (`coverage.yearsVisible`); sample-size concerns; geographic
  concentration; rent stability (`lendingSignals.rentStability`); vacancy/
  downtime proxy (DOM+tenancy); rent-tier context.
- **Net-new detectors (pipeline):** concession spike (needs concession history),
  rank/star change (operator dropped out / downgraded — snapshot diffs).

### 05 Methodology & limits
Version, data-as-of, definitions, disclaimers. All methodology-first explanation
stays out of the main flow and lives here / behind expanders.

### Right nav
Overview · Scale & Fit · Operating Performance _(Strong)_ · Momentum _(Mixed)_ ·
Watch Items _(2)_ · Methodology. Status labels mirror the section labels.

## Label system

- **Per-metric:** percentile bands (§Decisions #2).
- **Operating Performance section label** (readout + nav): from the internal
  composite percentile on the same bands. Never shows the number.
- **Scale & Fit:** descriptive, not a verdict (size + type + confidence).
- **Momentum:** directional (Growing/Stable/Declining + Volatile).
- **Watch Items:** count + top severity.

## Voice & language rules

- **Prefer:** Watch Items, diligence/monitoring signals, operating context, data
  confidence, follow-up question.
- **Avoid:** Lending Signals, underwriting-relevant, credit decisioning,
  composite-feeding signal, methodology-first explanations in the main flow.
- Judgment **labels** are allowed; the surrounding prose stays factual (state
  comparable position + observable facts; the label is the verdict). Never
  surface precise rank or composite. The pipeline exec-summary is already
  neutralized (v0.24 / PR #139) — its takeaways feed the new section takeaways.

## Progressive disclosure

Default view: takeaway + key metrics + interpretation. Expanders: peer-neighbor
tables, methodology, sample text, full historical tables, detailed caveats,
full map.

## Data & pipeline work

**Already available (no pipeline work):** companyId (shipped), website
enrichment (`company_enrichment.json`, ~40%), all Operating-Performance metric
values/stars/percentiles/benchmarks + sub-metrics, portfolio estimate + band +
confidence, geography/concentration/rent-tier, concessions, rent trajectory,
monthly portfolio snapshots.

**Net-new (part of this big-bang release):**
1. **Per-metric history** — store per-snapshot per-metric stars/percentiles
   (schema has a JSON column; wire it) → powers per-metric trend arrows + the
   Momentum "quality" sparkline.
2. **Geographic-breadth-over-time** — track market/city count per snapshot →
   Momentum "reach".
3. **Multi-period listing-share history** — beyond the current single YoY →
   Momentum "listing share".
4. **Deeper quarterly backfill** for portfolio/metric history so trends aren't
   just a few months.
5. **Watch-Item detectors** — concession spike (needs concession history);
   rank/star change (snapshot diffs; logic exists in Watch List change-detection
   — reuse).
6. **Similar-local-players selection** logic (same market + 7-cell + size band,
   ranked).

## Build sequencing (within the single release)

1. **Data/pipeline first** — snapshot schema additions (per-metric history, geo
   breadth, share history), backfill, detectors; re-run + re-seed. (Note: any
   full re-seed now safely keeps neutralized prose per PR #139.)
2. **Data layer / types** — surface the new fields + derived label helpers +
   peer-selection + trend summaries.
3. **Components** — Header, ExecReadout, ScaleFit, OperatingPerformance (cards),
   Momentum, WatchItems, nav; remove LendingSignals.
4. **Assembly + delete** old components; pilot one market on preview; verify;
   ship.

## Testing

- Pure logic unit-tested (`npm run test:watch-list` glob): label-band mapping,
  section roll-up, peer-selection, momentum-direction, watch-item
  categorization, trend summarization. A drift-guard test pinning the label
  thresholds to the pipeline eligibility/percentile conventions.
- Server/RSC components verified on Vercel preview (repo convention).

## Explicitly cut / migrated

- **Lending Signals** section removed; the 5 signal cards redistributed (see
  mapping). No "lending/underwriting/credit" strings remain.
- The old headline-tile SynthesisLayer + peer-tables-before-conclusion ordering.

## Open questions / risks

- **Trend depth:** early on, portfolio/metric history is shallow (few
  snapshots); trend arrows should degrade gracefully to "Insufficient history"
  rather than over-claim.
- **Label calibration:** the ≥75/50/25 bands may need tuning once seen across
  many operators; keep thresholds in one constant.
- **Website coverage (~40%):** many operators show only the Dwellsy link; fine
  (graceful). A future scrape pass can lift coverage.
- Scope is large — the build plan (writing-plans) will decompose into reviewable
  PRs even though it ships as one coherent release.
