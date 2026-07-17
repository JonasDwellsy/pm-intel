# Watch-List Pins + Unified Visibility — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add manual "pick lists" (a stored set of companies on a watch list) and a unified visibility model (lists owned by a user, private by default, opt-in org-share view-only), reusing the existing results/CSV/trajectory/alert pipeline.

**Architecture:** New `WatchListMember` table + a `kind` column on `WatchList`. Authz moves from org-only to **own OR shared (view) / owner-only (edit)** via pure predicate functions. `applyWatchList` unions pinned members into results, keeping the entitlement guard. A new "Add to watch list" client island + member API route. Digest recipients follow visibility.

**Tech Stack:** Next.js 16 (App Router, API routes), React 19, Prisma+Neon, Clerk, `node:test` (pure/authz) + Vitest (component).

**Spec:** `docs/superpowers/specs/2026-07-17-watch-list-pins-and-visibility-design.md`

## Global Constraints

- **Never run `prisma migrate dev/deploy` or `prisma db seed` locally** (shared Neon). Hand-author migrations (mirror `prisma/migrations/*/migration.sql`); `npx prisma generate` only. Migration applies on deploy.
- CI gate = `npx tsc --noEmit` + `npm run test:watch-list` + `npm run test:components`.
- The store function is spelled **`listWatchListes`** and the GET body key is `watchListes` — keep the (mis)spelling; do not rename.
- Authz is **security-critical.** New rule, exact: **view** a list iff `ownerId === userId` OR (`isShared === true` AND `organizationId === activeOrgId`); **edit/delete** iff `ownerId === userId` OR (`ownerId === LEGACY_OWNER_ID` AND `organizationId === activeOrgId`). `LEGACY_OWNER_ID = "legacy-pre-auth"`, `DEFAULT_OWNER_ID = "shared"` (both already exported from `store.ts`).
- Pin identity key = **`canonicalOperatorId ?? pmSlug`** (the exact `groupByCanonical` expression, `aggregate.ts:525`). One pin = one company.
- Pins must NEVER bypass entitlements — union pins AFTER/within the `isMarketEntitled` filter (`apply.ts:114-117`).
- New pure modules under `src/lib/watch-list/` stay import-light (no server-only deps) so `node:test` can exercise them.
- End commits with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File Structure

- Modify `prisma/schema.prisma` — `WatchListMember` model, `kind` + relation on `WatchList`, `isShared` default → false.
- Create `prisma/migrations/20260717000000_watch_list_pins/migration.sql`.
- Create `src/lib/watch-list/visibility.ts` (+ `.test.ts`) — pure `canViewList` / `canEditList`.
- Modify `src/lib/watch-list/store.ts` (+ its guard tests) — consume predicates; new signatures; member CRUD.
- Create `src/app/api/watch-lists/[id]/members/route.ts` — POST/DELETE member.
- Modify `src/lib/watch-list/apply.ts` — `pinnedKeys` union.
- Modify callers: `src/app/watch-lists/[id]/results/page.tsx`, `src/app/watch-lists/page.tsx`, `src/lib/watch-list/digest-run.ts`, `src/app/api/watch-lists/**` (thread `userId`).
- Create `src/components/watch-list/AddToWatchList.tsx` (+ `.test.tsx`) — the client island.
- Modify `src/components/scorecard/redesign/ScorecardHeader.tsx` + `src/lib/scorecard/view-model.ts` (thread `canonicalOperatorId`), `src/components/market/PMListItem.tsx`, `src/components/search/SearchResultRow.tsx` — mount the island.
- Modify results/CSV to flag pinned rows; the lists index + a pick-list manage view for `kind`.

---

### Task 1: Schema — WatchListMember + kind + migration

**Files:** `prisma/schema.prisma`; `prisma/migrations/20260717000000_watch_list_pins/migration.sql`.

- [ ] **Step 1: Edit `WatchList`** — add a `kind` column, the members relation, and flip the `isShared` default:
```prisma
  isShared          Boolean  @default(false)
```
(change the existing `@default(true)`), and add near the `views` relation:
```prisma
  // v0.26 — "criteria" (smart list) | "pinned" (manual pick list).
  kind    String            @default("criteria")
  members WatchListMember[]
```

