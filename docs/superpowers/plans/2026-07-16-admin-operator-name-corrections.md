# Admin Operator-Name Corrections — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin correct an operator's display name from the admin panel, taking effect immediately (live DB patch) and surviving every reseed (re-applied by `seed.ts` from a never-wiped table).

**Architecture:** A new `OperatorNameCorrection` table is the single source of truth. A server action writes the row AND patches the live DB copies of the name (immediate). `prisma/seed.ts` re-applies all correction rows in-memory before recreating PM/CanonicalOperator rows (durable). Two correction targets: a standalone PM (`targetKind="pm"`, key = PM slug) or a multi-market canonical group (`targetKind="canonical"`, key = canonicalSlug/canonicalOperatorId). Slugs/URLs never change. Search/PDF/briefs are Phase 2 (out of scope).

**Tech Stack:** Next.js 16 (App Router, server actions), React 19 (`useActionState`), Prisma + Postgres (Neon), Clerk auth, `node:test` unit tests.

## Global Constraints

- **Never run `prisma migrate dev`, `prisma migrate deploy`, or `prisma db seed` locally** — the Neon DB is shared prod/dev. Migrations apply on deploy via `vercel-build`. Create migration SQL by hand (mirroring existing migrations); regenerate the client with `npx prisma generate` (schema-only, no DB).
- CI gate = `npx tsc --noEmit` + `npm run test:watch-list` (runner: `node --import tsx --test <globs>`). Both must pass.
- New unit tests live under `src/lib/operators/` (already in the test glob).
- Prisma accessors: `prisma.pM`, `prisma.canonicalOperator`, `prisma.operatorNameCorrection`. Client import: `import { prisma } from "@/lib/prisma"`.
- The pure core module (`src/lib/operators/name-correction.ts`) must have **no `@/` imports** (only `node:` builtins / plain TS) so `prisma/seed.ts` can import it via a relative path under tsx.
- A name is denormalized: `PM.name` (column), `scorecardData` blob's `pm.name`, `CanonicalOperator.canonicalName`, and member `PM.canonicalOperatorName` + blob `canonicalOperatorName`. Correcting a name must touch the right set (see tasks) or surfaces drift. `toPmListItem` shows `canonicalOperatorName` as a DBA alias only when it differs case-insensitively from `PM.name`.
- End commits with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File Structure

- Modify `prisma/schema.prisma` — add `OperatorNameCorrection` model.
- Create `prisma/migrations/20260716000000_operator_name_correction/migration.sql` — additive CREATE TABLE + indexes.
- Create `src/lib/operators/name-correction.ts` — pure helpers: live blob patches + seed-time in-memory stamp. No IO.
- Create `src/lib/operators/name-correction.test.ts` — unit tests for the pure helpers.
- Modify `prisma/seed.ts` — read corrections from DB, stamp in-memory before create (durable applier).
- Create `src/lib/operators/name-correction.server.ts` — `"server-only"` data layer: search operators, load active corrections.
- Create `src/app/admin/names/actions.ts` — `saveCorrection` + `undoCorrection` server actions (live applier).
- Create `src/app/admin/names/page.tsx` — server component: search UI host + active-corrections table.
- Create `src/app/admin/names/OperatorNameCorrectionForm.tsx` — client component (`useActionState`) for search + correct + undo.
- Modify `src/components/admin/AdminTabs.tsx` — add the "Names" tab.

---

### Task 1: Prisma model + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260716000000_operator_name_correction/migration.sql`

- [ ] **Step 1: Add the model to `prisma/schema.prisma`** (append near the other decision tables, after `OperatorMergeDecision`):

```prisma
// Admin-curated display-name corrections. Single source of truth for a
// renamed operator. Applied TWICE: live (the /admin/names server action
// patches the operator's DB rows on save) and durably (prisma/seed.ts
// re-applies every row in-memory before recreating PMs, since a reseed
// hard-deletes + recreates PM/CanonicalOperator from the JSON). This
// table is deliberately NOT in seed.ts's deleteMany set, so corrections
// survive reseeds — same trick as OperatorMergeDecision / AppSetting.
//   targetKind "pm"        — targetKey is a PM slug (one market).
//   targetKind "canonical" — targetKey is a canonicalSlug (the group).
model OperatorNameCorrection {
  id              String   @id @default(cuid())
  targetKind      String   // "pm" | "canonical"
  targetKey       String   // PM slug, or canonicalSlug/canonicalOperatorId
  correctedName   String
  originalName    String   // name at first correction — powers Undo + staleness
  decidedByUserId String
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([targetKind, targetKey])
}
```

