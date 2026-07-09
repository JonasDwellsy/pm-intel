# Market Briefs V2 — Design

**Goal:** Turn the market briefs from static per-market snapshots into a time-aware, distributed product — each brief leads with *what changed since last period*, carries deeper signals, gains a national cross-market brief, and can be emailed on a schedule.

**Architecture:** Keep the existing deterministic aggregation → LLM prose → cache pipeline (`market-brief.ts` builds `MarketBriefData`; `market-brief-prose.ts` calls Claude and caches to `MarketBrief`). Extend the data layer with a period-over-period change block (from `OperatorSnapshot` diffs) and richer standing signals; add a national aggregator; add a cron/email distribution layer reusing the watch-list-digest infrastructure.

**Tech:** Next.js 16 / Prisma+Postgres / Claude prose gen / Resend (email, Phase 3) / Vercel cron.

## Global Constraints

- Facts-not-judgments voice; never surface rank or composite score (same rule as scorecards).
- Briefs stay entitlement-agnostic/public at the market level for now (no per-org gating in Phase 1–2; revisit for email in Phase 3).
- "What changed" = **latest `OperatorSnapshot` vs the prior snapshot date** (reuse `diffSnapshots` from `src/lib/watch-list/change-detection.ts`). Cadence = snapshot capture cadence (~monthly, at each pipeline refresh / deploy re-seed).
- Prose word budgets stay tight (headline ≤60 words; each section ≤130).
- No new methodology; reads existing seed + snapshot history.

---

## Phase 1 — Per-market content (the core value)

### 1a. "Since last period" change block

**Data (`market-brief.ts`):** add `sinceLastPeriod` to `MarketBriefData`, computed from the two most recent `OperatorSnapshot` dates for the market's operators:

- **New entrants** — operators whose prior snapshot was absent / `isEligibleForRanking=false` and are now eligible.
- **Rating moves** — operators whose `starGoldCount`/`starSilverCount` (or a specific metric in `starsPerMetric`) changed; surface the largest gold-count swings both directions.
- **Size swings** — largest `estimatedPortfolioPoint` % moves; band changes (`estimatedPortfolioBand`).
- **Share swings** — largest movers in `t12ListingsCount ÷ market total` between the two dates.
- **Cohort moves** — operators that changed `quadrant7Cell` (requires 1b; empty until two snapshots carry the field).
- **Footprint** — cross-market entrants/exits from `topMSAs` set delta.

Reuse `diffSnapshots(prev, cur)` where possible; add a market-level roll-up (`gatherMarketChanges(marketSlug)`) alongside the existing `digest-gather.ts` (watch-list-scoped) so the two share the diff primitive but differ in scope. Degrades gracefully: if only one snapshot exists (first period), `sinceLastPeriod = null` and the prose omits the section.

**Prose:** add a `sinceLastPeriod` section to `BriefProse` (new `MarketBrief.sinceLastPeriod` column) rendered **first**, above `headlineRead`. The headline may reference the change block.

### 1b. Snapshot captures `quadrant7Cell`

Add `quadrant7Cell String?` to `OperatorSnapshot` (migration) and populate it in `captureOperatorSnapshots` (seed.ts). Nullable + backfill-tolerant (older rows stay null, like `t12ListingsCount`). Enables cohort-move detection from the next two snapshots onward. The current reclassification is a one-time event, not a recurring brief signal.

### 1c. Deeper standing signals

Extend `MarketBriefData` with signals the brief ignores today, all already in the seed / snapshots:
- **Rent trajectory** — market `marketRentGrowthT12` + cohort median listing-trajectory YoY.
- **Concession trend** — market concession rate + direction (from snapshot `concessionRate` deltas).
- **Momentum standouts** — operators with the strongest/weakest momentum (reuse `momentumProfile` / trajectory).
- **Retention leaders** — top tenant-retention operators (from scorecards).

Fold into `operatorLandscape` / `notableSignals` prose; no new sections.

### Cache-key implication

`inputDigest` already regenerates prose on any input change, so enriching `MarketBriefData` auto-invalidates cached briefs on next visit. The added `sinceLastPeriod` column requires a `MarketBrief` migration.

### Tests
- `gatherMarketChanges` unit tests (entrant, rating move, size/share swing, single-snapshot → null).
- Prose-generator schema test updated for the new `sinceLastPeriod` field.
- Snapshot-capture test asserts `quadrant7Cell` persisted.

---

## Phase 2 — National / cross-market brief

New aggregator `buildNationalBriefData()` over all 34 markets (reuses per-market `MarketBriefData`): national rent/share direction, standout markets (biggest share consolidation/fragmentation), standout operators (largest multi-market movers), aggregate 7-cell shift, notable cohort/rating moves nationally. New prose template + `MarketBrief` row keyed `marketSlug = "__national__"` (or a dedicated table). Surfaced at the top of `/briefs`. Medium detail — spec'd fully at start of Phase 2.

---

## Phase 3 — Email + scheduling

Vercel cron (`/api/cron/market-brief-digest`, mirrors `watch-list-digest`) that, on a new `snapshotDate`, emails subscribers the national brief + their entitled markets' change blocks via Resend. New `BriefSubscription` prefs (or reuse `DigestPreference`). HMAC opt-out. **Inert until `RESEND_API_KEY` + verified from-address + `CRON_SECRET` are set in Vercel** — same dependency as the existing digest. Preview via `?dryRun=1`. Medium detail — spec'd fully at start of Phase 3.

---

## Sequencing & rollout

1. **Phase 1** first (foundation both others draw on). Within it: **1b** (snapshot field) → **1a** (change block, the headline value) → **1c** (deeper signals). Each is an independently testable, committable step.
2. **Phase 2** reuses the enriched per-market data.
3. **Phase 3** distributes the improved content.

Phase 1 ships as one PR; 2 and 3 as their own PRs with their own detailed specs written at the time (this doc scopes them at a level sufficient to sequence, not to implement).

## Risks / open items

- **Cohort-move detection is empty until two snapshots carry `quadrant7Cell`** (~two refresh cycles). Acceptable; the rest of the change block works from existing fields immediately.
- **Snapshot cadence ≈ monthly**, so "since last period" ≈ month-over-month, not weekly. The `/briefs` copy currently says "weekly" — align the copy to actual cadence in Phase 1.
- **Prose latency/cost**: adding a section grows each generation slightly; caching absorbs it (regenerate only on data change).
- National brief prose must avoid implying market coverage counts beyond the 34 (same guard as per-market prose).