- [ ] **Step 2: Add the model** (mirror the `WatchListView` relation/cascade pattern):
```prisma
model WatchListMember {
  id          String   @id @default(cuid())
  watchListId String
  // Company-level pin. Value == canonicalOperatorId, or the PM slug for
  // single-market operators (the groupByCanonical fallback key).
  memberKey   String
  addedByUserId String
  createdAt   DateTime @default(now())

  watchList WatchList @relation(fields: [watchListId], references: [id], onDelete: Cascade)

  @@unique([watchListId, memberKey])
  @@index([watchListId])
}
```

- [ ] **Step 3: Hand-author the migration** `prisma/migrations/20260717000000_watch_list_pins/migration.sql` (additive; the `isShared` default change does NOT rewrite existing rows — they keep their stored value):
```sql
-- v0.26 — Watch-list manual pins + kind discriminator.
-- Additive: one CREATE TABLE + two ALTERs (add kind column w/ default,
-- change isShared default). No existing row is rewritten — existing lists
-- keep isShared=true (shared) and get kind='criteria' via the column default.

-- AlterTable
ALTER TABLE "WatchList" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'criteria';
ALTER TABLE "WatchList" ALTER COLUMN "isShared" SET DEFAULT false;

-- CreateTable
CREATE TABLE "WatchListMember" (
    "id" TEXT NOT NULL,
    "watchListId" TEXT NOT NULL,
    "memberKey" TEXT NOT NULL,
    "addedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchListMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WatchListMember_watchListId_memberKey_key" ON "WatchListMember"("watchListId", "memberKey");

-- CreateIndex
CREATE INDEX "WatchListMember_watchListId_idx" ON "WatchListMember"("watchListId");
```

- [ ] **Step 4:** `npx prisma generate` (schema-only) → success; `npx tsc --noEmit` → 0. Do NOT run migrate/seed.
- [ ] **Step 5: Commit** `git add prisma/schema.prisma prisma/migrations/20260717000000_watch_list_pins && git commit -m "feat(schema): WatchListMember + kind; private-by-default isShared"`

---

### Task 2: Pure visibility predicates + tests (TDD)

**Files:** create `src/lib/watch-list/visibility.ts` (+ `.test.ts`).

**Interfaces (consumed by Tasks 3, 4, 8):**
- `canViewList(list: ListAuthShape, ctx: {userId: string; organizationId: string}): boolean`
- `canEditList(list: ListAuthShape, ctx: {userId: string; organizationId: string}): boolean`
- `ListAuthShape = { ownerId: string; organizationId: string | null; isShared: boolean }`

- [ ] **Step 1: Failing test** `src/lib/watch-list/visibility.test.ts`:
```ts
import test from "node:test";
import { strict as assert } from "node:assert";
import { canViewList, canEditList } from "./visibility";
import { LEGACY_OWNER_ID } from "./store";

const ORG = "org_1";
const ME = "user_me";
const ctx = { userId: ME, organizationId: ORG };
const base = { organizationId: ORG, isShared: false };

test("owner can view + edit their private list", () => {
  const l = { ...base, ownerId: ME };
  assert.equal(canViewList(l, ctx), true);
  assert.equal(canEditList(l, ctx), true);
});
test("non-owner in org can VIEW a shared list but not edit it", () => {
  const l = { ownerId: "user_other", organizationId: ORG, isShared: true };
  assert.equal(canViewList(l, ctx), true);
  assert.equal(canEditList(l, ctx), false);
});
test("non-owner cannot view another's PRIVATE list", () => {
  const l = { ownerId: "user_other", organizationId: ORG, isShared: false };
  assert.equal(canViewList(l, ctx), false);
});
test("legacy-owner shared list is org-editable (grandfathered)", () => {
  const l = { ownerId: LEGACY_OWNER_ID, organizationId: ORG, isShared: true };
  assert.equal(canViewList(l, ctx), true);
  assert.equal(canEditList(l, ctx), true);
});
test("cross-org: cannot view a shared list in a different org", () => {
  const l = { ownerId: "user_other", organizationId: "org_2", isShared: true };
  assert.equal(canViewList(l, ctx), false);
  assert.equal(canEditList(l, ctx), false);
});
test("null organizationId (legacy sentinel row) is invisible", () => {
  const l = { ownerId: LEGACY_OWNER_ID, organizationId: null, isShared: true };
  assert.equal(canViewList(l, ctx), false);
});
```