- [ ] **Step 2: Hand-author the migration** `prisma/migrations/20260716000000_operator_name_correction/migration.sql`:

```sql
-- v0.25 — Admin operator display-name corrections.
--
-- Additive-only: one CREATE TABLE + one unique index. No DROP/ALTER of
-- any existing table. Written by /admin/names; applied live on save and
-- re-applied by prisma/seed.ts on every reseed (this table is never
-- deleted by the seed, so corrections persist).

-- CreateTable
CREATE TABLE "OperatorNameCorrection" (
    "id" TEXT NOT NULL,
    "targetKind" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "correctedName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "decidedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatorNameCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OperatorNameCorrection_targetKind_targetKey_key" ON "OperatorNameCorrection"("targetKind", "targetKey");
```

- [ ] **Step 3: Regenerate the Prisma client** (schema-only, safe — no DB connection):

Run: `cd "/Users/jonasbordo/Documents/Claude/Projects/PM Intel/iq-dwellsy" && npx prisma generate`
Expected: `✔ Generated Prisma Client` with no errors.

- [ ] **Step 4: Verify the client is typed** — the new model must be visible to tsc:

Run: `npx tsc --noEmit`
Expected: exit 0 (no errors). If `prisma.operatorNameCorrection` is later referenced, tsc resolves it.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260716000000_operator_name_correction
git commit -m "feat(schema): OperatorNameCorrection table + migration"
```

---

### Task 2: Pure core — live blob-patch helpers (TDD)

**Files:**
- Create: `src/lib/operators/name-correction.ts`
- Test: `src/lib/operators/name-correction.test.ts`

**Interfaces:**
- Produces (consumed by Task 3 seed + Task 5 action):
  - `computePmNamePatch(current: { name: string; scorecardData: string }, correctedName: string): { name: string; scorecardData: string }`
  - `computeCanonicalMemberPatch(current: { scorecardData: string }, correctedName: string): { canonicalOperatorName: string; scorecardData: string }`
  - `applyCorrectionsToSeedData(pms: SeedPm[], canonicalOperators: Record<string, SeedCanonical>, corrections: SeedCorrection[]): { applied: number; stale: string[] }`
  - Types `SeedPm`, `SeedCanonical`, `SeedCorrection` exported for seed.ts.

- [ ] **Step 1: Write the failing test** `src/lib/operators/name-correction.test.ts`:

```ts
import test from "node:test";
import { strict as assert } from "node:assert";
import {
  computePmNamePatch,
  computeCanonicalMemberPatch,
  applyCorrectionsToSeedData,
} from "./name-correction";

function pmBlob(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    canonicalOperatorId: null,
    canonicalOperatorName: undefined,
    pm: { name: "Pmi Mile High", quadrant7Cell: "SFR Independent" },
    market: { name: "Denver" },
    ...over,
  });
}

test("computePmNamePatch sets column + blob pm.name", () => {
  const out = computePmNamePatch(
    { name: "Pmi Mile High", scorecardData: pmBlob() },
    "PMI Mile High"
  );
  assert.equal(out.name, "PMI Mile High");
  assert.equal(JSON.parse(out.scorecardData).pm.name, "PMI Mile High");
});

test("computePmNamePatch keeps a casing-only canonicalOperatorName consistent", () => {
  // blob had a DBA alias equal (case-insensitively) to the old name →
  // must move with the correction so toPmListItem doesn't show stale casing.
  const blob = pmBlob({ canonicalOperatorName: "pmi mile high" });
  const out = computePmNamePatch(
    { name: "Pmi Mile High", scorecardData: blob },
    "PMI Mile High"
  );
  assert.equal(JSON.parse(out.scorecardData).canonicalOperatorName, "PMI Mile High");
});

test("computePmNamePatch leaves a genuine DBA alias untouched", () => {
  const blob = pmBlob({ canonicalOperatorName: "29th Street Property Management" });
  const out = computePmNamePatch(
    { name: "Haven Residential", scorecardData: blob },
    "Haven Residential LLC"
  );
  assert.equal(
    JSON.parse(out.scorecardData).canonicalOperatorName,
    "29th Street Property Management"
  );
});

