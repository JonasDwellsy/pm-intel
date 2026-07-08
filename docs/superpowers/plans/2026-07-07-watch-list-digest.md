# Watch-list Change-Alerts Digest — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A monthly email digest that notifies watch-list users when a watched operator's scorecard shifted, triggered when a new month of data lands.

**Architecture:** A daily Vercel Cron hits a secret-protected `GET /api/cron/watch-list-digest`. The route checks whether `max(OperatorSnapshot.snapshotDate)` is newer than the last completed digest run; if so it composes and sends. Composition reuses the existing pure diff engine (`diffSnapshots`/`summariseChanges`) and the existing `getActiveOrgId → getEntitledMarketIds → applyWatchList` evaluation path. Clean layering: a pure composer (`digest.ts`), a pure token module (`digest-unsubscribe.ts`), a thin Resend wrapper (`email/send.ts`), impure gathering (`digest-run.ts`), and thin routes.

**Tech Stack:** TypeScript, Next.js 16 App Router (async route params), Prisma + Postgres (Neon), Clerk (backend SDK for org members), Resend (new), node:test + tsx.

**Spec:** `docs/superpowers/specs/2026-07-07-watch-list-digest-design.md`

## Global Constraints

- Never run `prisma db seed` (writes the shared Neon DB; re-seed happens on deploy). Never read `.env*` files.
- Author migrations DB-free: `npx prisma migrate diff --from-migrations ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma --script` → save as the migration SQL. Do NOT run `prisma migrate dev` (it mutates the shared DB). Migration dir naming: `YYYYMMDDHHMMSS_snake_case_description`, one `migration.sql`. Migrations apply on deploy via `prisma migrate deploy`.
- Recipients are all members of any org owning ≥1 watch list, **opt-out** (per-user `DigestPreference.unsubscribed`). One aggregated digest per user.
- Trigger detects DATA (a new `snapshotDate`), never the seed mechanism — it must survive the future live-DB ingestion rewire.
- Reuse, don't rebuild: `diffSnapshots`/`summariseChanges` (`src/lib/watch-list/change-detection.ts`), the snapshot→`SnapshotRow` mapping, and the `applyWatchList` entitlement-scoped path. Diff thresholds are fixed at their existing values (`CONCESSION_SHIFT_THRESHOLD_PP = 5`, `PORTFOLIO_SIZE_THRESHOLD_PCT = 0.2`).
- The digest evaluates watch lists through the SAME market-entitlement scoping as `/results` — never email an org about markets it can't access.
- Empty digests are never sent: a recipient with zero changes across all lists is skipped; `buildDigest` returns `null` for empty input.
- Provider isolated behind `sendEmail(...)` — the only file importing the `resend` SDK.
- New env vars documented in `.env.example`: `RESEND_API_KEY`, `DIGEST_FROM_EMAIL`, `DIGEST_UNSUB_SECRET`, `CRON_SECRET`.
- Tests: node:test via `npm run test:watch-list`. New test files go under `src/lib/watch-list/` or `src/lib/email/` — if under `src/lib/email/`, add that glob to the `test:watch-list` script.
- TDD, DRY, YAGNI, frequent commits. Run `npx tsc --noEmit` before each commit.
- Work on branch `feat/watch-list-digest` (already checked out; the spec is already committed there).

## File Structure

- `src/lib/watch-list/snapshot.ts` (modify) — add exported `toSnapshotRow(row)` + its `RawSnapshotRow` type + `safeParseStars`/`safeParseStringArray`, moved from `changes.ts`.
- `src/lib/watch-list/changes.ts` (modify) — import `toSnapshotRow` from `snapshot.ts`; delete the local copies. No behavior change.
- `prisma/schema.prisma` (modify) + `prisma/migrations/<ts>_watch_list_digest/migration.sql` (create) — 3 new models.
- `src/lib/watch-list/digest-unsubscribe.ts` (create) + test — HMAC token sign/verify.
- `src/lib/watch-list/digest.ts` (create) + test — pure composer `buildDigest`.
- `src/lib/email/send.ts` (create) — Resend wrapper.
- `src/lib/watch-list/digest-run.ts` (create) + test — snapshot-pair selection, per-list change gathering, recipient filtering (pure helpers tested), and the impure `runDigest` orchestrator.
- `src/app/api/cron/watch-list-digest/route.ts` (create) — cron entrypoint.
- `src/app/api/digest/unsubscribe/route.ts` (create) — unsubscribe confirmation.
- `vercel.json` (create) — cron schedule.
- `.env.example` (modify), `package.json` (modify — add `resend`, maybe extend test glob).

---

### Task 1: Extract `toSnapshotRow` into `snapshot.ts` (refactor, no behavior change)

**Files:**
- Modify: `src/lib/watch-list/snapshot.ts` (add exports)
- Modify: `src/lib/watch-list/changes.ts` (import instead of local copy)
- Test: `src/lib/watch-list/snapshot.test.ts` (create)

**Interfaces:**
- Produces: `toSnapshotRow(row: RawSnapshotRow): SnapshotRow`, `type RawSnapshotRow` — both exported from `src/lib/watch-list/snapshot.ts`. Later tasks import `toSnapshotRow` to hydrate `OperatorSnapshot` rows.
- Consumes: existing `SnapshotRow`, `StarsPerMetric` (already in `snapshot.ts`).

- [ ] **Step 1: Write the failing test** — `src/lib/watch-list/snapshot.test.ts`:

```ts
import test from "node:test";
import { strict as assert } from "node:assert";
import { toSnapshotRow, type RawSnapshotRow } from "./snapshot";

function raw(overrides: Partial<RawSnapshotRow> = {}): RawSnapshotRow {
  return {
    pmSlug: "acme-chattanooga-tn",
    snapshotDate: new Date("2026-06-30"),
    methodologyVersion: "v0.6.4",
    starsPerMetric: JSON.stringify({ leaseUp: "gold", tenancy: "silver" }),
    starGoldCount: 1,
    starSilverCount: 1,
    estimatedPortfolioPoint: 120,
    estimatedPortfolioBand: "Medium",
    topMSAs: JSON.stringify(["chattanooga-tn"]),
    topSubmarkets: JSON.stringify(["downtown"]),
    concessionRate: 0.1,
    isEligibleForRanking: true,
    ...overrides,
  };
}

test("toSnapshotRow parses JSON columns and preserves scalars", () => {
  const r = toSnapshotRow(raw());
  assert.equal(r.pmSlug, "acme-chattanooga-tn");
  assert.deepEqual(r.starsPerMetric, {
    leaseUp: "gold", tenancy: "silver",
    rentPerformance: null, marketingDiscipline: null, inventoryTransparency: null,
  });
  assert.deepEqual(r.topMSAs, ["chattanooga-tn"]);
  assert.deepEqual(r.topSubmarkets, ["downtown"]);
  assert.equal(r.estimatedPortfolioPoint, 120);
  assert.equal(r.isEligibleForRanking, true);
});

test("toSnapshotRow tolerates malformed JSON columns", () => {
  const r = toSnapshotRow(raw({ starsPerMetric: "not json", topMSAs: "{", topSubmarkets: "" }));
  assert.deepEqual(r.starsPerMetric, {
    leaseUp: null, tenancy: null, rentPerformance: null,
    marketingDiscipline: null, inventoryTransparency: null,
  });
  assert.deepEqual(r.topMSAs, []);
  assert.deepEqual(r.topSubmarkets, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/watch-list/snapshot.test.ts`