- [ ] **Step 2:** Run → FAIL (module not found).
- [ ] **Step 3: Implement** `src/lib/watch-list/visibility.ts`:
```ts
// Pure watch-list authorization predicates. No IO. See the design doc for
// the model: view = own OR shared-to-your-org; edit = own OR (legacy-owned
// AND same org) — the legacy clause grandfathers pre-owner rows as
// org-editable so no one is locked out.
import { LEGACY_OWNER_ID } from "./store";

export interface ListAuthShape {
  ownerId: string;
  organizationId: string | null;
  isShared: boolean;
}
interface AuthCtx {
  userId: string;
  organizationId: string;
}

export function canViewList(list: ListAuthShape, ctx: AuthCtx): boolean {
  if (list.ownerId === ctx.userId) return true;
  return list.isShared === true && list.organizationId === ctx.organizationId;
}

export function canEditList(list: ListAuthShape, ctx: AuthCtx): boolean {
  if (list.ownerId === ctx.userId) return true;
  return (
    list.ownerId === LEGACY_OWNER_ID && list.organizationId === ctx.organizationId
  );
}
```
(Importing `LEGACY_OWNER_ID` from `store.ts` is fine — that constant has no heavy deps; if `store.ts`'s `@/lib/prisma` import makes `node:test` unhappy, move both constants to a new dep-free `constants.ts` that both import. Decide at implementation time and note it.)

- [ ] **Step 4:** Run → PASS (6/6). `npx tsc --noEmit` → 0.
- [ ] **Step 5: Commit** `feat(watch-list): pure visibility predicates + tests`

---

### Task 3: Store authz rework (consume predicates)

**Files:** `src/lib/watch-list/store.ts` (+ update `store.test.ts` source-guards).

**Interfaces:** `listWatchListes(userId, organizationId)`, `getWatchList(id, {userId, organizationId})`, `updateWatchList(id, input, {userId, organizationId})`, `deleteWatchList(id, {userId, organizationId})` — each enforces the predicate. `parseRow` also returns `kind`.

- [ ] **Step 1:** Add `kind` to `WatchListRecord` + `parseRow`. Add `import { canViewList, canEditList } from "./visibility";`.
- [ ] **Step 2:** `listWatchListes(userId: string, organizationId: string)` — fetch candidate rows (`where: { OR: [{ ownerId: userId }, { organizationId, isShared: true }] }`) then defensively `.filter((r) => canViewList(r, { userId, organizationId }))`. (The `OR` narrows at the DB; the predicate is the source of truth.)
- [ ] **Step 3:** `getWatchList(id, ctx)` — fetch by id, return null unless `canViewList`. `updateWatchList`/`deleteWatchList` — fetch by id, refuse unless `canEditList`. Preserve return shapes (null / false on refusal). Add an optional `kind` to update.
- [ ] **Step 4:** `createWatchList` — accept optional `kind` (default `"criteria"`); keep `ownerId`, `organizationId`, `isShared` handling.
- [ ] **Step 4b (SECURITY — do not skip):** `getWatchListWithCrossOrgCheck` currently returns `{status:"found"}` whenever `row.organizationId === activeOrganizationId` — i.e. any list in your active org, including a **teammate's PRIVATE list**. Under the new model that's a leak. Add a `canViewList` gate: when the row is in the active org but `canViewList(row, {userId, organizationId})` is **false** (someone else's private list), return `{status:"not_found"}` (don't leak existence). Keep the existing wrong-org / membership branches. This is the read gate for the results page — the private rule must hold here, not only in `listWatchListes`.
- [ ] **Step 5: Update the source-guard tests** in `store.test.ts` that assert the OLD signatures (e.g. `"listWatchListes(organizationId: string)"`) — they will now be false. Rewrite them to assert the new signatures + that `canViewList`/`canEditList` are used. (The real behavioral coverage is Task 2.)
- [ ] **Step 6:** `npx tsc --noEmit` → 0 (this will surface every call site needing the new args — fix them in Task 4/callers). Run `npm run test:watch-list`. Commit `feat(watch-list): enforce own-or-shared / owner-only authz in the store`.

---

### Task 4: Member store + API route + thread userId through callers

**Files:** `src/lib/watch-list/store.ts` (member fns); create `src/app/api/watch-lists/[id]/members/route.ts`; update call sites so store calls pass `userId` (`src/app/watch-lists/page.tsx`, `src/app/watch-lists/[id]/results/page.tsx`, `src/app/api/watch-lists/route.ts`, `src/app/api/watch-lists/[id]/route.ts`, `digest-run.ts`).

- [ ] **Step 1: Member store fns** in `store.ts`:
  - `listMembers(watchListId: string): Promise<{ memberKey: string; addedByUserId: string; createdAt: Date }[]>`
  - `addMember(watchListId, memberKey, ctx: {userId, organizationId}): Promise<boolean>` — load list, `canEditList` or return false; `prisma.watchListMember.upsert` on `(watchListId, memberKey)`.
  - `removeMember(watchListId, memberKey, ctx): Promise<boolean>` — `canEditList` gate, then delete.
- [ ] **Step 2: Route** `src/app/api/watch-lists/[id]/members/route.ts` — mirror `[id]/route.ts`'s `resolveAuthContext()` (returns `{userId, organizationId}`), plus owner-edit is enforced inside `addMember`/`removeMember`. `POST` body `{ memberKey: string }` → 201/`{ ok: true }`; `DELETE` body `{ memberKey }` → `{ ok: true }`; 404 when the store fn returns false. Validate `memberKey` non-empty → 422.
- [ ] **Step 3: Fix all call sites** flagged by tsc from Task 3: pass `userId` (from `auth()`) alongside `organizationId`. In `page.tsx` (list) use `listWatchListes(userId, organizationId)`; in `results/page.tsx` the access check already has `userId` via `getWatchListWithCrossOrgCheck` — keep, but ensure any `getWatchList` calls pass the new ctx.
- [ ] **Step 4:** `npx tsc --noEmit` → 0; `npm run test:watch-list` → pass. Commit `feat(watch-list): member store + /members API route; thread userId to callers`.

---

### Task 5: apply.ts — union pinned members (keep entitlement guard)

**Files:** `src/lib/watch-list/apply.ts`; callers that build results (results page, `digest-run.ts`).

- [ ] **Step 1:** Add a param: `applyWatchList(watchList, entitlement?, pinnedKeys?: ReadonlySet<string>)`. `pinnedKeys` = the set of `canonicalOperatorId ?? pmSlug` company keys.
- [ ] **Step 2: Union into `results`** — after the criteria `matched` loop, for each `pmRecord` whose `(canonicalOperatorId ?? slug)` ∈ `pinnedKeys` and that isn't already matched, push a `RankedTarget` built from that record with `fitScore` = its computed score if it passed else a sentinel (e.g. `0`) and a `breakdown` flag `pinned: true`. Only from `allRecords` that survived the entitlement filter (they already did — `rows`/`allRecords` are post-filter), so pins in non-entitled markets are inherently excluded.
- [ ] **Step 3: Union into `operatorResults`** — for each pinned key present in `byCanonical` but not already in `matchedOperators`, aggregate its bucket and push a `RolledUpTarget` flagged pinned. (A pinned company with no entitled markets won't be in `byCanonical` at all → correctly absent.)
- [ ] **Step 4:** Add a `pinned?: boolean` to `RankedTarget`/`RolledUpTarget` (and thread through `projectResultsForView` → `ResultRowVM` so the table/CSV can badge it). Keep sort stable (pinned rows sort by score like the rest; the flag is display-only).
- [ ] **Step 5: Callers load members + pass keys.** `results/page.tsx`: `const pins = new Set((await listMembers(watchList.id)).map(m => m.memberKey))` → pass to `applyWatchList`. `digest-run.ts` `buildOrgListContext`: same per list.
- [ ] **Step 6: Tests** — extend `apply` coverage where testable (a pinned key forces an otherwise-failing operator into `operatorResults`; a pinned key in a non-entitled market never appears). If `applyWatchList` is too DB-bound for a unit test, extract the union step into a pure helper `unionPins(matched, allRecords, pinnedKeys)` and test that. `npx tsc --noEmit` → 0; `npm run test:watch-list`. Commit `feat(watch-list): union pinned members into apply results (entitlement-safe)`.

---

### Task 6: "Add to watch list" client island + mount points + component test

**Files:** create `src/components/watch-list/AddToWatchList.tsx` (+ `.test.tsx`); modify `ScorecardHeader.tsx` + `src/lib/scorecard/view-model.ts`; `PMListItem.tsx`; `SearchResultRow.tsx`.

- [ ] **Step 1: The island** `AddToWatchList.tsx` (`"use client"`): props `{ memberKey: string; operatorName: string; compact?: boolean }`. A bookmark button → popover listing the user's **pinned** lists (`GET /api/watch-lists` filtered client-side to `kind === "pinned"` owned by the user), each with a checkbox reflecting membership; toggling calls `POST`/`DELETE /api/watch-lists/[id]/members`. A "＋ New list…" row creates one (`POST /api/watch-lists` with `kind: "pinned"`, a name prompt) then pins. Optimistic UI + error toast. Anonymous/unentitled users: hide the control (render null when no session — pass a `canPin` prop from the server host, gated like existing `!publicSample`).
- [ ] **Step 2: Scorecard** — thread `canonicalOperatorId` into `HeaderView` (`view-model.ts:29-38` + its builder) so multi-market operators pin the company, not the slug. In `ScorecardHeader.tsx:167-230` link-button row, mount `<AddToWatchList memberKey={header.canonicalOperatorId ?? slug} operatorName={header.name} />`, gated by `!publicSample`.
- [ ] **Step 3: Market row** — in `PMListItem.tsx`, mount a compact `<AddToWatchList memberKey={pm.canonicalOperatorId ?? pm.slug} operatorName={pm.name} compact />` (client island inside the row).
- [ ] **Step 4: Search row** — in `SearchResultRow.tsx`, for operator tiers (`ranked`/`canonical`/`tracked`, NOT `market`), mount the compact island using `result.canonicalSlug ?? result.slug` as the key.
- [ ] **Step 5: Component test** `AddToWatchList.test.tsx` (Vitest): renders the button; opening shows the user's pinned lists; toggling a checkbox fires the members POST/DELETE (mock `fetch`); create-new flow posts a new list. Assert the memberKey is sent.
- [ ] **Step 6:** `npx tsc --noEmit` → 0; `npm run test:components` → pass; `npm run test:watch-list` → pass. Commit `feat(watch-list): Add-to-watch-list control on scorecard, market rows, search`.

---

### Task 7: Pick-list kind in the index + manage/remove + pinned badge

**Files:** `src/app/watch-lists/page.tsx` (+ list card component), the results view / `projectResultsForView` + CSV, and a pick-list manage affordance.

- [ ] **Step 1: Index** — the lists index shows both kinds; a pick list card shows "N companies" (from `listMembers` count) instead of a criteria summary, and routes to its results (which now render its pinned members via Task 5). Add a "New pick list" entry alongside "New list".
- [ ] **Step 2: Manage/remove** — on a pinned list's results page, pinned rows get a remove control (calls `DELETE /members`), owner-only (hide for view-only shared viewers). Reuse `AddToWatchList`'s toggle or a lightweight remove button.
- [ ] **Step 3: Pinned badge** — results table + CSV label pinned rows (from the `pinned` flag threaded in Task 5). CSV gains a "Pinned" column or marker.
- [ ] **Step 4:** `tsc` + `test:watch-list` + `test:components` green. Commit `feat(watch-list): pick-list kind in index + manage/remove + pinned badge`.

---

### Task 8: Digest recipients follow visibility

**Files:** `src/lib/watch-list/digest-run.ts`.

- [ ] **Step 1:** Change the recipient model so each list is sent only to members who can view it. In the per-org loop, for each due member compute their visible lists = `ctx.lists` filtered by `canViewList(list, { userId: member.userId, organizationId })` — which means `buildOrgListContext` must carry each list's `{ ownerId, isShared, organizationId }` alongside `matchedPmSlugs`/`metaBySlug`. A private list reaches only its owner; a shared list reaches org members. Keep the existing per-user `DigestPreference` due-check.
- [ ] **Step 2:** `tsc` + `test:watch-list` green (extend the digest tests if present to assert the visibility filter). Commit `feat(watch-list): digest alerts follow list visibility`.

---

### Task 9: End-to-end verification + PR

- [ ] **Step 1:** Full gate — `npx prisma generate && npx tsc --noEmit && npm run test:watch-list && npm run test:components` → all green.
- [ ] **Step 2: Preview smoke** (dev server): create a pick list from a scorecard's Add button; confirm it appears in the index as a pick list, its results show the pinned company, remove works; confirm a private list isn't visible to a second user and a shared one is view-only.
- [ ] **Step 3: Open PR** for `watch-list-pins`. Note: additive migration (applies on deploy); authz change (own-or-shared / owner-only) with existing lists grandfathered; the accepted edge (real-owner existing shared lists become owner-only-editable).

## Notes for the implementer

- **Authz is the highest-stakes part** — the Task 2 predicates are the single source of truth; every store path calls them. Do not re-implement the rule inline anywhere.
- Pins never bypass entitlements — they're unioned from the already-entitlement-filtered record set.
- Keep `listWatchListes` / `watchListes` spelling.
- Do not run migrate/seed locally; the migration lands on the PR's Vercel deploy.