test("computeCanonicalMemberPatch sets member alias column + blob", () => {
  const out = computeCanonicalMemberPatch(
    { scorecardData: pmBlob({ canonicalOperatorName: "Edward Rose" }) },
    "Edward Rose & Sons"
  );
  assert.equal(out.canonicalOperatorName, "Edward Rose & Sons");
  assert.equal(
    JSON.parse(out.scorecardData).canonicalOperatorName,
    "Edward Rose & Sons"
  );
});

test("applyCorrectionsToSeedData stamps pm + canonical in-memory and reports staleness", () => {
  const pms = [
    { slug: "a-denver-co", name: "Pmi Mile High", canonicalOperatorName: null },
    { slug: "er-milwaukee", name: "Edward Rose", canonicalOperatorName: "Edward Rose" },
  ];
  const canon = { "edward-rose-sons": { canonicalName: "Edward Rose" } };
  const corrections = [
    { targetKind: "pm", targetKey: "a-denver-co", correctedName: "PMI Mile High", originalName: "Pmi Mile High" },
    { targetKind: "canonical", targetKey: "edward-rose-sons", correctedName: "Edward Rose & Sons", originalName: "Edward Rose" },
    { targetKind: "pm", targetKey: "gone", correctedName: "X", originalName: "Y" },
  ];
  const res = applyCorrectionsToSeedData(pms, canon, corrections);
  assert.equal(pms[0].name, "PMI Mile High");
  assert.equal(canon["edward-rose-sons"].canonicalName, "Edward Rose & Sons");
  // canonical correction also stamps member alias:
  assert.equal(pms[1].canonicalOperatorName, "Edward Rose & Sons");
  assert.equal(res.applied, 2);
  assert.deepEqual(res.stale, ["gone"]); // unknown target logged as stale/skipped
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test src/lib/operators/name-correction.test.ts`
Expected: FAIL — `Cannot find module './name-correction'`.

- [ ] **Step 3: Implement** `src/lib/operators/name-correction.ts`:

```ts
// Pure operator display-name correction helpers. NO IO, NO "@/" imports —
// prisma/seed.ts imports this via a relative path under tsx, so keep it
// dependency-free. Used by both the live applier (the /admin/names server
// action, on DB rows with a stringified scorecardData blob) and the
// durable applier (seed.ts, on the in-memory seed data before create).

export interface SeedPm {
  slug: string;
  name: string;
  canonicalOperatorName?: string | null;
  [k: string]: unknown;
}
export interface SeedCanonical {
  canonicalName?: string;
  [k: string]: unknown;
}
export interface SeedCorrection {
  targetKind: string; // "pm" | "canonical"
  targetKey: string;
  correctedName: string;
  originalName: string;
}

/** Parse a scorecardData blob, mutate it via `fn`, re-stringify. Blob is a
 *  JSON object of shape `{ canonicalOperatorName?, pm: { name, ... }, ... }`. */
function editBlob(
  scorecardData: string,
  fn: (blob: { canonicalOperatorName?: string | null; pm?: { name?: string } }) => void
): string {
  const blob = JSON.parse(scorecardData);
  fn(blob);
  return JSON.stringify(blob);
}

/** Live patch for a standalone PM: set the `name` column and the blob's
 *  `pm.name`. If the blob's canonicalOperatorName equalled the OLD name
 *  case-insensitively (stale-casing alias, not a real DBA), move it with
 *  the correction so toPmListItem stays consistent. */
export function computePmNamePatch(
  current: { name: string; scorecardData: string },
  correctedName: string
): { name: string; scorecardData: string } {
  const oldName = current.name;
  const scorecardData = editBlob(current.scorecardData, (blob) => {
    if (blob.pm) blob.pm.name = correctedName;
    if (
      typeof blob.canonicalOperatorName === "string" &&
      blob.canonicalOperatorName.toLowerCase() === oldName.toLowerCase()
    ) {
      blob.canonicalOperatorName = correctedName;
    }
  });
  return { name: correctedName, scorecardData };
}

/** Live patch for a member of a corrected canonical group: set the member's
 *  canonicalOperatorName column and the blob's canonicalOperatorName. Does
 *  NOT touch the member's own pm.name. */
export function computeCanonicalMemberPatch(
  current: { scorecardData: string },
  correctedName: string
): { canonicalOperatorName: string; scorecardData: string } {
  const scorecardData = editBlob(current.scorecardData, (blob) => {
    blob.canonicalOperatorName = correctedName;
  });
  return { canonicalOperatorName: correctedName, scorecardData };
}

/** Durable applier: stamp corrections onto the in-memory seed data BEFORE
 *  the blob is built + rows are created. seed.ts sets `pm.name` (which
 *  flows into both the column and the freshly-built blob) so no blob-string
 *  surgery is needed here. Returns counts + a list of targetKeys that
 *  didn't resolve (unknown / stale) for logging. */
export function applyCorrectionsToSeedData(
  pms: SeedPm[],
  canonicalOperators: Record<string, SeedCanonical>,
  corrections: SeedCorrection[]
): { applied: number; stale: string[] } {
  const pmBySlug = new Map<string, SeedPm>();
  for (const pm of pms) pmBySlug.set(pm.slug, pm);
  const membersByCanonical = new Map<string, SeedPm[]>();
  for (const pm of pms) {
    const cid =
      typeof pm.canonicalOperatorId === "string" ? pm.canonicalOperatorId : null;
    if (cid) {
      const arr = membersByCanonical.get(cid) ?? [];
      arr.push(pm);
      membersByCanonical.set(cid, arr);
    }
  }

  let applied = 0;
  const stale: string[] = [];
  for (const c of corrections) {
    if (c.targetKind === "pm") {
      const pm = pmBySlug.get(c.targetKey);
      if (!pm) {
        stale.push(c.targetKey);
        continue;
      }
      pm.name = c.correctedName;
      if (
        typeof pm.canonicalOperatorName === "string" &&
        pm.canonicalOperatorName.toLowerCase() === c.originalName.toLowerCase()
      ) {
        pm.canonicalOperatorName = c.correctedName;
      }
      applied += 1;
    } else if (c.targetKind === "canonical") {
      const canon = canonicalOperators[c.targetKey];
      const members = membersByCanonical.get(c.targetKey) ?? [];
      if (!canon && members.length === 0) {
        stale.push(c.targetKey);
        continue;
      }
      if (canon) canon.canonicalName = c.correctedName;
      for (const m of members) m.canonicalOperatorName = c.correctedName;
      applied += 1;
    } else {
      stale.push(c.targetKey);
    }
  }
  return { applied, stale };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --import tsx --test src/lib/operators/name-correction.test.ts`
Expected: PASS — all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/operators/name-correction.ts src/lib/operators/name-correction.test.ts
git commit -m "feat(operators): pure name-correction patch helpers + tests"
```

---

### Task 3: Durable applier in `seed.ts`

**Files:**
- Modify: `prisma/seed.ts`

**Interfaces:**
- Consumes: `applyCorrectionsToSeedData` (Task 2).

- [ ] **Step 1: Import the helper** — add near the top imports of `prisma/seed.ts` (relative path, since seed.ts uses `../src/...`):

```ts
import { applyCorrectionsToSeedData } from "../src/lib/operators/name-correction";
```

- [ ] **Step 2: Read + apply corrections before the PM create loop.** In `main()`, immediately AFTER the `prisma.pM.deleteMany()` / `prisma.market.deleteMany()` block (~line 1387) and BEFORE the `for (const m of data.markets)` create loop, insert:

```ts
  // Re-apply admin name corrections (durable applier). The corrections
  // table is never wiped by this seed, so read it now and stamp the
  // in-memory data before rows are (re)created — mirrors how
  // applyCanonicalOverrides stamps identity. Live edits made via
  // /admin/names are thus reproduced on every reseed.
  const corrections = await prisma.operatorNameCorrection.findMany({
    select: {
      targetKind: true,
      targetKey: true,
      correctedName: true,
      originalName: true,
    },
  });
  if (corrections.length > 0) {
    const { applied, stale } = applyCorrectionsToSeedData(
      data.pms as never,
      (data.canonicalOperators ?? {}) as never,
      corrections
    );
    console.log(`[seed] applied ${applied} operator name correction(s).`);
    if (stale.length > 0) {
      console.warn(
        `[seed] ${stale.length} name correction(s) had no matching operator (stale): ${stale.join(", ")}`
      );
    }
  }
```

Note: the stamp mutates `data.pms[i].name` / `.canonicalOperatorName` and `data.canonicalOperators[key].canonicalName` BEFORE the create loop reads them (`name: asString(pm.name)`, blob built from `pm`, and the CanonicalOperator create reads `entity.canonicalName`), so both the column and the blob pick up the correction with no further changes.

- [ ] **Step 3: Type-check** (the `as never` casts keep seed.ts's loose `AnyRecord` shapes compatible with the helper's typed params):

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit** (do NOT run `prisma db seed`):

```bash
git add prisma/seed.ts
git commit -m "feat(seed): re-apply operator name corrections on reseed (durable)"
```

---

### Task 4: Server data layer (search + list)

**Files:**
- Create: `src/lib/operators/name-correction.server.ts`

**Interfaces:**
- Produces (consumed by Task 6 page):
  - `searchOperators(query: string): Promise<OperatorHit[]>` where `OperatorHit = { kind: "pm" | "canonical"; key: string; currentName: string; context: string }`.
  - `loadActiveCorrections(): Promise<ActiveCorrection[]>` where `ActiveCorrection = { id: string; targetKind: string; targetKey: string; correctedName: string; originalName: string; currentName: string | null; updatedAt: Date }`.

- [ ] **Step 1: Implement** `src/lib/operators/name-correction.server.ts`:

```ts
import "server-only";
import { prisma } from "@/lib/prisma";

export interface OperatorHit {
  kind: "pm" | "canonical";
  key: string; // PM slug or canonicalSlug
  currentName: string;
  context: string; // market label, or "group · N markets"
}

export interface ActiveCorrection {
  id: string;
  targetKind: string;
  targetKey: string;
  correctedName: string;
  originalName: string;
  currentName: string | null;
  updatedAt: Date;
}

const MAX_HITS = 25;

/** Case-insensitive name search across standalone PMs and canonical groups.
 *  Empty/short query returns nothing (the picker requires ≥2 chars). */
export async function searchOperators(query: string): Promise<OperatorHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const [pms, canon] = await Promise.all([
    prisma.pM.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      select: {
        slug: true,
        name: true,
        market: { select: { fullName: true } },
      },
      take: MAX_HITS,
      orderBy: { name: "asc" },
    }),
    prisma.canonicalOperator.findMany({
      where: { canonicalName: { contains: q, mode: "insensitive" } },
      select: { canonicalSlug: true, canonicalName: true, marketCount: true },
      take: MAX_HITS,
      orderBy: { canonicalName: "asc" },
    }),
  ]);

  const pmHits: OperatorHit[] = pms.map((p) => ({
    kind: "pm",
    key: p.slug,
    currentName: p.name,
    context: p.market?.fullName ?? p.slug,
  }));
  const canonHits: OperatorHit[] = canon.map((c) => ({
    kind: "canonical",
    key: c.canonicalSlug,
    currentName: c.canonicalName,
    context: `group · ${c.marketCount} markets`,
  }));

  return [...canonHits, ...pmHits].slice(0, MAX_HITS);
}

/** All active corrections, joined with the operator's current live name so
 *  the admin table can show original → corrected and flag drift. */
export async function loadActiveCorrections(): Promise<ActiveCorrection[]> {
  const rows = await prisma.operatorNameCorrection.findMany({
    orderBy: { updatedAt: "desc" },
  });

  const pmKeys = rows.filter((r) => r.targetKind === "pm").map((r) => r.targetKey);
  const canonKeys = rows
    .filter((r) => r.targetKind === "canonical")
    .map((r) => r.targetKey);

  const [pms, canon] = await Promise.all([
    pmKeys.length
      ? prisma.pM.findMany({
          where: { slug: { in: pmKeys } },
          select: { slug: true, name: true },
        })
      : Promise.resolve([]),
    canonKeys.length
      ? prisma.canonicalOperator.findMany({
          where: { canonicalSlug: { in: canonKeys } },
          select: { canonicalSlug: true, canonicalName: true },
        })
      : Promise.resolve([]),
  ]);
  const pmName = new Map(pms.map((p) => [p.slug, p.name]));
  const canonName = new Map(canon.map((c) => [c.canonicalSlug, c.canonicalName]));

  return rows.map((r) => ({
    id: r.id,
    targetKind: r.targetKind,
    targetKey: r.targetKey,
    correctedName: r.correctedName,
    originalName: r.originalName,
    currentName:
      r.targetKind === "pm"
        ? pmName.get(r.targetKey) ?? null
        : canonName.get(r.targetKey) ?? null,
    updatedAt: r.updatedAt,
  }));
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/operators/name-correction.server.ts
git commit -m "feat(operators): admin name-correction search + list data layer"
```

---

### Task 5: Server actions (live applier)

**Files:**
- Create: `src/app/admin/names/actions.ts`

**Interfaces:**
- Consumes: `computePmNamePatch`, `computeCanonicalMemberPatch` (Task 2).
- Produces (consumed by Task 6 form): `saveCorrection`, `undoCorrection`, and result type `NameCorrectionResult = { ok: boolean; summary?: string; error?: string }`.

- [ ] **Step 1: Implement** `src/app/admin/names/actions.ts`:

```ts
"use server";

// Live applier for the admin operator-name tool. saveCorrection writes the
// OperatorNameCorrection row (source of truth) AND patches the operator's
// live DB rows so the change shows on the next page load; seed.ts re-applies
// the row on every reseed for durability. undoCorrection reverses both.
//
// Auth: re-checks isAdminUser (server actions are directly callable).

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/auth/is-admin";
import { prisma } from "@/lib/prisma";
import {
  computePmNamePatch,
  computeCanonicalMemberPatch,
} from "@/lib/operators/name-correction";

export interface NameCorrectionResult {
  ok: boolean;
  summary?: string;
  error?: string;
}

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v : "";
}

/** Patch the live DB rows for a target to `name`. Returns the pre-patch
 *  display name (for capturing originalName). */
async function patchLiveName(
  targetKind: string,
  targetKey: string,
  name: string
): Promise<string | null> {
  if (targetKind === "pm") {
    const pm = await prisma.pM.findUnique({
      where: { slug: targetKey },
      select: { name: true, scorecardData: true },
    });
    if (!pm) return null;
    const patch = computePmNamePatch(pm, name);
    await prisma.pM.update({ where: { slug: targetKey }, data: patch });
    return pm.name;
  }
  // canonical: the group row + every member's alias.
  const canon = await prisma.canonicalOperator.findUnique({
    where: { canonicalSlug: targetKey },
    select: { canonicalName: true },
  });
  const members = await prisma.pM.findMany({
    where: { canonicalOperatorId: targetKey },
    select: { slug: true, scorecardData: true },
  });
  if (!canon && members.length === 0) return null;
  if (canon) {
    await prisma.canonicalOperator.update({
      where: { canonicalSlug: targetKey },
      data: { canonicalName: name },
    });
  }
  for (const m of members) {
    const patch = computeCanonicalMemberPatch(m, name);
    await prisma.pM.update({ where: { slug: m.slug }, data: patch });
  }
  return canon?.canonicalName ?? null;
}

export async function saveCorrection(
  _prev: NameCorrectionResult | null,
  formData: FormData
): Promise<NameCorrectionResult> {
  const { userId } = await auth();
  if (!userId || !isAdminUser(userId)) return { ok: false, error: "Not found." };

  const targetKind = str(formData.get("targetKind"));
  const targetKey = str(formData.get("targetKey"));
  const correctedName = str(formData.get("correctedName")).trim();
  if (targetKind !== "pm" && targetKind !== "canonical") {
    return { ok: false, error: "Bad target." };
  }
  if (!targetKey) return { ok: false, error: "Missing operator." };
  if (!correctedName) return { ok: false, error: "Corrected name is required." };

  const priorName = await patchLiveName(targetKind, targetKey, correctedName);
  if (priorName === null) {
    return { ok: false, error: "Operator not found." };
  }

  // Upsert the source-of-truth row. On UPDATE, keep the first originalName
  // (don't overwrite with the already-corrected value).
  await prisma.operatorNameCorrection.upsert({
    where: { targetKind_targetKey: { targetKind, targetKey } },
    create: {
      targetKind,
      targetKey,
      correctedName,
      originalName: priorName,
      decidedByUserId: userId,
    },
    update: { correctedName, decidedByUserId: userId },
  });

  revalidatePath("/admin/names");
  revalidatePath("/", "layout"); // operator/market/scorecard pages
  return { ok: true, summary: `Renamed to "${correctedName}".` };
}

export async function undoCorrection(
  _prev: NameCorrectionResult | null,
  formData: FormData
): Promise<NameCorrectionResult> {
  const { userId } = await auth();
  if (!userId || !isAdminUser(userId)) return { ok: false, error: "Not found." };

  const id = str(formData.get("id"));
  if (!id) return { ok: false, error: "Missing correction id." };

  const row = await prisma.operatorNameCorrection.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "Already removed." };

  // Restore the original name to the live rows, then drop the row.
  await patchLiveName(row.targetKind, row.targetKey, row.originalName);
  await prisma.operatorNameCorrection.delete({ where: { id } });

  revalidatePath("/admin/names");
  revalidatePath("/", "layout");
  return { ok: true, summary: `Restored "${row.originalName}".` };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/names/actions.ts
git commit -m "feat(admin): live save/undo server actions for name corrections"
```

---

### Task 6: Admin UI (page + form + tab)

**Files:**
- Create: `src/app/admin/names/page.tsx`
- Create: `src/app/admin/names/OperatorNameCorrectionForm.tsx`
- Modify: `src/components/admin/AdminTabs.tsx`

**Interfaces:**
- Consumes: `searchOperators`, `loadActiveCorrections` (Task 4), `saveCorrection`, `undoCorrection` (Task 5).

- [ ] **Step 1: Add the tab** — in `src/components/admin/AdminTabs.tsx`, add to the `TABS` array after the `merges` entry:

```tsx
  { href: "/admin/names", label: "Names" },
```

- [ ] **Step 2: Create the page** `src/app/admin/names/page.tsx` (server component; the `/admin` layout already gates auth). It renders the form component and passes a `searchAction` server action wrapper + the active corrections:

```tsx
import { searchOperators, loadActiveCorrections } from "@/lib/operators/name-correction.server";
import { OperatorNameCorrectionForm } from "./OperatorNameCorrectionForm";

export const dynamic = "force-dynamic";

export default async function AdminNamesPage() {
  const active = await loadActiveCorrections();

  // Server action wrapper so the client component can search without its own
  // route handler. Returns hits for a query string.
  async function search(query: string) {
    "use server";
    return searchOperators(query);
  }

  return (
    <div className="mx-auto max-w-[1100px] px-6 pb-16">
      <h1 className="text-[20px] font-semibold text-navy mb-1">Operator names</h1>
      <p className="text-[13px] text-grey-600 mb-6">
        Correct a display name. Changes are live immediately and persist across
        data refreshes. URLs never change. Search autocomplete and PDFs update
        on the next full data refresh.
      </p>
      <OperatorNameCorrectionForm search={search} active={active} />
    </div>
  );
}
```

- [ ] **Step 3: Create the client form** `src/app/admin/names/OperatorNameCorrectionForm.tsx`. Requirements (mirror `MergeClusterCard.tsx` conventions — `"use client"`, `useActionState`, teal/navy tailwind classes):
  - Props: `search: (q: string) => Promise<OperatorHit[]>`, `active: ActiveCorrection[]`.
  - A search input; on submit (or debounce) call `search(q)` and render hits. Each hit shows `currentName` + `context` + a "Select" button. A `canonical` hit is labelled "Group (all markets)"; a `pm` hit is labelled by its market. (For a grouped PM the admin picks the PM hit to fix one market, or the canonical hit to fix the group — the two are distinct rows in results, satisfying the per-market-vs-group distinction.)
  - When a hit is selected, show a correction form bound to `saveCorrection` via `useActionState`, with hidden `targetKind` + `targetKey` and a text input `correctedName` (prefilled with `currentName`), plus a Save button. Show `result.summary`/`result.error`.
  - An "Active corrections" table from `active`: columns original → corrected, target (`pm`/`canonical` + key), current-name drift indicator (if `currentName` !== `correctedName`, show a "⚠ drifted" note), and an Undo button (a `useActionState` form bound to `undoCorrection` with hidden `id`).

Full component:

```tsx
"use client";

import { useActionState, useState } from "react";
import type { OperatorHit, ActiveCorrection } from "@/lib/operators/name-correction.server";
import { saveCorrection, undoCorrection, type NameCorrectionResult } from "./actions";

export function OperatorNameCorrectionForm({
  search,
  active,
}: {
  search: (q: string) => Promise<OperatorHit[]>;
  active: ActiveCorrection[];
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<OperatorHit[]>([]);
  const [selected, setSelected] = useState<OperatorHit | null>(null);
  const [saveState, saveAction] = useActionState<NameCorrectionResult | null, FormData>(
    saveCorrection,
    null
  );
  const [undoState, undoAction] = useActionState<NameCorrectionResult | null, FormData>(
    undoCorrection,
    null
  );

  async function runSearch() {
    setHits(await search(query));
    setSelected(null);
  }

  return (
    <div className="space-y-8">
      <section>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void runSearch();
              }
            }}
            placeholder="Search operator name…"
            className="flex-1 border border-grid rounded px-3 py-2 text-[14px]"
          />
          <button
            type="button"
            onClick={() => void runSearch()}
            className="px-4 py-2 text-[14px] font-semibold text-white bg-navy rounded"
          >
            Search
          </button>
        </div>

        {hits.length > 0 && (
          <ul className="mt-3 divide-y divide-grid border border-grid rounded">
            {hits.map((h) => (
              <li
                key={`${h.kind}:${h.key}`}
                className="flex items-center justify-between px-3 py-2"
              >
                <div>
                  <span className="text-[14px] font-medium text-navy">{h.currentName}</span>
                  <span className="ml-2 text-[12px] text-grey-600">
                    {h.kind === "canonical" ? "Group (all markets)" : h.context}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(h)}
                  className="text-[13px] font-semibold text-teal-700"
                >
                  Select
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected && (
        <section className="border border-grid rounded p-4">
          <p className="text-[13px] text-grey-600 mb-2">
            Correcting{" "}
            {selected.kind === "canonical"
              ? "the group name (all markets)"
              : `this market's name (${selected.context})`}
          </p>
          <form action={saveAction} className="flex gap-2 items-center">
            <input type="hidden" name="targetKind" value={selected.kind} />
            <input type="hidden" name="targetKey" value={selected.key} />
            <input
              name="correctedName"
              defaultValue={selected.currentName}
              className="flex-1 border border-grid rounded px-3 py-2 text-[14px]"
            />
            <button
              type="submit"
              className="px-4 py-2 text-[14px] font-semibold text-white bg-teal-700 rounded"
            >
              Save
            </button>
          </form>
          {saveState?.error && (
            <p className="mt-2 text-[13px] text-red-600">{saveState.error}</p>
          )}
          {saveState?.summary && (
            <p className="mt-2 text-[13px] text-teal-700">{saveState.summary}</p>
          )}
        </section>
      )}

      <section>
        <h2 className="text-[15px] font-semibold text-navy mb-2">Active corrections</h2>
        {active.length === 0 ? (
          <p className="text-[13px] text-grey-600">None yet.</p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-grey-600 border-b border-grid">
                <th className="py-2">Original</th>
                <th>Corrected</th>
                <th>Target</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {active.map((c) => (
                <tr key={c.id} className="border-b border-grid">
                  <td className="py-2">{c.originalName}</td>
                  <td>
                    {c.correctedName}
                    {c.currentName !== null && c.currentName !== c.correctedName && (
                      <span className="ml-2 text-[11px] text-amber-600">⚠ drifted</span>
                    )}
                  </td>
                  <td className="text-grey-600">
                    {c.targetKind === "canonical" ? "Group" : "Market"} · {c.targetKey}
                  </td>
                  <td className="text-right">
                    <form action={undoAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <button type="submit" className="text-[13px] text-red-600">
                        Undo
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {undoState?.summary && (
          <p className="mt-2 text-[13px] text-teal-700">{undoState.summary}</p>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Type-check + tests**

Run: `npx tsc --noEmit && npm run test:watch-list`
Expected: tsc exit 0; all tests pass (incl. the Task 2 additions).

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/names src/components/admin/AdminTabs.tsx
git commit -m "feat(admin): operator name-correction UI (Names tab)"
```

---

### Task 7: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Full CI gate**

Run: `cd "/Users/jonasbordo/Documents/Claude/Projects/PM Intel/iq-dwellsy" && npx prisma generate && npx tsc --noEmit && npm run test:watch-list`
Expected: prisma generates; tsc exit 0; all tests pass.

- [ ] **Step 2: Smoke-test in the browser preview** (the dev server reads the shared Neon DB, so the table must exist — if the migration hasn't been deployed yet, this step is deferred until the PR's Vercel preview runs `migrate deploy`; verify there instead). On `/admin/names`:
  - Search an operator, select a `pm` hit, correct the name, Save → the operator's scorecard header + market-list row show the new name after refresh; the URL is unchanged.
  - Correct a `canonical` group → all member markets show the new group name on the operator page.
  - Undo → the original name returns.

- [ ] **Step 3: Open the PR** for review (branch `admin-name-corrections`). Note in the body: Phase-1 scope (search/PDF/briefs deferred), the migration is additive, and durability is verified by the seed re-apply path.

---

## Notes for the implementer

- **Reseed durability holds in both deploy cases:** an unrelated deploy with no seed-data change hits seed's `isDataCurrent()` early-return, so PM rows aren't wiped and the live patch persists; a data-change deploy wipes + recreates but Task 3 re-applies the corrections. Either way the corrected name survives.
- **Do not** run `prisma migrate dev/deploy` or `prisma db seed` locally (shared Neon). The migration applies on the PR's Vercel deploy via `vercel-build`.
- If tsc complains about `mode: "insensitive"` on the Prisma `where`, confirm the generated client is up to date (`npx prisma generate`) — it's standard Postgres-provider Prisma.
