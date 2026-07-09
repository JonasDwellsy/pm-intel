# Operating-Performance Metric Info Modals — Design

**Date:** 2026-07-08
**Status:** Approved for planning
**Related:** [[scorecard-redesign-status]] (Classic retirement removed the old `InfoIcon`/`MetricInfoProvider`; `metric-definitions.ts` survived but is now orphaned)

## Problem
The scorecard metrics have no in-context explanation since Classic (which carried per-metric "i" modals) was retired. Readers can't learn what "Lease-up speed" or "Marketing discipline" actually measure without leaving for the methodology page. The content dictionary (`src/lib/metric-definitions.ts`) already exists and is complete — its only consumer (the Classic `InfoIcon`) was deleted, so it's currently dead code.

## Goal
Add a small "i" info button to each **Operating Performance** metric — on both the live per-operator scorecard and the home-page sample cards — that opens a modal explaining the metric, sourced from `metric-definitions.ts`. Scope is Operating Performance only (Lease-up speed, Tenant retention, Rent performance, Marketing discipline, Inventory transparency); Scale & Fit / Momentum tiles are out of scope for now.

Non-goals: new copy (reuse the dictionary), changing any metric value/label, touching the pipeline or seed.

## Architecture

### Content
Single source of truth: `metric-definitions.ts`, keyed by `MetricKey`. Each entry has `name`, `definition`, optional `formula` + `variableDefs`, `cohortScope`, `caveats[]`, `methodologyHref`. This design re-homes that orphaned dictionary.

### Component (new): `MetricInfoModal`
`src/components/scorecard/redesign/MetricInfoModal.tsx` — a **client** component (`"use client"`; needs open/close state + keyboard/backdrop handlers).

Props: `{ metricKey: MetricKey }`.

Renders:
- **Trigger:** a small circular "i" button (`aria-label={`About ${def.name}`}`, `type="button"`). Inline, sized to sit next to a metric title without disturbing layout.
- **Modal (when open):** a fixed-position overlay with a translucent backdrop + a centered panel (`role="dialog"`, `aria-modal="true"`, `aria-labelledby` the heading). Panel content, in order:
  1. `def.name` (heading)
  2. `def.definition` (plain-language paragraph)
  3. `def.formula` in a mono block + `def.variableDefs` list (rendered only when present)
  4. "Compared against" — `def.cohortScope`
  5. "Caveats" — `def.caveats` as a list (rendered only when non-empty)
  6. "Full methodology →" link to `/methodology{def.methodologyHref ?? ""}` (opens the methodology page / anchor)
- **Dismiss:** Escape key, backdrop click, and an explicit close ("×") button. Restore focus to the trigger on close.

If `metric-definitions` has no entry for the key (shouldn't happen for the 5 in scope), the trigger renders nothing (defensive).

Styling matches the redesign token system used across `redesign/` (inline styles / the existing chip + card palette). The panel is scroll-safe on mobile (max-height + internal scroll).

### Wiring — surface 1: live scorecard
`src/components/scorecard/redesign/OperatingPerformanceSection.tsx`, `MetricCard`: the card header already renders `{metric.title}` + `StarGlyph` + spacer + `LabelChip`. Insert `<MetricInfoModal metricKey={metric.key} />` immediately after the title (before the star), so every Operating Performance metric card (dom, tenancy, rentPerformance, marketing, communityVisibility) gets an "i". `MetricRow.key` is already a `MetricKey` — no data change.

### Wiring — surface 2: home samples
`src/components/homepage/SampleScorecards.tsx`, the `Cell` component: add an optional `metricKey?: MetricKey` prop; when set, render `<MetricInfoModal metricKey={metricKey} />` next to the cell title. The four call sites pass the fixed keys: Lease-up Speed → `"dom"`, Tenant Retention → `"tenancy"`, Rent Performance → `"rentPerformance"`, Marketing Discipline → `"marketing"`. No change to `MetricCell` data or `page.tsx`.

## Data flow
```
metric-definitions.ts (MetricKey → MetricDefinition)
        │
        └── MetricInfoModal({ metricKey })  [client]
                ├─ OperatingPerformanceSection MetricCard   (metric.key)
                └─ SampleScorecards Cell                    (fixed key per tile)
```

## Testing
- **Content guard (unit):** assert `metric-definitions.ts` has a complete entry (`name` + `definition` + `cohortScope`) for each of the 5 in-scope keys (`dom`, `tenancy`, `rentPerformance`, `marketing`, `communityVisibility`). Catches a future key rename / missing entry that would blank a modal.
- **Wiring guard (source-level, matching `scorecard-share.test.ts`):** assert `OperatingPerformanceSection.tsx` and `SampleScorecards.tsx` import `MetricInfoModal` and render it with a `metricKey`. Cheap regression lock against silent removal.
- `tsc --noEmit` clean; full unit suite green.
- Behavior (open/close/Escape/backdrop) is a client interaction the repo doesn't unit-test (no DOM harness); verify visually on the Vercel PR preview.

## Rollout
Deploy-time only (view components + reusing existing seed fields). No seed/pipeline/DB change. Ships on merge; visible on the PR preview.
