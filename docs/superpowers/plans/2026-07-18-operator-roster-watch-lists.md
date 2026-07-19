# Operator-Roster Watch Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "watch a roster of operators and monitor them" a first-class, obvious path over the existing unified watch-list object — verb-first entry points, a market multi-select add flow, a search-and-add modal, and roster-framed results — with no schema change.

**Architecture:** All flows converge on the existing `WatchList` + `WatchListMember` object (pinned/smart/hybrid derived from content via `src/lib/watch-list/kind.ts`). Two assembly flows (market multi-select + search-and-add) plus the existing per-operator pin all funnel through one shared client helper that creates-or-targets a list and pins N operators via the existing `/api/watch-lists` + `/members` endpoints. The rest is re-labeling (content-descriptor cards, verb entry points, roster-framed results) of surfaces that already exist.

**Tech Stack:** Next.js 16 / React 19 / TypeScript, Vitest + React Testing Library (`test:components`), node:test (`test:watch-list`), Clerk auth, existing `pm-search.ts` in-memory operator index.

## Global Constraints

- **No schema/data-model change.** `WatchList` + `WatchListMember` already support rosters; the `kind` column is gone and pinned/smart/hybrid derives from content via `src/lib/watch-list/kind.ts` (`hasCriteria`, `deriveListKind`).
- **Entitlement safety unchanged.** Only operators the caller can already see are addable; pins go through the existing `POST /api/watch-lists/[id]/members`, which authorizes via `canEditList` (owner-only). No task may bypass that endpoint.
- **Describe by content, drop the jargon.** UI says "Watch list" everywhere; no "Pick list / Smart list / Hybrid" pills. Cards describe content: `"{n} operators"`, criteria chips, or both. Entry points are verbs: **"Watch operators"** and **"Build a smart list"**. Remove user-facing "pick list" strings.
- **memberKey derivation is fixed:** an operator's pin key is `canonicalOperatorId ?? slug` (matches `PMListItem` line 107 and `apply.ts`). Every add path uses exactly this.
- **Create-list request shape** (existing contract, post-#255 — no `kind`): `POST /api/watch-lists` with `{ name, description?, requiredCriteria: [], preferredCriteria: [], excludedCriteria: [] }` → `{ watchList: { id } }`. A criteria-less list derives as a pinned roster.
- **CI gate:** `npx tsc --noEmit` → 0; `npm run test:watch-list`; `npm run test:components`. Vitest for React components (mirror `AddToWatchList.test.tsx` / `SearchResultRow.test.tsx`); node:test for pure `src/lib` modules.
- No property-level data (separate item #1). No changes to the scoring/criteria or digest engines — the alerts opt-in only links to the existing `settings/notifications`.

---

## File Structure

- **Create** `src/lib/watch-list/pin-client.ts` — shared `addOperatorsToWatchList` helper (create-or-target a list, pin N memberKeys). Single source for all assembly flows.
- **Create** `src/lib/watch-list/pin-client.test.ts` — node:test (fetch stubbed).
- **Create** `src/components/watch-list/WatchOperatorsModal.tsx` + `.test.tsx` — search-and-add roster modal.
- **Create** `src/components/watch-list/WatchListsIndexActions.tsx` (client) — the "Watch operators" / "Build a smart list" entry-point row on the index (hosts the modal trigger). Replaces `NewPickListButton`'s framing.
- **Modify** `src/components/watch-list/AddToWatchList.tsx` — reuse the shared helper for its "+ New list" path; align copy.
- **Modify** `src/components/watch-list/WatchListIndex.tsx` — content-descriptor cards (drop the derived-kind pill).
- **Modify** `src/app/watch-lists/page.tsx` — swap the entry-point area to `WatchListsIndexActions`; drop `NewPickListButton`.
- **Modify** `src/components/market/RankedOperatorList.tsx` — multi-select state + sticky "Add N selected to a watch list" bar.
- **Modify** `src/app/watch-lists/[id]/results/page.tsx` — roster-framed header + alerts opt-in link.
- **Delete** `src/components/watch-list/NewPickListButton.tsx` (+ its test if any) — superseded by `WatchListsIndexActions`.

---

## Task 1: Shared `addOperatorsToWatchList` helper + AddToWatchList reuse

**Files:**
- Create: `src/lib/watch-list/pin-client.ts`
- Test: `src/lib/watch-list/pin-client.test.ts`
- Modify: `src/components/watch-list/AddToWatchList.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface AddOperatorsResult { listId: string; added: number; failed: number; }
  export async function addOperatorsToWatchList(
    target: { listId: string } | { newName: string },
    memberKeys: readonly string[]
  ): Promise<AddOperatorsResult>;
  ```
- Consumed by Tasks 2 and 4 (and AddToWatchList's create path).

- [ ] **Step 1: Write the failing test** (`pin-client.test.ts`, node:test; stub `global.fetch`).

```ts
import test from "node:test";
import { strict as assert } from "node:assert";
import { addOperatorsToWatchList } from "./pin-client";

function stubFetch(handler: (url: string, init?: RequestInit) => { status?: number; body: unknown }) {
  (globalThis as { fetch?: unknown }).fetch = async (input: unknown, init?: RequestInit) => {
    const { status = 200, body } = handler(String(input), init);
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  };
}

test("newName target creates a criteria-less list then pins each memberKey", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  stubFetch((url, init) => {
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url, body });
    if (url === "/api/watch-lists") return { body: { watchList: { id: "list-new" } } };
    return { body: { ok: true } }; // /members
  });
  const res = await addOperatorsToWatchList({ newName: "My PMs" }, ["acme", "beta"]);
  assert.equal(res.listId, "list-new");
  assert.equal(res.added, 2);
  assert.equal(res.failed, 0);
  const create = calls.find((c) => c.url === "/api/watch-lists")!;
  assert.deepEqual(create.body, {
    name: "My PMs", description: null,
    requiredCriteria: [], preferredCriteria: [], excludedCriteria: [],
  });
  assert.equal(calls.filter((c) => c.url === "/api/watch-lists/list-new/members").length, 2);
});

test("listId target skips creation and pins into the existing list; counts failures", async () => {
  stubFetch((url) => {
    if (url.endsWith("/members")) return url.includes("beta") ? { status: 500, body: {} } : { body: {} };
    throw new Error("should not create a list");
  });
  const res = await addOperatorsToWatchList({ listId: "list-x" }, ["acme", "beta"]);
  assert.equal(res.listId, "list-x");
  assert.equal(res.added, 1);
  assert.equal(res.failed, 1);
});
```

- [ ] **Step 2: Run it, verify it fails.** `node --import tsx --test src/lib/watch-list/pin-client.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `pin-client.ts`.**

```ts
// Shared client helper for every "add operators to a watch list" flow —
// the market multi-select bar, the search-and-add modal, and the
// per-operator "+ New list" path all funnel through here so the create +
// pin contract lives in one place. Pins go through the existing
// entitlement-safe endpoints; nothing here bypasses /members' canEditList
// authorization.
export interface AddOperatorsResult {
  listId: string;
  added: number;
  failed: number;
}

export async function addOperatorsToWatchList(
  target: { listId: string } | { newName: string },
  memberKeys: readonly string[]
): Promise<AddOperatorsResult> {
  let listId: string;
  if ("listId" in target) {
    listId = target.listId;
  } else {
    const res = await fetch("/api/watch-lists", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: target.newName,
        description: null,
        requiredCriteria: [],
        preferredCriteria: [],
        excludedCriteria: [],
      }),
    });
    if (!res.ok) throw new Error(`Failed to create watch list (${res.status}).`);
    const data = (await res.json()) as { watchList: { id: string } };
    listId = data.watchList.id;
  }

  // De-dupe keys defensively; pin each. allSettled so one bad key doesn't
  // abort the batch — the caller surfaces added/failed.
  const unique = Array.from(new Set(memberKeys));
  const outcomes = await Promise.allSettled(
    unique.map(async (memberKey) => {
      const r = await fetch(`/api/watch-lists/${listId}/members`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memberKey }),
      });
      if (!r.ok) throw new Error(String(r.status));
    })
  );
  const added = outcomes.filter((o) => o.status === "fulfilled").length;
  return { listId, added, failed: unique.length - added };
}
```

- [ ] **Step 4: Run tests, verify pass.** `node --import tsx --test src/lib/watch-list/pin-client.test.ts` → 2/2.

- [ ] **Step 5: Refactor AddToWatchList's create path + align copy.** In `src/components/watch-list/AddToWatchList.tsx`, replace the inline "create list then POST member" block (the create-new flow, ~lines 178-220) with a call to `addOperatorsToWatchList({ newName }, [memberKey])`, preserving the existing UX (optimistic add of the new list to the popover, checked). Do NOT change the existing checkbox toggle (single add/remove of an existing membership) — that stays as-is. Align copy: header stays "Pin to a watch list"; ensure no "pick list" wording remains (there is none in the rendered copy post-#255, but confirm). Keep the file's existing tests green.

- [ ] **Step 6: Verify.** `npx tsc --noEmit` → 0; `npm run test:components` (AddToWatchList test green).

- [ ] **Step 7: Commit.**
```bash
git add src/lib/watch-list/pin-client.ts src/lib/watch-list/pin-client.test.ts src/components/watch-list/AddToWatchList.tsx
git commit -m "feat(watch-list): shared addOperatorsToWatchList helper; AddToWatchList reuses it"
```

---

## Task 2: "Watch operators" search-and-add modal

**Files:**
- Create: `src/components/watch-list/WatchOperatorsModal.tsx`
- Test: `src/components/watch-list/WatchOperatorsModal.test.tsx`

**Interfaces:**
- Consumes `addOperatorsToWatchList` (T1); `searchPMs` + `filterResultsByEntitlement` + `PMSearchResult` from `@/lib/pm-search`; `useEntitledMarkets` from `@/components/search/useEntitledMarkets` (mirror `SearchInput.tsx`).
- Produces: `export function WatchOperatorsModal({ open, onClose }: { open: boolean; onClose: () => void })`.

**Behavior:** a dialog with (1) an operator search box → live results from `searchPMs(query)` filtered by entitlement; (2) clicking a result adds it as a chip (dedupe by `memberKey = result.canonicalOperatorId ?? result.slug` — mirror `PMListItem`; only operator-tier results are addable, skip pure `market`-tier entries); (3) a list-name field; (4) "Create & watch" → `addOperatorsToWatchList({ newName }, memberKeys)` → on success `router.push('/watch-lists/${listId}/results')`. Disable submit until ≥1 operator + non-empty name. Surface `failed > 0` inline.

- [ ] **Step 1: Write the failing component test** (mirror `AddToWatchList.test.tsx` setup: RTL + userEvent; mock `@clerk/nextjs` `useAuth` signed-in; stub `global.fetch` for the create + members calls; mock `next/navigation` `useRouter`). Mock `@/lib/pm-search` `searchPMs` to return two operator results for a query and `filterResultsByEntitlement` to pass them through. Assert: typing a query renders the two results; clicking both adds two chips; entering a name + clicking "Create & watch" fires one `POST /api/watch-lists` then two `POST …/members`, and calls `router.push` with `/watch-lists/<newid>/results`.

- [ ] **Step 2: Run it, verify it fails** (module not found).

- [ ] **Step 3: Implement `WatchOperatorsModal.tsx`.** `"use client"`. Reuse `SearchInput`'s entitlement scoping pattern (`useEntitledMarkets` → `filterResultsByEntitlement(searchPMs(q), entitled)`). State: `query`, `results`, `selected: Map<memberKey, {name}>`, `name`, `busy`, `error`. Derive `memberKey` from a result exactly as `PMListItem` does. On submit call the T1 helper. Match the app's existing dialog/overlay styling (reuse the pattern in `SearchModal.tsx` or the existing modal primitive the codebase uses — locate and match, do not introduce a new modal system).

- [ ] **Step 4: Run tests, verify pass.**

- [ ] **Step 5: Verify.** `npx tsc --noEmit` → 0; `npm run test:components` green.

- [ ] **Step 6: Commit.**
```bash
git add src/components/watch-list/WatchOperatorsModal.tsx src/components/watch-list/WatchOperatorsModal.test.tsx
git commit -m "feat(watch-list): search-and-add Watch Operators modal (roster by name)"
```

---

## Task 3: Index entry points + content-descriptor cards

**Files:**
- Create: `src/components/watch-list/WatchListsIndexActions.tsx`
- Modify: `src/app/watch-lists/page.tsx`
- Modify: `src/components/watch-list/WatchListIndex.tsx`
- Delete: `src/components/watch-list/NewPickListButton.tsx` (and its test if present)

**Interfaces:** Consumes `WatchOperatorsModal` (T2); `hasCriteria` from `@/lib/watch-list/kind`.

- [ ] **Step 1: `WatchListsIndexActions.tsx`** (`"use client"`) — renders the two primary entry points: a **"Watch operators"** button that opens `WatchOperatorsModal` (local `open` state), and a **"Build a smart list"** link to the existing criteria/editor create route (the same href `NewPickListButton`'s neighbor "+ New watch list" used — confirm it in `page.tsx` lines ~155-160). Match existing button styling (`buttonVariants`).

- [ ] **Step 2: Wire into `page.tsx`.** Replace the `NewPickListButton` + "+ New watch list" block (lines ~149-160) with `<WatchListsIndexActions />`. Remove the `NewPickListButton` import. Keep `TemplateGrid` (the empty-state templates) as-is for now.

- [ ] **Step 3: Content-descriptor cards in `WatchListIndex.tsx`.** Remove the derived-kind pill (the `deriveListKind`-based `<span>…Pick list/Hybrid…</span>` block added in #256). Replace the card's descriptor with plain content:
  - if `(pinnedCounts[bb.id] ?? 0) > 0`: a `"{n} operators"` line (reuse the existing pin-count line markup);
  - if `hasCriteria(bb)`: the existing required/preferred/excluded `CountChip` row;
  - a list with both shows both (operators line + chips); a list with neither shows the "No criteria yet" state.
  Drop the `deriveListKind` import if now unused; keep `hasCriteria`. No "pick list" strings.

- [ ] **Step 4: Delete `NewPickListButton.tsx`** (+ test if any). Grep to confirm no other importer: `grep -rn "NewPickListButton" src`.

- [ ] **Step 5: Component test** — extend/adjust an index-level test (or add `WatchListIndex.test.tsx` if none) asserting: an operators-only list renders "{n} operators" and NO Pick/Smart/Hybrid pill; a criteria-only list renders the chips; a both list renders both. Mirror existing component-test setup.

- [ ] **Step 6: Verify.** `npx tsc --noEmit` → 0; `npm run test:components` green; `grep -rn 'Pick list' src --include=*.tsx | grep -v '\.test\.'` → no user-facing hits.

- [ ] **Step 7: Commit.**
```bash
git add src/components/watch-list/WatchListsIndexActions.tsx src/app/watch-lists/page.tsx src/components/watch-list/WatchListIndex.tsx
git rm src/components/watch-list/NewPickListButton.tsx
git commit -m "feat(watch-list): verb-first index entry points + content-descriptor cards"
```

---

## Task 4: Market multi-select → add to watch list

**Files:**
- Modify: `src/components/market/RankedOperatorList.tsx` (the client component that owns the `PMListItem` map; confirm — if the map lives elsewhere, instrument that component and note it in the report)
- Test: `src/components/market/RankedOperatorList.test.tsx` (create if absent)

**Interfaces:** Consumes `addOperatorsToWatchList` (T1). memberKey per operator = `canonicalOperatorId ?? slug` (same as `PMListItem` line 107).

- [ ] **Step 1: Write the failing component test.** Render `RankedOperatorList` with 3 fixture operators (signed-in via the `useAuth` mock; stub `fetch` for `GET /api/watch-lists` → the user's own lists, plus create + members). Assert: a "Select" affordance toggles a per-row checkbox; selecting two shows a "2 selected" action bar; clicking "Add to a watch list" → choosing an existing list fires two `POST …/members` with the two memberKeys; the "+ New list" path fires one create then two members.

- [ ] **Step 2: Run it, verify it fails.**

- [ ] **Step 3: Implement selection + action bar in `RankedOperatorList.tsx`.** Add `selected: Set<string>` state keyed by memberKey; render a checkbox per row (either inside `PMListItem` behind a new optional `selectable`/`onToggle` prop, or in the list's row wrapper — choose the least invasive; do NOT disturb `PMListItem`'s existing click-to-navigate + `AddToWatchList` corner control). Render a sticky bottom action bar when `selected.size > 0`: "N selected · Add to a watch list · Clear". "Add to a watch list" opens a small target picker (fetch the caller's own lists — reuse the `ownerId === userId` filter shape AddToWatchList uses — plus a "+ New list…" name field), then calls `addOperatorsToWatchList(target, [...selected])`; on success toast/confirm and clear selection. Entitlement is inherent (the market view only renders operators the caller can see; `/members` re-authorizes).

- [ ] **Step 4: Run tests, verify pass.**

- [ ] **Step 5: Verify.** `npx tsc --noEmit` → 0; `npm run test:components` green.

- [ ] **Step 6: Commit.**
```bash
git add src/components/market/RankedOperatorList.tsx src/components/market/RankedOperatorList.test.tsx
git commit -m "feat(watch-list): multi-select operators from a market to a watch list"
```

---

## Task 5: Roster-framed results + alerts opt-in

**Files:**
- Modify: `src/app/watch-lists/[id]/results/page.tsx`

**Interfaces:** Consumes `hasCriteria` / pin count already computed on this page; the existing change banner + `settings/notifications` route.

- [ ] **Step 1: Roster header framing.** When the list has pins (roster/hybrid), lead the header with `"{n} operators watched"` (n = the pinned member count already loaded for `pins`/`canManageMembers`) instead of the criteria-match headline; keep the existing "X of Y match · fit score range" line only for lists that have criteria (smart/hybrid) — a pins-only list shows the operators-watched framing (this dovetails with the existing `skipCriteria` branch in the header). Keep the change-since-last-visit banner and render it prominently for roster lists (it's the monitoring payoff).

- [ ] **Step 2: Alerts opt-in.** Add a small, visible prompt near the header — "Get a monthly email when these operators move" — linking to `/settings/notifications` (the existing digest preference). Do not add a per-list toggle; link only. Copy must not promise delivery beyond what the digest provides.

- [ ] **Step 3: Verify.** `npx tsc --noEmit` → 0; `npm run test:watch-list` + `npm run test:components` green (no regressions; this page's logic is largely display).

- [ ] **Step 4: Commit.**
```bash
git add src/app/watch-lists/[id]/results/page.tsx
git commit -m "feat(watch-list): roster-framed results header + monthly alerts opt-in"
```

---

## Task 6: Full gate + review + PR

- [ ] **Step 1: Full CI gate** — `npx tsc --noEmit && npm run test:watch-list && npm run test:components` → all green. If stale `.next/types/validator.ts` errors appear, `rm -f .next/types/validator.ts .next/dev/types/validator.ts` and re-run tsc.
- [ ] **Step 2: Vocabulary audit** — `grep -rn 'pick list\|Pick list' src --include="*.ts" --include="*.tsx" | grep -v '\.test\.'` → no user-facing occurrences remain; confirm `NewPickListButton` is fully removed (`grep -rn NewPickListButton src`).
- [ ] **Step 3: Manual smoke via the browser preview** (per the harness verification workflow): index shows "Watch operators" + "Build a smart list" and content-descriptor cards; the modal creates a roster and lands on its results; a market's multi-select adds operators to a list; the roster results header reads "N operators watched" with the alerts link.
- [ ] **Step 4: Final whole-branch review** (opus) + address findings.
- [ ] **Step 5: Finish** — superpowers:finishing-a-development-branch → push + PR (Jonas merges via "merge N").

---

## Self-Review (completed during planning)

- **Spec coverage:** A→T3; B→T4; C→T2; D→T5; E→T1 (copy). Shared assembly path→T1. All spec sections mapped.
- **Placeholders:** none — pure helper has full code + tests; UI tasks give exact files, anchors, interfaces, and concrete test assertions. Two surfaces flagged for in-task confirmation (RankedOperatorList owning the map; the exact modal primitive to reuse) rather than guessed.
- **Type consistency:** `addOperatorsToWatchList(target, memberKeys)` signature identical across T1/T2/T4; memberKey = `canonicalOperatorId ?? slug` stated once as a global constraint and reused; create-list request shape stated once and reused.
