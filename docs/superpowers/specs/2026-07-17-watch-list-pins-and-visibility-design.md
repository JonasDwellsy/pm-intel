# Watch-List Pins (manual company lists) + Unified Visibility — Design

**Date:** 2026-07-17
**Status:** Approved (design + decisions); pending user review of this spec
**Author:** Jonas + Claude
**Origin:** prospective client wants to add specific companies to a watch list.

## Problem

Today a watch list is a **dynamic, criteria-driven smart list**: it stores
rules (`requiredCriteria` / `preferredCriteria` / `excludedCriteria`, JSON on
`WatchList`) that `applyWatchList` (`src/lib/watch-list/apply.ts`) matches
against the full operator universe at read time. There is **no way to hand-pick
specific companies**, and every list is **org-shared** (`store.ts` authorizes by
`organizationId` only; `ownerId` is captured but unused for access; `isShared`
exists but isn't enforced).

Two asks:
1. **Pick lists** — let a user add specific companies to a watch list (manual
   membership), not just rules.
2. **Visibility** — lists should be **personal by default** with an opt-in
   **"share to my org"** toggle, unified across all list types.

## Goals / approved decisions

- **Type A:** manual pick lists as a first-class list kind (a chosen set of
  companies), distinct from smart lists.
- **Unified visibility for ALL lists:** owned by a user, **private by default**,
  with a "share to org" toggle. **Access = you own it OR it's shared to your
  org. Edit/delete = owner only.** Shared lists are **view-only** for other org
  members (they still get results, CSV, and alerts).
- **Existing lists grandfathered:** they stay shared + org-editable (no behavior
  change); the owner-only-edit rule applies only to lists created under the new
  model.
- **Alerts follow visibility:** a user gets change-alert emails for lists they
  can access (own + shared-to-them), honoring their existing per-user digest
  preference.

## Non-goals

- **Hybrid lists (option B)** — a single list mixing rules AND pins. The schema
  stays hybrid-ready (apply path unions both), but the UI ships pick lists and
  smart lists as distinct kinds for now.
- Changing the smart-list criteria engine, CSV/trajectory/digest formats.
- Per-market pinning as the primary model (we pin the company; see Decisions).

## Architecture

### A. Unified visibility model

**Schema (`prisma/schema.prisma`, `WatchList`):**
- `ownerId` becomes a real access key (already captured on create).
- `isShared Boolean` becomes **enforced** (currently `@default(true)`, unused).
  Change the default to **`false`** so NEW lists are private; existing rows keep
  their stored `true`.
- Add `kind String @default("smart")` — `"smart"` | `"pinned"` — for UX/routing
  (existing lists backfill to `"smart"`).

**Authorization (`src/lib/watch-list/store.ts`) — the security core:**
Introduce a known legacy sentinel (the existing backfill value, `LEGACY_OWNER_ID`
from `scripts`/the `clerk_owner_id_backfill` migration).
- **Visible to (userId, orgId):** `ownerId === userId` OR
  (`isShared === true` AND `organizationId === orgId`).
- **Can edit/delete:** `ownerId === userId` OR
  (`ownerId === LEGACY_OWNER_ID` AND `organizationId === orgId`) — the second
  clause grandfathers legacy lists as org-editable so no one is locked out.
- Every store function (`listWatchLists`, `getWatchList`, `updateWatchList`,
  `deleteWatchList`, and the member mutations below) takes **both** `userId` and
  `organizationId` and enforces the above. Callers already resolve
  `organizationId`; they must also pass the authed `userId` (from `auth()`).

**Migration (additive + backfill, no data loss):**
- Add `kind` (default `"smart"`) + change `isShared` default to `false`
  (existing rows unaffected — they stay `true` = shared).
- Backfill: existing rows already have `isShared=true` and an `ownerId` (real or
  `LEGACY_OWNER_ID`); no row rewrite needed. Net effect: existing lists remain
  org-visible; sentinel-owned lists remain org-editable; new lists are private +
  owner-only.
- **Accepted minor edge:** an existing list already owned by a *real* user (from
  the recent `ownerId`-capture path) + shared becomes **owner-only-editable**
  under the new rule (previously any org member could edit it). Given the early
  stage (invite-only, first clients pending, very few real lists) this is a
  negligible, arguably-more-correct change — not worth a dedicated grandfather
  marker. Sentinel-owned lists (the bulk of existing rows, per the
  `clerk_owner_id_backfill` migration) stay org-editable.

### B. Pick lists (membership)

**New model `WatchListMember`** (`prisma/schema.prisma`):
```
model WatchListMember {
  id                  String   @id @default(cuid())
  watchListId         String
  watchList           WatchList @relation(fields: [watchListId], references: [id], onDelete: Cascade)
  canonicalOperatorId String   // company-level pin (== canonicalOperatorId / pmSlug fallback)
  addedByUserId       String
  createdAt           DateTime @default(now())
  @@unique([watchListId, canonicalOperatorId])
  @@index([watchListId])
}
```
- **Company-level pins:** key on `canonicalOperatorId`, which for a single-market
  operator is its `pmSlug` (matches how `applyWatchList`'s operator rollup keys —
  `apply.ts` `RolledUpTarget.canonicalOperatorId`). One pin = one company across
  all its (entitled) markets.
- Membership is a stored set (unlike criteria, which are re-matched). Hybrid-ready:
  a list may carry criteria and/or members; the UI just doesn't expose both yet.

### C. Add affordance (the main new UI)

An **"Add to watch list"** control (bookmark/＋) on:
- the operator **scorecard** header (`IdentityHero`),
- **market operator-list** rows,
- **search results** (ties into the new market/alias search).

Clicking opens a small popover: pick an existing pick list you own (or **create
one** inline by name) → upserts a `WatchListMember`. Backed by a server action +
`POST/DELETE /api/watch-lists/[id]/members` (or equivalent), authorized by
owner-only edit. Shows pinned/unpinned state.

### D. Apply path + downstream reuse

- `applyWatchList` (`apply.ts`) **unions the pinned members** into its result set
  (both the per-market `results` and the `operatorResults` rollup), bypassing
  criteria evaluation for pinned companies but **keeping the entitlement filter**
  (`isMarketEntitled`, apply.ts:114-117) — a pin can never surface a market the
  org isn't licensed for. Pinned rows carry an "included by pin" flag so the
  table + CSV can label them (no fit score, or a distinct badge).
- **Free downstream:** results table, CSV export, operator trajectory, and the
  monthly change-alert digest all consume list membership through this one path,
  so they work for pick lists with no format change.

### E. Change-alert digest recipients

`digest-run.ts` currently iterates org lists × org members. Change it so each
list's recipients = **users who can access the list** (owner for private; owner +
org members for shared), intersected with each user's existing
`DigestPreference`. Net: private-list alerts go to the owner; shared-list alerts
can reach the org.

