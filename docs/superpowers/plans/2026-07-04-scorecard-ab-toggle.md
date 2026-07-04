# Scorecard A/B Toggle (Classic vs New) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship the redesigned scorecard ("New", B) alongside the current production scorecard ("Classic", A) on the same route, with a cookie-sticky per-browser toggle; Classic is the default until we flip it. De-risks the big-bang replacement.

**Architecture:** The classic render path was orphaned (not deleted) by the redesign assembly. Restore the classic body as `ClassicScorecardBody` (from `main`), which renders the still-present classic layer components. `page.tsx` reads a `scorecard_view` cookie (default `"classic"`) and takes ONE of two data-loading + render branches. A small client toggle sets the cookie and reloads.

**Tech Stack:** Next.js 16 App Router (server `cookies()` from `next/headers`), React 19, TypeScript. `npm run test:watch-list`.

## Global Constraints

- **Classic (A) is the exact current production scorecard** — restore it faithfully from `main` (`git show main:...`). Do not "improve" it; it's the safety net.
- **New (B) is the redesign already on this branch** — unchanged.
- **Default = Classic.** Only `scorecard_view=new` shows B. Cookie is per-browser, no DB, no migration.
- **Load only the chosen branch's data** — do not run both the classic builders AND the redesign view-model on every request; branch on the cookie first.
- Never surface rank/composite in B (unchanged); Classic keeps its existing behavior.
- Entitlement gate + the quadrant-segment branch in `page.tsx` stay exactly as they are (the toggle only affects the per-operator scorecard render).
- Keep the suite green.

---

### Task 1: Restore `ClassicScorecardBody`

**Files:**
- Create: `src/components/scorecard/ClassicScorecardBody.tsx`

**Interfaces — Produces:** `ClassicScorecardBody(props)` with the SAME prop shape `main`'s `ScorecardBody` had (scorecard, isClaimed, marketFootprint, operatorTrajectory, peerComparisons, lendingSignals, cohortRentTrajectory, compareHref, shareTrajectory, concessionContext, crossMarketOperator?).

- [ ] **Step 1:** `git show main:src/components/scorecard/ScorecardBody.tsx` → save as `src/components/scorecard/ClassicScorecardBody.tsx`, renaming the exported function `ScorecardBody` → `ClassicScorecardBody` (and any internal default export). Do NOT otherwise modify it. It imports the classic layer components (`IdentityHero`, `SynthesisLayer`, `PerformanceLayer`, `LendingSignals`, `PortfolioLayer`, `OperatorTrajectorySection`) + helpers — all still present on this branch, unchanged from `main`.
- [ ] **Step 2:** `npx tsc --noEmit` → 0 errors (confirms every import + type the classic body needs still resolves on this branch). If a type drifted (e.g. an additive field), adjust ONLY as needed to compile — do not change classic behavior.
- [ ] **Step 3: Commit** — `feat(scorecard): restore classic scorecard body as ClassicScorecardBody (A of A/B)`

---

### Task 2: `page.tsx` cookie-gated dual path

**Files:**
- Modify: `src/app/property-managers/[state]/[city]/[slug]/page.tsx`

**Interfaces — Consumes:** `ClassicScorecardBody` (Task 1); the redesigned `ScorecardBody` + `buildScorecardView` (already imported). **Produces:** the render branch consumed by the toggle (Task 3) via the `scorecard_view` cookie.

- [ ] **Step 1:** In the per-operator branch (after the entitlement gate, before data loading), read the cookie: `import { cookies } from "next/headers";` then `const view = (await cookies()).get("scorecard_view")?.value === "new" ? "new" : "classic";`
- [ ] **Step 2:** Branch the data-loading + render on `view`:
  - `view === "new"` → the CURRENT redesign path (keep exactly as-is: `loadMsaPool` + `loadOperatorTrajectory` + multi-market members + `buildScorecardView` + `<ScorecardBody view=... />`).
  - `view === "classic"` → restore `main`'s classic loading (from `git show main:src/app/property-managers/[state]/[city]/[slug]/page.tsx`): the imports (`loadMarketFootprint` from `@/lib/cross-market`, `buildPeerComparisons`, `buildLendingSignals`, `buildCohortRentTrajectory`, `buildShareTrajectoryView`, `hasComparablePeers`), the `Promise.all([loadMarketFootprint(...), loadMsaPool, loadOperatorTrajectory])`, the derived builders, `crossMarketContext`, and `<ClassicScorecardBody ...classic props... />`.
  - Only the selected branch's loads run (guard so classic builders don't execute for `view==="new"` and vice-versa).
  - Keep the shared `loadScorecard`, entitlement gate, `TrackEvent`, and the quadrant-segment branch unchanged.
- [ ] **Step 3:** Render the toggle (Task 3's `ScorecardViewToggle`, `currentView={view}`) above the chosen body in BOTH branches so users can switch either way.
- [ ] **Step 4:** `npx tsc --noEmit` → 0; `npm run test:watch-list` → pass; `npm run build` → compiles (this touches the live route — build must pass).
- [ ] **Step 5: Commit** — `feat(scorecard): cookie-gated Classic/New render branch on the scorecard route`

---

### Task 3: `ScorecardViewToggle` client component

**Files:**
- Create: `src/components/scorecard/ScorecardViewToggle.tsx`

**Interfaces — Produces:** `ScorecardViewToggle({ currentView }: { currentView: "classic" | "new" })` — a `"use client"` component rendering a compact "Classic ⇄ New" switch. On change it sets the cookie `document.cookie = "scorecard_view=<choice>; path=/; max-age=31536000; samesite=lax"` then `window.location.reload()` so the server re-renders the chosen branch.

- [ ] **Step 1:** Implement the client toggle: two labeled segments (Classic | New), the current one highlighted per `currentView`; clicking the other sets the cookie + reloads. Small, tasteful, matches the redesign's chrome (or a simple pill switch). Copy: "Scorecard: Classic | New" (facts-not-judgments; no "beta"/"lending"). Keep it visually unobtrusive (top of the scorecard).
- [ ] **Step 2:** `npx tsc --noEmit` → 0; `npm run build` → compiles.
- [ ] **Step 3: Commit** — `feat(scorecard): Classic/New cookie toggle control`
- [ ] **Step 4 (controller):** render the live route both ways (cookie classic → A; cookie new → B), screenshot both + the toggle, confirm the switch flips the render, bring to Jonas.

---

## Self-Review

**Coverage:** A restored (T1) + gated render (T2) + toggle (T3) + default Classic (cookie absent → classic). ✅
**Placeholder scan:** classic code is restored verbatim from `main` via `git show` (implementers copy known-good code, not transcribe) — deliberate + lowest-risk. ✅
**Type consistency:** `ClassicScorecardBody` prop shape = main's `ScorecardBody`; `ScorecardViewToggle` prop `currentView: "classic"|"new"` matches page.tsx's `view`. ✅
**Constraint check:** default classic; one branch's data loads per request; entitlement/segment branches untouched; no DB/migration (cookie only). ✅