Expected: FAIL — `toSnapshotRow`/`RawSnapshotRow` not exported.

- [ ] **Step 3: Move the mapping into `snapshot.ts`.** Append to `src/lib/watch-list/snapshot.ts` (after the existing `SnapshotRow` interface). This is the verbatim code currently in `changes.ts` (`RawSnapshotRow`, `hydrateRow`, `safeParseStars`, `safeParseStringArray`), renamed `hydrateRow` → `toSnapshotRow` and exported:

```ts
/** Prisma OperatorSnapshot row shape (JSON columns as serialised strings). */
export interface RawSnapshotRow {
  pmSlug: string;
  snapshotDate: Date;
  methodologyVersion: string;
  starsPerMetric: string;
  starGoldCount: number;
  starSilverCount: number;
  estimatedPortfolioPoint: number | null;
  estimatedPortfolioBand: string | null;
  topMSAs: string;
  topSubmarkets: string;
  concessionRate: number | null;
  isEligibleForRanking: boolean;
}

/** Convert a Prisma OperatorSnapshot row into the SnapshotRow shape the pure
 *  diff library expects. Shared by the /changes page path and the digest. */
export function toSnapshotRow(row: RawSnapshotRow): SnapshotRow {
  return {
    pmSlug: row.pmSlug,
    snapshotDate: row.snapshotDate,
    methodologyVersion: row.methodologyVersion,
    starsPerMetric: safeParseStars(row.starsPerMetric),
    starGoldCount: row.starGoldCount,
    starSilverCount: row.starSilverCount,
    estimatedPortfolioPoint: row.estimatedPortfolioPoint,
    estimatedPortfolioBand: row.estimatedPortfolioBand,
    topMSAs: safeParseStringArray(row.topMSAs),
    topSubmarkets: safeParseStringArray(row.topSubmarkets),
    concessionRate: row.concessionRate,
    isEligibleForRanking: row.isEligibleForRanking,
  };
}

function safeParseStars(raw: string): StarsPerMetric {
  const empty: StarsPerMetric = {
    leaseUp: null, tenancy: null, rentPerformance: null,
    marketingDiscipline: null, inventoryTransparency: null,
  };
  try {
    const parsed = JSON.parse(raw) as Partial<StarsPerMetric>;
    return { ...empty, ...parsed };
  } catch {
    return empty;
  }
}

function safeParseStringArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === "string");
    return [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Update `changes.ts` to import instead of re-declare.** In `src/lib/watch-list/changes.ts`: delete the local `RawSnapshotRow` interface, `hydrateRow`, `safeParseStars`, and `safeParseStringArray`. Add `toSnapshotRow` to the existing import from `./snapshot` (and `RawSnapshotRow` if the file references the type). Replace the two `hydrateRow(row)` call sites (in `fetchLatestSnapshots` and `fetchSnapshotsAtOrBefore`) with `toSnapshotRow(row)`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --import tsx --test src/lib/watch-list/snapshot.test.ts src/lib/watch-list/changes.test.ts src/lib/watch-list/change-detection.test.ts`
Expected: PASS — the new snapshot tests pass and the pre-existing changes/change-detection tests still pass (behavior unchanged).

- [ ] **Step 6: tsc + commit**

```bash
npx tsc --noEmit
git add src/lib/watch-list/snapshot.ts src/lib/watch-list/changes.ts src/lib/watch-list/snapshot.test.ts
git commit -m "refactor(watch-list): extract toSnapshotRow into snapshot.ts for reuse"
```

---

### Task 2: Prisma models + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260707000000_watch_list_digest/migration.sql`

**Interfaces:**
- Produces: Prisma models `DigestPreference`, `WatchListDigestRun`, `WatchListDigestSend` → generated client accessors `prisma.digestPreference`, `prisma.watchListDigestRun`, `prisma.watchListDigestSend`.

- [ ] **Step 1: Add the models to `prisma/schema.prisma`** (append near the other watch-list models):

```prisma
model DigestPreference {
  id           String   @id @default(cuid())
  userId       String   @unique
  unsubscribed Boolean  @default(false)
  updatedAt    DateTime @updatedAt
}

model WatchListDigestRun {
  id             String    @id @default(cuid())
  snapshotDate   DateTime
  status         String    @default("running")
  recipientCount Int       @default(0)
  startedAt      DateTime  @default(now())
  completedAt    DateTime?
  sends          WatchListDigestSend[]

  @@index([snapshotDate])
}

model WatchListDigestSend {
  id      String   @id @default(cuid())
  runId   String
  userId  String
  email   String
  status  String
  sentAt  DateTime @default(now())
  run     WatchListDigestRun @relation(fields: [runId], references: [id], onDelete: Cascade)

  @@unique([runId, userId])
}
```

- [ ] **Step 2: Validate + generate the client (no DB writes)**

Run: `npx prisma validate && npx prisma generate`
Expected: "The schema … is valid" and the client regenerates. (Neither command mutates the DB.)

- [ ] **Step 3: Generate the migration SQL DB-free**

Run (DB-free — diff the committed schema against the working-tree schema; NOTE: `--from-migrations` is NOT usable here because it requires `--shadow-database-url`, i.e. a live DB):
```bash
git show HEAD:prisma/schema.prisma > /tmp/schema_old.prisma   # use the scratchpad dir, not /tmp, if constrained
mkdir -p prisma/migrations/20260707000000_watch_list_digest
npx prisma migrate diff \
  --from-schema-datamodel /tmp/schema_old.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/20260707000000_watch_list_digest/migration.sql
```
Expected: a `migration.sql` containing three `CREATE TABLE` statements plus the unique index on `DigestPreference.userId`, the `WatchListDigestRun.snapshotDate` index, the `@@unique([runId, userId])` index, and the `WatchListDigestSend.runId` foreign key. Open the file and confirm it contains ONLY additive `CREATE TABLE`/`CREATE INDEX`/`ALTER TABLE … ADD CONSTRAINT` for these three tables — no `DROP`, no changes to existing tables. If `migrate diff` reports it needs a database connection, STOP and report BLOCKED rather than pointing it at Neon.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260707000000_watch_list_digest/migration.sql
git commit -m "feat(digest): DigestPreference + WatchListDigestRun/Send models + migration"
```

---

### Task 3: Unsubscribe HMAC token module

**Files:**
- Create: `src/lib/watch-list/digest-unsubscribe.ts`
- Test: `src/lib/watch-list/digest-unsubscribe.test.ts`

**Interfaces:**
- Produces: `signUnsubToken(userId: string): string`, `verifyUnsubToken(userId: string, token: string): boolean`. Reads `process.env.DIGEST_UNSUB_SECRET`.

- [ ] **Step 1: Write the failing test** — `src/lib/watch-list/digest-unsubscribe.test.ts`:

```ts
import test from "node:test";
import { strict as assert } from "node:assert";
import { signUnsubToken, verifyUnsubToken } from "./digest-unsubscribe";