## Key decisions (recap + rationale)

1. **Unify visibility across all lists** (not pick-lists-only) — one model is
   simpler to explain; migration is a no-op because existing lists stay shared.
2. **Shared = view-only** (owner-only edit) — clean single-owner story.
3. **Grandfather existing lists org-editable** via the `LEGACY_OWNER_ID` sentinel
   clause — avoids locking anyone out of lists with a backfilled owner.
4. **Pin the company (`canonicalOperatorId`), not a per-market operator** —
   matches the "watch this company" mental model + the existing rollup key.
5. **`kind` discriminator** — ships A cleanly (distinct pick vs smart lists)
   while keeping the apply path hybrid-ready for a future B.

## Open / deferred

- **B (hybrid rules + pins)** — deferred; schema supports it.
- Bulk "pin all results of a smart list into a new pick list" — nice future
  bridge; not in scope.
- Per-market pin (watch one market of a company) — deferred; company-level only.

## Testing

- **Authz unit tests** (highest priority — security): the visibility + edit
  predicates in `store.ts` — owner sees private; non-owner in org sees shared;
  non-owner cannot see private; non-owner cannot edit shared; legacy-sentinel
  list is org-editable; cross-org denied. Extend the existing store test suite.
- **Apply-path tests:** pinned members appear in results + rollup; a pinned
  company in a non-entitled market is dropped by the entitlement filter; pinned
  rows carry the flag.
- **Component test (Vitest):** the "Add to watch list" popover — pinned/unpinned
  toggle + create-inline.
- CI gate: `tsc` + `test:watch-list` + `test:components`.

## Rollout

Additive: one new table + two `WatchList` columns (+ migration), an authz rework
(owner+share enforced), the apply-path union, the add affordance, and the digest
recipient tweak. Applied on deploy via `prisma migrate deploy`. Existing lists'
behavior is preserved (shared + org-editable); the new model governs lists
created afterward.