// Set before any test runs; the module reads the secret lazily at call time,
// so a static import is fine (this repo's tsx test runner rejects top-level await).
process.env.DIGEST_UNSUB_SECRET = "test-secret-do-not-use-in-prod";

test("sign then verify round-trips for the same user", () => {
  const t = signUnsubToken("user_123");
  assert.equal(verifyUnsubToken("user_123", t), true);
});

test("token for one user does not verify for another", () => {
  const t = signUnsubToken("user_123");
  assert.equal(verifyUnsubToken("user_999", t), false);
});

test("tampered token is rejected", () => {
  const t = signUnsubToken("user_123");
  assert.equal(verifyUnsubToken("user_123", t.slice(0, -2) + "xy"), false);
});

test("garbage / empty token is rejected without throwing", () => {
  assert.equal(verifyUnsubToken("user_123", ""), false);
  assert.equal(verifyUnsubToken("user_123", "!!!"), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/watch-list/digest-unsubscribe.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement** `src/lib/watch-list/digest-unsubscribe.ts`:

```ts
// Stateless unsubscribe tokens: HMAC-SHA256(userId, DIGEST_UNSUB_SECRET),
// hex-encoded. No token storage — the /api/digest/unsubscribe route verifies
// the HMAC and flips DigestPreference.unsubscribed. Constant-time compare.
import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  const s = process.env.DIGEST_UNSUB_SECRET;
  if (!s) throw new Error("DIGEST_UNSUB_SECRET is not set");
  return s;
}

export function signUnsubToken(userId: string): string {
  return createHmac("sha256", secret()).update(userId).digest("hex");
}

export function verifyUnsubToken(userId: string, token: string): boolean {
  if (!token) return false;
  let expected: string;
  try {
    expected = signUnsubToken(userId);
  } catch {
    return false;
  }
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(token, "hex");
  if (a.length !== b.length || b.length === 0) return false;
  return timingSafeEqual(a, b);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/lib/watch-list/digest-unsubscribe.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: tsc + commit**

```bash
npx tsc --noEmit
git add src/lib/watch-list/digest-unsubscribe.ts src/lib/watch-list/digest-unsubscribe.test.ts
git commit -m "feat(digest): stateless HMAC unsubscribe token"
```

---

### Task 4: Pure digest composer `buildDigest`

**Files:**
- Create: `src/lib/watch-list/digest.ts`
- Test: `src/lib/watch-list/digest.test.ts`

**Interfaces:**
- Consumes: `OperatorChange` from `./change-detection`.
- Produces:
  - `interface DigestOperatorInput { pmSlug: string; name: string; marketLabel: string; scorecardUrl: string; changes: OperatorChange[] }`
  - `interface DigestListInput { watchListName: string; operators: DigestOperatorInput[] }`
  - `interface DigestInput { recipientFirstName: string | null; monthLabel: string; lists: DigestListInput[]; unsubscribeUrl: string; scorecardBaseUrl: string }`
  - `interface DigestEmail { subject: string; html: string; text: string }`
  - `buildDigest(input: DigestInput): DigestEmail | null` — returns `null` when no list has any operator with ≥1 change.
  - `describeChange(c: OperatorChange): string` (exported for testing).

- [ ] **Step 1: Write the failing test** — `src/lib/watch-list/digest.test.ts`:

```ts
import test from "node:test";
import { strict as assert } from "node:assert";
import { buildDigest, describeChange, type DigestInput } from "./digest";
import type { OperatorChange } from "./change-detection";

function input(overrides: Partial<DigestInput> = {}): DigestInput {
  return {
    recipientFirstName: "Sam",
    monthLabel: "June 2026",
    unsubscribeUrl: "https://iq.dwellsy.com/api/digest/unsubscribe?u=user_1&t=abc",
    scorecardBaseUrl: "https://iq.dwellsy.com",
    lists: [
      {
        watchListName: "SFR scale-ups",
        operators: [
          {
            pmSlug: "acme-chattanooga-tn",
            name: "Acme Homes",
            marketLabel: "Chattanooga",
            scorecardUrl: "https://iq.dwellsy.com/property-managers/tn/chattanooga/acme-chattanooga-tn",
            changes: [
              { type: "star", metric: "tenancy", before: "silver", after: "gold" },
              { type: "eligibility_flip", direction: "entered" },
            ] as OperatorChange[],
          },
        ],
      },
    ],
    ...overrides,
  };
}

test("returns null when there are no changes", () => {
  assert.equal(buildDigest(input({ lists: [] })), null);
  assert.equal(buildDigest(input({ lists: [{ watchListName: "Empty", operators: [] }] })), null);
});

test("subject names the month", () => {
  const email = buildDigest(input())!;
  assert.match(email.subject, /June 2026/);
});

test("html + text include operator, market, list name, and scorecard link", () => {
  const email = buildDigest(input())!;
  for (const body of [email.html, email.text]) {
    assert.match(body, /Acme Homes/);
    assert.match(body, /Chattanooga/);
    assert.match(body, /SFR scale-ups/);
  }
  assert.match(email.html, /property-managers\/tn\/chattanooga\/acme-chattanooga-tn/);
});

test("html + text include the unsubscribe link", () => {
  const email = buildDigest(input())!;
  // HTML escapes & → &amp; in the href (valid HTML; clients parse it back).
  assert.match(email.html, /api\/digest\/unsubscribe\?u=user_1&amp;t=abc/);
  assert.match(email.text, /api\/digest\/unsubscribe\?u=user_1&t=abc/);
});

test("describeChange renders each variant as human copy", () => {
  const cases: OperatorChange[] = [
    { type: "star", metric: "leaseUp", before: null, after: "gold" },
    { type: "portfolio_band", before: "Low", after: "Medium" },
    { type: "portfolio_size", before: 100, after: 130, pctChange: 0.3 },
    { type: "market_added", marketId: "nashville-tn" },
    { type: "market_dropped", marketId: "memphis-tn" },
    { type: "submarket_added", submarketSlug: "downtown" },
    { type: "submarket_dropped", submarketSlug: "midtown" },
    { type: "concession_transition", direction: "appeared", before: null, after: 0.08 },
    { type: "concession_shift", before: 0.05, after: 0.12, deltaPp: 7 },
    { type: "eligibility_flip", direction: "exited" },
  ];
  for (const c of cases) {
    const s = describeChange(c);
    assert.ok(s.length > 0, `empty copy for ${c.type}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/watch-list/digest.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement** `src/lib/watch-list/digest.ts`:

```ts
// Pure digest composer. No I/O. Turns per-list operator changes into a
// {subject, html, text} email, or null when there is nothing to report.
// The diff engine (change-detection.ts) is slug-keyed and carries no display
// strings, so the caller supplies name/market/scorecardUrl per operator.
import type { OperatorChange, ChangeType } from "./change-detection";

export interface DigestOperatorInput {
  pmSlug: string;
  name: string;
  marketLabel: string;
  scorecardUrl: string;
  changes: OperatorChange[];
}
export interface DigestListInput {
  watchListName: string;
  operators: DigestOperatorInput[];
}
export interface DigestInput {
  recipientFirstName: string | null;
  monthLabel: string;
  lists: DigestListInput[];
  unsubscribeUrl: string;
  scorecardBaseUrl: string;
}
export interface DigestEmail {
  subject: string;
  html: string;
  text: string;
}

// Lead with the high-signal changes; group the noisier ones after.
const SALIENCE: Record<ChangeType, number> = {
  star: 0,
  eligibility_flip: 1,
  market_added: 2,
  market_dropped: 2,
  portfolio_band: 3,
  portfolio_size: 4,
  concession_transition: 5,
  concession_shift: 5,
  submarket_added: 6,
  submarket_dropped: 6,
};

const METRIC_LABEL: Record<string, string> = {
  leaseUp: "Lease-up",
  tenancy: "Tenant retention",
  rentPerformance: "Rent performance",
  marketingDiscipline: "Marketing discipline",
  inventoryTransparency: "Inventory transparency",
};

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
function star(s: "gold" | "silver" | null): string {
  return s === null ? "no star" : s;
}

export function describeChange(c: OperatorChange): string {
  switch (c.type) {
    case "star":
      return `${METRIC_LABEL[c.metric] ?? c.metric}: ${star(c.before)} → ${star(c.after)}`;
    case "eligibility_flip":
      return c.direction === "entered"
        ? "Entered the ranked cohort"
        : "Dropped below the ranking threshold";
    case "market_added":
      return `Entered a new market (${c.marketId})`;
    case "market_dropped":
      return `Left a market (${c.marketId})`;
    case "portfolio_band":
      return `Portfolio confidence band: ${c.before ?? "—"} → ${c.after ?? "—"}`;
    case "portfolio_size": {
      const dir = c.pctChange >= 0 ? "up" : "down";
      return `Estimated portfolio ${dir} ${pct(Math.abs(c.pctChange))} (${c.before ?? "—"} → ${c.after ?? "—"})`;
    }
    case "concession_transition":
      return c.direction === "appeared"
        ? `Started advertising concessions (${c.after != null ? pct(c.after) : "—"})`
        : "Stopped advertising concessions";
    case "concession_shift": {
      const dir = c.after >= c.before ? "up" : "down";
      return `Concessions ${dir} ${Math.abs(Math.round(c.deltaPp))}pp (${pct(c.before)} → ${pct(c.after)})`;
    }
    case "submarket_added":
      return `Active in a new submarket (${c.submarketSlug})`;
    case "submarket_dropped":
      return `Left a submarket (${c.submarketSlug})`;
  }
}

function sortChanges(changes: OperatorChange[]): OperatorChange[] {
  return [...changes].sort((a, b) => SALIENCE[a.type] - SALIENCE[b.type]);
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildDigest(input: DigestInput): DigestEmail | null {
  const lists = input.lists
    .map((l) => ({ ...l, operators: l.operators.filter((o) => o.changes.length > 0) }))
    .filter((l) => l.operators.length > 0);
  if (lists.length === 0) return null;

  const opCount = lists.reduce((n, l) => n + l.operators.length, 0);
  const subject = `Your Dwellsy IQ watch-list update — ${input.monthLabel}`;
  const greeting = input.recipientFirstName ? `Hi ${input.recipientFirstName},` : "Hi,";
  const lede = `${opCount} watched operator${opCount === 1 ? "" : "s"} changed in the latest data (${input.monthLabel}).`;

  // ---- text ----
  const textParts: string[] = [greeting, "", lede, ""];
  for (const l of lists) {
    textParts.push(`## ${l.watchListName}`);
    for (const o of l.operators) {
      textParts.push(`- ${o.name} (${o.marketLabel}) — ${o.scorecardUrl}`);
      for (const c of sortChanges(o.changes)) textParts.push(`    • ${describeChange(c)}`);
    }
    textParts.push("");
  }
  textParts.push(`Unsubscribe: ${input.unsubscribeUrl}`);
  const text = textParts.join("\n");

  // ---- html ----
  const sections = lists
    .map((l) => {
      const rows = l.operators
        .map((o) => {
          const items = sortChanges(o.changes)
            .map((c) => `<li style="margin:2px 0;color:#2a3547;font-size:13px;">${esc(describeChange(c))}</li>`)
            .join("");
          return `
            <tr><td style="padding:10px 0;border-top:1px solid #eef1f6;">
              <a href="${esc(o.scorecardUrl)}" style="font-weight:600;color:#0f1f3f;text-decoration:none;font-size:14px;">${esc(o.name)}</a>
              <span style="color:#6b7688;font-size:12px;"> · ${esc(o.marketLabel)}</span>
              <ul style="margin:6px 0 0;padding-left:18px;">${items}</ul>
            </td></tr>`;
        })
        .join("");
      return `
        <h2 style="font-size:15px;color:#0f1f3f;margin:20px 0 4px;">${esc(l.watchListName)}</h2>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`;
    })
    .join("");

  const html = `<!-- Dwellsy IQ watch-list digest -->
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;color:#2a3547;">
  <p style="font-size:14px;">${esc(greeting)}</p>
  <p style="font-size:14px;">${esc(lede)}</p>
  ${sections}
  <hr style="border:none;border-top:1px solid #eef1f6;margin:24px 0 12px;">
  <p style="font-size:11px;color:#8894ac;">
    You receive this because your organization has a Dwellsy IQ watch list.
    <a href="${esc(input.unsubscribeUrl)}" style="color:#8894ac;">Unsubscribe</a>.<br>
    Dwellsy, Inc.
  </p>
</div>`;

  return { subject, html, text };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/lib/watch-list/digest.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: tsc + commit**

```bash
npx tsc --noEmit
git add src/lib/watch-list/digest.ts src/lib/watch-list/digest.test.ts
git commit -m "feat(digest): pure digest composer (subject/html/text, salience ordering)"
```

---

### Task 5: Resend email wrapper + config

**Files:**
- Create: `src/lib/email/send.ts`
- Modify: `.env.example`, `package.json` (add `resend` dependency)

**Interfaces:**
- Produces: `sendEmail(msg: { to: string; subject: string; html: string; text: string }): Promise<{ ok: true; id: string } | { ok: false; error: string }>`. Reads `RESEND_API_KEY`, `DIGEST_FROM_EMAIL`.

- [ ] **Step 1: Add the dependency**

Run: `npm install resend`
Expected: `resend` added to `package.json` dependencies; lockfile updated.

- [ ] **Step 2: Implement** `src/lib/email/send.ts`:

```ts
// Thin provider boundary — the ONLY file that imports the Resend SDK.
// Swapping providers touches only this file.
import { Resend } from "resend";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}
export type SendResult = { ok: true; id: string } | { ok: false; error: string };

export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.DIGEST_FROM_EMAIL;
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY not set" };
  if (!from) return { ok: false, error: "DIGEST_FROM_EMAIL not set" };
  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    });
    if (error) return { ok: false, error: error.message ?? String(error) };
    return { ok: true, id: data?.id ?? "" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
```

- [ ] **Step 3: Add env vars to `.env.example`** (append):

```bash
# Resend — transactional email for the watch-list monthly digest (v0.26).
# The digest is the only email path we own (Clerk handles auth emails).
# RESEND_API_KEY: from the Resend dashboard (re_...). DIGEST_FROM_EMAIL: a
# sender on a Resend-verified domain, e.g. "Dwellsy IQ <iq@dwellsy.com>".
# Without both set, sendEmail() returns { ok:false } and the digest run
# records failed sends instead of throwing.
RESEND_API_KEY=""
DIGEST_FROM_EMAIL=""

# Digest cron + unsubscribe secrets (v0.26). CRON_SECRET gates
# /api/cron/watch-list-digest (Vercel Cron sends it as a Bearer token;
# set the SAME value in Vercel → Project → Settings → Environment and it
# is auto-attached to cron invocations). DIGEST_UNSUB_SECRET signs the
# stateless HMAC unsubscribe tokens — rotating it invalidates outstanding
# unsubscribe links.
CRON_SECRET=""
DIGEST_UNSUB_SECRET=""
```

- [ ] **Step 4: Verify build + commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add src/lib/email/send.ts .env.example package.json package-lock.json
git commit -m "feat(digest): Resend email wrapper + digest env vars"
```

---

### Task 6: Digest gathering core (snapshot pair, per-list changes, recipient filtering)

**Files:**
- Create: `src/lib/watch-list/digest-run.ts` (pure helpers + impure gatherers; the `runDigest` orchestrator is added in Task 7)
- Test: `src/lib/watch-list/digest-run.test.ts`

**Interfaces:**
- Consumes: `toSnapshotRow` (Task 1), `diffSnapshots` (`./change-detection`), `SnapshotRow` (`./snapshot`), `DigestOperatorInput`/`DigestListInput` (Task 4).
- Produces (this task):
  - `selectSnapshotPair(dates: Date[]): { latest: Date; prior: Date } | null` — pure. Returns the two most-recent DISTINCT dates, or null if fewer than two distinct dates exist.
  - `buildListChanges(args: { watchListName: string; matchedPmSlugs: string[]; latestBySlug: Map<string, SnapshotRow>; priorBySlug: Map<string, SnapshotRow>; metaBySlug: Map<string, { name: string; marketLabel: string; scorecardUrl: string }> }): DigestListInput` — pure. Diffs latest-vs-prior per matched slug that has BOTH snapshots; drops operators with zero changes; skips slugs missing meta.
  - `filterSubscribed(recipients: { userId: string; email: string }[], unsubscribedUserIds: Set<string>): { userId: string; email: string }[]` — pure.

- [ ] **Step 1: Write the failing test** — `src/lib/watch-list/digest-run.test.ts`:

```ts
import test from "node:test";
import { strict as assert } from "node:assert";
import { selectSnapshotPair, buildListChanges, filterSubscribed } from "./digest-run";
import type { SnapshotRow, StarsPerMetric } from "./snapshot";

const noStars: StarsPerMetric = {
  leaseUp: null, tenancy: null, rentPerformance: null,
  marketingDiscipline: null, inventoryTransparency: null,
};
function snap(pmSlug: string, date: string, over: Partial<SnapshotRow> = {}): SnapshotRow {
  return {
    pmSlug, snapshotDate: new Date(date), methodologyVersion: "v0.6.4",
    starsPerMetric: noStars, starGoldCount: 0, starSilverCount: 0,
    estimatedPortfolioPoint: 100, estimatedPortfolioBand: "Low",
    topMSAs: [], topSubmarkets: [], concessionRate: null, isEligibleForRanking: true,
    ...over,
  };
}

test("selectSnapshotPair returns the two most recent distinct dates", () => {
  const pair = selectSnapshotPair([
    new Date("2026-04-30"), new Date("2026-06-30"), new Date("2026-05-31"), new Date("2026-06-30"),
  ]);
  assert.deepEqual(pair, { latest: new Date("2026-06-30"), prior: new Date("2026-05-31") });
});

test("selectSnapshotPair returns null with fewer than two distinct dates", () => {
  assert.equal(selectSnapshotPair([new Date("2026-06-30"), new Date("2026-06-30")]), null);
  assert.equal(selectSnapshotPair([]), null);
});

test("buildListChanges diffs both-snapshot operators and drops no-change / half-snapshot ones", () => {
  const latest = new Map<string, SnapshotRow>([
    ["a", snap("a", "2026-06-30", { starGoldCount: 1, starsPerMetric: { ...noStars, tenancy: "gold" } })],
    ["b", snap("b", "2026-06-30")], // unchanged
    ["c", snap("c", "2026-06-30")], // no prior -> skipped
  ]);
  const prior = new Map<string, SnapshotRow>([
    ["a", snap("a", "2026-05-31")],
    ["b", snap("b", "2026-05-31")],
  ]);
  const meta = new Map([
    ["a", { name: "Acme", marketLabel: "Chattanooga", scorecardUrl: "https://x/a" }],
    ["b", { name: "Beta", marketLabel: "Nashville", scorecardUrl: "https://x/b" }],
    ["c", { name: "Gamma", marketLabel: "Memphis", scorecardUrl: "https://x/c" }],
  ]);
  const out = buildListChanges({
    watchListName: "L1", matchedPmSlugs: ["a", "b", "c"],
    latestBySlug: latest, priorBySlug: prior, metaBySlug: meta,
  });
  assert.equal(out.watchListName, "L1");
  assert.equal(out.operators.length, 1);          // only 'a' changed
  assert.equal(out.operators[0].pmSlug, "a");
  assert.ok(out.operators[0].changes.some((c) => c.type === "star"));
});

test("filterSubscribed removes unsubscribed users", () => {
  const out = filterSubscribed(
    [{ userId: "u1", email: "a@x.com" }, { userId: "u2", email: "b@x.com" }],
    new Set(["u2"]),
  );
  assert.deepEqual(out, [{ userId: "u1", email: "a@x.com" }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/watch-list/digest-run.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the pure helpers** in `src/lib/watch-list/digest-run.ts`:

```ts
// Digest gathering. Pure helpers (snapshot-pair selection, per-list diff,
// recipient filtering) are unit-tested; the impure gatherers below reuse the
// same applyWatchList entitlement path as /results and the shared diff engine.
import { prisma } from "@/lib/prisma";
import { diffSnapshots } from "./change-detection";
import { toSnapshotRow, type SnapshotRow } from "./snapshot";
import type { DigestListInput, DigestOperatorInput } from "./digest";

export function selectSnapshotPair(dates: Date[]): { latest: Date; prior: Date } | null {
  const distinct = Array.from(new Set(dates.map((d) => d.getTime()))).sort((a, b) => b - a);
  if (distinct.length < 2) return null;
  return { latest: new Date(distinct[0]), prior: new Date(distinct[1]) };
}

export interface OperatorMeta {
  name: string;
  marketLabel: string;
  scorecardUrl: string;
}

export function buildListChanges(args: {
  watchListName: string;
  matchedPmSlugs: string[];
  latestBySlug: Map<string, SnapshotRow>;
  priorBySlug: Map<string, SnapshotRow>;
  metaBySlug: Map<string, OperatorMeta>;
}): DigestListInput {
  const operators: DigestOperatorInput[] = [];
  for (const slug of args.matchedPmSlugs) {
    const cur = args.latestBySlug.get(slug);
    const prev = args.priorBySlug.get(slug);
    const meta = args.metaBySlug.get(slug);
    if (!cur || !prev || !meta) continue; // need both snapshots + display meta
    const changes = diffSnapshots(prev, cur);
    if (changes.length === 0) continue;
    operators.push({ pmSlug: slug, ...meta, changes });
  }
  return { watchListName: args.watchListName, operators };
}

export function filterSubscribed(
  recipients: { userId: string; email: string }[],
  unsubscribedUserIds: Set<string>,
): { userId: string; email: string }[] {
  return recipients.filter((r) => !unsubscribedUserIds.has(r.userId));
}
```

- [ ] **Step 4: Add the impure snapshot fetchers** to the SAME file (used by Task 7). These mirror `changes.ts`'s fetch pattern but fetch a fixed pair of dates:

```ts
/** Newest snapshot per slug AT a specific date (equality on snapshotDate). */
export async function fetchSnapshotsAt(
  pmSlugs: string[],
  date: Date,
): Promise<Map<string, SnapshotRow>> {
  if (pmSlugs.length === 0) return new Map();
  const rows = await prisma.operatorSnapshot.findMany({
    where: { pmSlug: { in: pmSlugs }, snapshotDate: date },
    orderBy: [{ pmSlug: "asc" }],
  });
  const bySlug = new Map<string, SnapshotRow>();
  for (const row of rows) if (!bySlug.has(row.pmSlug)) bySlug.set(row.pmSlug, toSnapshotRow(row));
  return bySlug;
}

/** All distinct snapshot dates present, newest first. */
export async function fetchSnapshotDates(): Promise<Date[]> {
  const rows = await prisma.operatorSnapshot.findMany({
    distinct: ["snapshotDate"],
    orderBy: { snapshotDate: "desc" },
    select: { snapshotDate: true },
  });
  return rows.map((r) => r.snapshotDate);
}
```

- [ ] **Step 5: Run tests + tsc**

Run: `node --import tsx --test src/lib/watch-list/digest-run.test.ts && npx tsc --noEmit`
Expected: PASS (4/4), tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/watch-list/digest-run.ts src/lib/watch-list/digest-run.test.ts
git commit -m "feat(digest): snapshot-pair selection, per-list diff, recipient filtering + fetchers"
```

---

### Task 7: Orchestrator `runDigest` + cron route + unsubscribe route + cron config

**Files:**
- Modify: `src/lib/watch-list/digest-run.ts` (add `runDigest`)
- Create: `src/app/api/cron/watch-list-digest/route.ts`
- Create: `src/app/api/digest/unsubscribe/route.ts`
- Create: `vercel.json`

**Interfaces:**
- Consumes: `selectSnapshotPair`, `buildListChanges`, `filterSubscribed`, `fetchSnapshotsAt`, `fetchSnapshotDates` (Task 6); `buildDigest` (Task 4); `sendEmail` (Task 5); `signUnsubToken`/`verifyUnsubToken` (Task 3); `applyWatchList` (`@/lib/watch-list/apply`); `projectResultsForView` (`@/lib/watch-list/results-view`); `getEntitledMarketIds` (`@/lib/auth/market-entitlements.server`); `prisma`; `clerkClient` (`@clerk/nextjs/server`).
- Produces: `runDigest(opts: { mode: "send" | "dryRun"; previewEmail?: string }): Promise<DigestRunSummary>` where `interface DigestRunSummary { snapshotDate: string | null; skipped: string; recipients: number; sent: number; failed: number; dryRun: boolean }`.

**Context the implementer needs (verified signatures):**
- `applyWatchList(watchList, entitlement?)` returns `TargetListResult` with `.results` (`RankedTarget[]`, each has `.pmSlug`). `matchedPmSlugs = applied.results.map(r => r.pmSlug)`.
- `projectResultsForView({ marketResults: applied.results, operatorResults: applied.operatorResults, watchListId, totalCandidates, totalOperators, matchedCount, matchedOperatorCount, generatedAt })` returns `{ marketRows, operatorRows, summary }`. Each `marketRows` entry is a `ResultRowVM` with `.name` and `.drillTargets` (each drill target has `{ pmSlug, marketName, href }`). Build `metaBySlug` from `marketRows`: for each row, for its (single, per-market) drill target `dt`, set `metaBySlug[dt.pmSlug] = { name: row.name, marketLabel: dt.marketName, scorecardUrl: absoluteUrl(dt.href) }`.
- Orgs to process: `prisma.watchList.findMany({ where: { organizationId: { not: null } }, distinct: ["organizationId"], select: { organizationId: true } })`, then load each org via `prisma.organization.findUnique({ where: { id }, select: { id: true, clerkOrgId: true, name: true } })` and its lists via `prisma.watchList.findMany({ where: { organizationId: id } })`.
- Clerk members (NET-NEW call): `const client = await clerkClient(); const res = await client.organizations.getOrganizationMembershipList({ organizationId: clerkOrgId, limit: 100 });` — iterate `res.data`; each membership's `publicUserData` exposes `userId` and `identifier` (the email). Skip memberships without `publicUserData?.identifier`. Handle >100 by paging with `offset` until `res.data.length < 100`.
- `getEntitledMarketIds(organizationId)` returns a `MarketEntitlement` to pass straight into `applyWatchList`.
- Absolute URLs: base on `process.env.NEXT_PUBLIC_APP_URL ?? "https://iq.dwellsy.com"`. `scorecardBaseUrl` = that base; `unsubscribeUrl` = `${base}/api/digest/unsubscribe?u=${userId}&t=${signUnsubToken(userId)}`.
- `monthLabel`: format `latest` as e.g. `"June 2026"` via `latest.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })`.

- [ ] **Step 1: Implement `runDigest`** appended to `src/lib/watch-list/digest-run.ts`:

```ts
import { clerkClient } from "@clerk/nextjs/server";
import { applyWatchList } from "@/lib/watch-list/apply";
import { projectResultsForView } from "@/lib/watch-list/results-view";
import { getEntitledMarketIds } from "@/lib/auth/market-entitlements.server";
import { buildDigest, type DigestListInput } from "./digest";
import { signUnsubToken } from "./digest-unsubscribe";
import { sendEmail } from "@/lib/email/send";

export interface DigestRunSummary {
  snapshotDate: string | null;
  skipped: string; // "" when not skipped
  recipients: number;
  sent: number;
  failed: number;
  dryRun: boolean;
}

function appBase(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://iq.dwellsy.com";
}

export async function runDigest(opts: {
  mode: "send" | "dryRun";
  previewEmail?: string;
}): Promise<DigestRunSummary> {
  const dryRun = opts.mode === "dryRun";
  const dates = await fetchSnapshotDates();
  const pair = selectSnapshotPair(dates);
  if (!pair) {
    return { snapshotDate: null, skipped: "fewer than two snapshot dates", recipients: 0, sent: 0, failed: 0, dryRun };
  }
  const { latest, prior } = pair;

  // Idempotency: skip if a completed run already covered `latest` (bypass for
  // preview/dryRun so a month can be re-previewed freely).
  if (!dryRun && !opts.previewEmail) {
    const existing = await prisma.watchListDigestRun.findFirst({
      where: { snapshotDate: latest, status: "completed" },
    });
    if (existing) {
      return { snapshotDate: latest.toISOString(), skipped: "already sent for this snapshot", recipients: 0, sent: 0, failed: 0, dryRun };
    }
  }

  const run = dryRun
    ? null
    : await prisma.watchListDigestRun.create({ data: { snapshotDate: latest, status: "running" } });

  const monthLabel = latest.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const base = appBase();

  // orgs owning >=1 watch list
  const orgRows = await prisma.watchList.findMany({
    where: { organizationId: { not: null } },
    distinct: ["organizationId"],
    select: { organizationId: true },
  });

  // recipient (userId+email) -> their aggregated lists
  const perRecipient = new Map<string, { email: string; lists: DigestListInput[] }>();
  const unsubscribed = new Set(
    (await prisma.digestPreference.findMany({ where: { unsubscribed: true }, select: { userId: true } }))
      .map((p) => p.userId),
  );

  for (const { organizationId } of orgRows) {
    if (!organizationId) continue;
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, clerkOrgId: true, name: true },
    });
    if (!org?.clerkOrgId) continue;

    // members via Clerk
    const client = await clerkClient();
    const members: { userId: string; email: string }[] = [];
    let offset = 0;
    for (;;) {
      const res = await client.organizations.getOrganizationMembershipList({
        organizationId: org.clerkOrgId, limit: 100, offset,
      });
      for (const m of res.data) {
        const uid = m.publicUserData?.userId;
        const email = m.publicUserData?.identifier;
        if (uid && email) members.push({ userId: uid, email });
      }
      if (res.data.length < 100) break;
      offset += 100;
    }
    const recipients = filterSubscribed(members, unsubscribed);
    if (recipients.length === 0) continue;

    // build this org's list-changes once (shared across its members)
    const entitlement = await getEntitledMarketIds(org.id);
    const watchLists = await prisma.watchList.findMany({ where: { organizationId: org.id } });
    const orgLists: DigestListInput[] = [];
    for (const wl of watchLists) {
      const applied = await applyWatchList(
        { id: wl.id, name: wl.name, description: wl.description,
          requiredCriteria: wl.requiredCriteria, preferredCriteria: wl.preferredCriteria,
          excludedCriteria: wl.excludedCriteria },
        entitlement,
      );
      const matchedPmSlugs = applied.results.map((r) => r.pmSlug);
      if (matchedPmSlugs.length === 0) continue;

      const { marketRows } = projectResultsForView({
        marketResults: applied.results, operatorResults: applied.operatorResults,
        watchListId: wl.id, totalCandidates: applied.totalCandidates,
        totalOperators: applied.totalOperators, matchedCount: applied.matchedCount,
        matchedOperatorCount: applied.matchedOperatorCount, generatedAt: applied.generatedAt,
      });
      const metaBySlug = new Map<string, OperatorMeta>();
      for (const row of marketRows) {
        for (const dt of row.drillTargets) {
          metaBySlug.set(dt.pmSlug, {
            name: row.name, marketLabel: dt.marketName,
            scorecardUrl: dt.href.startsWith("http") ? dt.href : `${base}${dt.href}`,
          });
        }
      }
      const [latestBySlug, priorBySlug] = await Promise.all([
        fetchSnapshotsAt(matchedPmSlugs, latest),
        fetchSnapshotsAt(matchedPmSlugs, prior),
      ]);
      const listChanges = buildListChanges({
        watchListName: wl.name, matchedPmSlugs, latestBySlug, priorBySlug, metaBySlug,
      });
      if (listChanges.operators.length > 0) orgLists.push(listChanges);
    }
    if (orgLists.length === 0) continue;

    for (const r of recipients) {
      const acc = perRecipient.get(r.userId) ?? { email: r.email, lists: [] };
      acc.lists.push(...orgLists);
      perRecipient.set(r.userId, acc);
    }
  }

  // compose + send
  let sent = 0, failed = 0, recipients = 0;
  for (const [userId, { email, lists }] of perRecipient) {
    const digest = buildDigest({
      recipientFirstName: null, monthLabel, lists,
      unsubscribeUrl: `${base}/api/digest/unsubscribe?u=${encodeURIComponent(userId)}&t=${signUnsubToken(userId)}`,
      scorecardBaseUrl: base,
    });
    if (!digest) continue; // no changes for this recipient
    recipients++;

    const target = opts.previewEmail ?? email;
    if (dryRun) { sent++; continue; }

    if (run && !opts.previewEmail) {
      const already = await prisma.watchListDigestSend.findUnique({
        where: { runId_userId: { runId: run.id, userId } },
      });
      if (already) continue; // retry-safe
    }
    const result = await sendEmail({ to: target, subject: digest.subject, html: digest.html, text: digest.text });
    if (result.ok) sent++; else failed++;
    if (run && !opts.previewEmail) {
      await prisma.watchListDigestSend.create({
        data: { runId: run.id, userId, email: target, status: result.ok ? "sent" : "failed" },
      });
    }
    if (opts.previewEmail) break; // preview sends exactly one email
  }

  if (run) {
    await prisma.watchListDigestRun.update({
      where: { id: run.id }, data: { status: "completed", completedAt: new Date(), recipientCount: recipients },
    });
  }
  return { snapshotDate: latest.toISOString(), skipped: "", recipients, sent, failed, dryRun };
}
```

- [ ] **Step 2: Verify the orchestrator type-checks**

Run: `npx tsc --noEmit`
Expected: clean. If `getOrganizationMembershipList`'s `publicUserData` typing differs in the installed `@clerk/nextjs` version, adapt the field access (the shape is `{ userId, identifier }`) and note it in the report — do NOT loosen to `any` without saying so.

- [ ] **Step 3: Create the cron route** `src/app/api/cron/watch-list-digest/route.ts`:

```ts
// GET /api/cron/watch-list-digest — daily Vercel Cron entrypoint. No-ops
// unless a new OperatorSnapshot date has appeared since the last completed
// run. Gated by CRON_SECRET (Vercel Cron attaches it as a Bearer token).
// Modes: default = send; ?dryRun=1 = compose+count, send nothing, record
// nothing; ?preview=<email> = send one fully-rendered digest to <email>,
// bypassing the idempotency guard.
import { runDigest } from "@/lib/watch-list/digest-run";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const previewEmail = url.searchParams.get("preview") ?? undefined;
  try {
    const summary = await runDigest({ mode: dryRun ? "dryRun" : "send", previewEmail });
    return Response.json(summary);
  } catch (err) {
    console.error("[cron/watch-list-digest] failed:", err);
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
```

- [ ] **Step 4: Create the unsubscribe route** `src/app/api/digest/unsubscribe/route.ts`:

```ts
// GET /api/digest/unsubscribe?u=<userId>&t=<hmac> — one-click unsubscribe.
// Stateless: verifies the HMAC token (no token storage), upserts
// DigestPreference.unsubscribed = true, renders a plain confirmation page.
import { prisma } from "@/lib/prisma";
import { verifyUnsubToken } from "@/lib/watch-list/digest-unsubscribe";

export const dynamic = "force-dynamic";

function page(title: string, body: string): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
     <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:64px auto;padding:0 20px;color:#2a3547;">
       <h1 style="font-size:20px;color:#0f1f3f;">${title}</h1><p style="font-size:14px;">${body}</p></div>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("u") ?? "";
  const token = url.searchParams.get("t") ?? "";
  if (!userId || !verifyUnsubToken(userId, token)) {
    return page("Link invalid", "This unsubscribe link is invalid or has expired. Please use the link from your most recent digest email.");
  }
  await prisma.digestPreference.upsert({
    where: { userId },
    update: { unsubscribed: true },
    create: { userId, unsubscribed: true },
  });
  return page("You're unsubscribed", "You will no longer receive the Dwellsy IQ watch-list monthly digest. You can re-enable it anytime from your workspace settings.");
}
```

- [ ] **Step 5: Create `vercel.json`** at the repo root:

```json
{
  "crons": [
    { "path": "/api/cron/watch-list-digest", "schedule": "0 13 * * *" }
  ]
}
```

- [ ] **Step 6: Verify build + commit**

Run: `npx tsc --noEmit && npm run test:watch-list`
Expected: tsc clean; the full watch-list suite passes (existing + all new pure tests).

```bash
git add src/lib/watch-list/digest-run.ts src/app/api/cron/watch-list-digest/route.ts src/app/api/digest/unsubscribe/route.ts vercel.json
git commit -m "feat(digest): runDigest orchestrator + cron + unsubscribe routes + cron schedule"
```

---

## Self-Review

**1. Spec coverage:**
- Trigger = daily poller detecting a new `snapshotDate`, idempotency guard → Task 7 `runDigest` + cron route. ✓
- Reuse diff engine + `toSnapshotRow` + `applyWatchList` entitlement path → Tasks 1, 6, 7. ✓
- Audience = all org members, opt-out → Task 7 (Clerk members) + `filterSubscribed` (Task 6) + `DigestPreference` (Task 2). ✓
- One aggregated digest per user → Task 7 `perRecipient` map. ✓
- Data model (3 tables) → Task 2. ✓
- Digest content, salience ordering, operator meta from `ResultRowVM.drillTargets`, empty→skip → Tasks 4, 6, 7. ✓
- Provider = Resend behind `sendEmail` → Task 5. ✓
- Preview/dry-run bypassing idempotency → Task 7. ✓
- Unsubscribe = stateless HMAC → Task 3 + route in Task 7. ✓
- Per-recipient idempotency (`WatchListDigestSend` unique) → Tasks 2, 7. ✓
- Env vars documented → Task 5. ✓
- Brand-new-operator limitation (needs both snapshots) → enforced in `buildListChanges` (skip when `!prev`). ✓
- Testing (pure composer, snapshot pair, unsubscribe token, filtering, toSnapshotRow) → Tasks 1,3,4,6. Idempotency + entitlement scoping are exercised through `runDigest`'s structure (guard + `getEntitledMarketIds` reuse); note these are integration-level and verified via the dryRun mode manually, not a unit test — acceptable given no DB/Clerk test harness exists.

**2. Placeholder scan:** No TBD/TODO/"handle errors" — every code step is complete. The one judgment call flagged for the implementer (Clerk `publicUserData` field shape across SDK versions) names the exact expected shape and forbids silent `any`.

**3. Type consistency:** `toSnapshotRow`/`RawSnapshotRow` (Task 1) consumed in Task 6. `DigestListInput`/`DigestOperatorInput`/`DigestInput`/`DigestEmail` (Task 4) consumed in Tasks 6, 7. `OperatorMeta` defined in Task 6, used in Task 7. `selectSnapshotPair`/`buildListChanges`/`filterSubscribed`/`fetchSnapshotsAt`/`fetchSnapshotDates` (Task 6) consumed in Task 7. `sendEmail` shape (Task 5) matches the call in Task 7. `signUnsubToken`/`verifyUnsubToken` (Task 3) used in Task 7 + unsubscribe route. Prisma accessors (`digestPreference`, `watchListDigestRun`, `watchListDigestSend`) from Task 2 used in Tasks 6, 7. Consistent throughout.

**Known follow-ups (from the spec, out of scope here):** log ineligible/suppressed detail; "new operator matches your filter" signal; per-list subscription granularity.
