# Digest Cadence + Period-Window Trigger — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the watch-list digest a per-user cadence (daily/weekly/monthly) and a "since you were last notified" diff window, so it decouples from the raw-data cadence and never over-emails.

**Architecture:** Extend the per-user `DigestPreference` with `cadence` + two watermarks (`lastNotifiedSnapshotDate`, `lastDigestAt`). Replace `runDigest`'s global "once per snapshot" guard with per-recipient gating (subscribed + new-data + throttle) and a per-recipient prior-snapshot diff window. Add a `/settings/notifications` page + server action for the user to set on/off + cadence. Pure gate logic lives in `digest-gather.ts` (unit-tested); `runDigest` orchestrates.

**Tech Stack:** TypeScript, Next.js 16 App Router, Prisma+Postgres (Neon), Clerk, node:test + tsx.

**Spec:** `docs/superpowers/specs/2026-07-07-digest-cadence-design.md`

## Global Constraints

- Never run `prisma db seed`; never read `.env*`. Migrations authored DB-free: `git show HEAD:prisma/schema.prisma > <scratch>/schema_old.prisma` then `npx prisma migrate diff --from-schema-datamodel <scratch>/schema_old.prisma --to-schema-datamodel prisma/schema.prisma --script > migration.sql`. Do NOT use `--from-migrations` (needs a shadow DB) or `prisma migrate dev`.
- Cadence values are exactly `"daily" | "weekly" | "monthly"`; default `"monthly"`. `PERIOD_DAYS = { daily: 1, weekly: 7, monthly: 28 }`.
- Cadence is an **upper bound**: send only when `latest > lastNotifiedSnapshotDate` (new data) AND throttle elapsed AND the digest is non-empty. Never send empty or duplicate emails.
- Diff window `prior = lastNotifiedSnapshotDate ?? <second-most-recent distinct snapshotDate>`.
- Tests: `node --import tsx --test <file>` / `npm run test:watch-list`. Test files use STATIC imports (no top-level `await import` — the runner rejects it). New pure tests go in `src/lib/watch-list/`.
- Pure gate helpers live in `digest-gather.ts` (no `server-only`/Prisma/Clerk imports — keeps them testable). `runDigest` (impure) lives in `digest-run.ts`.
- `npx tsc --noEmit` before every commit. Work on branch `feat/digest-cadence` (already checked out; spec committed there).

## File Structure

- `prisma/schema.prisma` (modify) + `prisma/migrations/20260707120000_digest_cadence/migration.sql` (create) — 3 new `DigestPreference` columns.
- `src/lib/watch-list/digest-gather.ts` (modify) — add `Cadence`, `PERIOD_DAYS`, `parseCadence`, `isDigestDue`, `selectPriorForRecipient`.
- `src/lib/watch-list/digest-gather.test.ts` (modify) — tests for the new pure helpers.
- `src/lib/watch-list/digest-run.ts` (modify) — rewire `runDigest` to per-recipient gating; extract `listOrgMembers`; add a preview path.
- `src/app/settings/notifications/page.tsx` (create) — settings page (server component).
- `src/app/settings/notifications/actions.ts` (create) — `updateDigestPreference` server action.
- `src/components/layout/SiteHeader.tsx` (modify) — add a "Notification settings" link to the `<UserButton>` menu.

---

### Task 1: Schema — cadence + watermarks on `DigestPreference`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260707120000_digest_cadence/migration.sql`

**Interfaces:**
- Produces: `DigestPreference.cadence: String` (default `"monthly"`), `.lastNotifiedSnapshotDate: DateTime?`, `.lastDigestAt: DateTime?` on the generated client.

- [ ] **Step 1: Edit the model** in `prisma/schema.prisma` — replace the existing `DigestPreference` block with:

```prisma
model DigestPreference {
  id                       String    @id @default(cuid())
  userId                   String    @unique
  unsubscribed             Boolean   @default(false)
  cadence                  String    @default("monthly")
  lastNotifiedSnapshotDate DateTime?
  lastDigestAt             DateTime?
  updatedAt                DateTime  @updatedAt
}
```

- [ ] **Step 2: Validate + generate (DB-free)**

Run: `npx prisma validate && npx prisma generate`
Expected: schema valid; client regenerates.

- [ ] **Step 3: Author the migration DB-free**

```bash
SCRATCH="$(git rev-parse --show-toplevel)/.migration-tmp"; mkdir -p "$SCRATCH"
git show HEAD:prisma/schema.prisma > "$SCRATCH/schema_old.prisma"
mkdir -p prisma/migrations/20260707120000_digest_cadence
npx prisma migrate diff \
  --from-schema-datamodel "$SCRATCH/schema_old.prisma" \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/20260707120000_digest_cadence/migration.sql
rm -rf "$SCRATCH"
```
Open `migration.sql` and confirm it is **additive-only**: `ALTER TABLE "DigestPreference" ADD COLUMN` for `cadence` (default `'monthly'`), `lastNotifiedSnapshotDate`, `lastDigestAt` — no `DROP`, no other table touched. If it demands a DB connection, STOP and report BLOCKED (do not point it at Neon).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260707120000_digest_cadence/migration.sql
git commit -m "feat(digest): cadence + watermark columns on DigestPreference"
```

---

### Task 2: Pure cadence gate helpers

**Files:**
- Modify: `src/lib/watch-list/digest-gather.ts`
- Test: `src/lib/watch-list/digest-gather.test.ts`

**Interfaces:**
- Produces:
  - `type Cadence = "daily" | "weekly" | "monthly"`
  - `const PERIOD_DAYS: Record<Cadence, number>` = `{ daily: 1, weekly: 7, monthly: 28 }`
  - `parseCadence(v: unknown): Cadence | null`
  - `isDigestDue(args: { unsubscribed: boolean; cadence: Cadence; latest: Date; lastNotifiedSnapshotDate: Date | null; lastDigestAt: Date | null; now: Date }): boolean`
  - `selectPriorForRecipient(latest: Date, lastNotifiedSnapshotDate: Date | null, distinctDatesDesc: Date[]): Date | null`

- [ ] **Step 1: Write the failing tests** — append to `src/lib/watch-list/digest-gather.test.ts`:

```ts
import { isDigestDue, selectPriorForRecipient, parseCadence } from "./digest-gather";

const LATEST = new Date("2026-07-31");
function due(over: Partial<Parameters<typeof isDigestDue>[0]> = {}) {
  return isDigestDue({
    unsubscribed: false, cadence: "monthly", latest: LATEST,
    lastNotifiedSnapshotDate: new Date("2026-06-30"),
    lastDigestAt: new Date("2026-06-30"), now: new Date("2026-07-31"), ...over,
  });
}

test("parseCadence accepts the three values, rejects others", () => {
  assert.equal(parseCadence("daily"), "daily");
  assert.equal(parseCadence("weekly"), "weekly");
  assert.equal(parseCadence("monthly"), "monthly");
  assert.equal(parseCadence("yearly"), null);
  assert.equal(parseCadence(3), null);
});

test("isDigestDue false when unsubscribed", () => {
  assert.equal(due({ unsubscribed: true }), false);
});

test("isDigestDue false when no new data (latest <= lastNotified)", () => {
  assert.equal(due({ lastNotifiedSnapshotDate: LATEST }), false);
  assert.equal(due({ lastNotifiedSnapshotDate: new Date("2026-08-31") }), false);
});

test("isDigestDue respects the throttle per cadence", () => {
  // monthly: 28d. lastDigestAt 20 days before now -> not due; 30 days -> due.
  assert.equal(due({ cadence: "monthly", lastDigestAt: new Date("2026-07-11"), now: new Date("2026-07-31") }), false);
  assert.equal(due({ cadence: "monthly", lastDigestAt: new Date("2026-07-01"), now: new Date("2026-07-31") }), true);
  // weekly: 7d. 5 days -> not due; 8 days -> due.
  assert.equal(due({ cadence: "weekly", lastDigestAt: new Date("2026-07-26"), now: new Date("2026-07-31") }), false);
  assert.equal(due({ cadence: "weekly", lastDigestAt: new Date("2026-07-23"), now: new Date("2026-07-31") }), true);
});

test("isDigestDue: null watermarks => due (first-ever, subscribed, new data present)", () => {
  assert.equal(due({ lastNotifiedSnapshotDate: null, lastDigestAt: null }), true);
});

test("selectPriorForRecipient returns lastNotified when set", () => {
  const prior = selectPriorForRecipient(LATEST, new Date("2026-05-31"),
    [LATEST, new Date("2026-06-30"), new Date("2026-05-31")]);
  assert.deepEqual(prior, new Date("2026-05-31"));
});

test("selectPriorForRecipient falls back to 2nd-most-recent distinct date when lastNotified null", () => {
  const prior = selectPriorForRecipient(LATEST, null,
    [LATEST, new Date("2026-06-30"), new Date("2026-05-31")]);
  assert.deepEqual(prior, new Date("2026-06-30"));
});

test("selectPriorForRecipient returns null when only one distinct date and no lastNotified", () => {
  assert.equal(selectPriorForRecipient(LATEST, null, [LATEST]), null);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --import tsx --test src/lib/watch-list/digest-gather.test.ts`
Expected: FAIL — `isDigestDue`/`selectPriorForRecipient`/`parseCadence` not exported.

- [ ] **Step 3: Implement** — append to `src/lib/watch-list/digest-gather.ts`:

```ts
export type Cadence = "daily" | "weekly" | "monthly";
export const PERIOD_DAYS: Record<Cadence, number> = { daily: 1, weekly: 7, monthly: 28 };

export function parseCadence(v: unknown): Cadence | null {
  return v === "daily" || v === "weekly" || v === "monthly" ? v : null;
}

const DAY_MS = 86_400_000;

export function isDigestDue(args: {
  unsubscribed: boolean;
  cadence: Cadence;
  latest: Date;
  lastNotifiedSnapshotDate: Date | null;
  lastDigestAt: Date | null;
  now: Date;
}): boolean {
  if (args.unsubscribed) return false;
  // new data since last notified
  if (args.lastNotifiedSnapshotDate && args.latest.getTime() <= args.lastNotifiedSnapshotDate.getTime()) {
    return false;
  }
  // frequency throttle
  if (args.lastDigestAt) {
    const elapsedDays = (args.now.getTime() - args.lastDigestAt.getTime()) / DAY_MS;
    if (elapsedDays < PERIOD_DAYS[args.cadence]) return false;
  }
  return true;
}

export function selectPriorForRecipient(
  latest: Date,
  lastNotifiedSnapshotDate: Date | null,
  distinctDatesDesc: Date[],
): Date | null {
  if (lastNotifiedSnapshotDate) return lastNotifiedSnapshotDate;
  // fall back to the second-most-recent distinct snapshot date (before latest)
  const earlier = distinctDatesDesc.filter((d) => d.getTime() < latest.getTime());
  return earlier.length > 0 ? earlier[0] : null;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --import tsx --test src/lib/watch-list/digest-gather.test.ts`
Expected: PASS (existing gather tests + 8 new).

- [ ] **Step 5: tsc + commit**

```bash
npx tsc --noEmit
git add src/lib/watch-list/digest-gather.ts src/lib/watch-list/digest-gather.test.ts
git commit -m "feat(digest): pure cadence gate helpers (isDigestDue, selectPrior, parseCadence)"
```

---

### Task 3: Rewire `runDigest` to per-recipient cadence gating

**Files:**
- Modify: `src/lib/watch-list/digest-run.ts`

**Interfaces:**
- Consumes: `isDigestDue`, `selectPriorForRecipient`, `type Cadence` (Task 2); existing `buildListChanges`, `fetchSnapshotsAt`, `fetchSnapshotDates`, `buildDigest`, `sendEmail`, `signUnsubToken`, `listWatchListes`, `applyWatchList`, `projectResultsForView`, `getEntitledMarketIds`.
- Produces: unchanged `runDigest(opts): Promise<DigestRunSummary>` signature.

**Context:** The current `runDigest` (a) has a global "skip if a completed run exists for `latest`" guard, (b) builds each org's list-changes ONCE against a single global prior, (c) filters recipients only by `unsubscribed`. The rewire: remove the global guard; gate each recipient with `isDigestDue`; give each due recipient a diff window against THEIR `selectPriorForRecipient`; on a successful send, stamp their `DigestPreference` watermarks. Org watch-list evaluation (applyWatchList/projectResultsForView) stays once-per-org (prior-independent); only the prior-snapshot fetch is grouped by the distinct prior dates among due recipients.

- [ ] **Step 1: Extract the Clerk member enumeration** into a helper (top of `digest-run.ts`, after imports). Replace the inline paging loop in `runDigest` with a call to this:

```ts
async function listOrgMembers(clerkOrgId: string): Promise<{ userId: string; email: string }[]> {
  const client = await clerkClient();
  const out: { userId: string; email: string }[] = [];
  let offset = 0;
  for (;;) {
    const res = await client.organizations.getOrganizationMembershipList({
      organizationId: clerkOrgId, limit: 100, offset,
    });
    for (const m of res.data) {
      const uid = m.publicUserData?.userId;
      const email = m.publicUserData?.identifier;
      if (uid && email) out.push({ userId: uid, email });
    }
    if (res.data.length < 100) break;
    offset += 100;
  }
  return out;
}
```

- [ ] **Step 2: Update imports** at the top of `digest-run.ts` — add `isDigestDue`, `selectPriorForRecipient`, `type Cadence` to the existing `./digest-gather` import:

```ts
import {
  selectSnapshotPair, buildListChanges, filterSubscribed, type OperatorMeta,
  isDigestDue, selectPriorForRecipient, type Cadence,
} from "./digest-gather";
```
(`selectSnapshotPair` and `filterSubscribed` may become unused after the rewire — remove them from the import if so; tsc will flag unused. `SnapshotRow` type stays.)

- [ ] **Step 3: Replace the body of `runDigest`** (from `const dryRun = …` through the final `return`) with:

```ts
  const dryRun = opts.mode === "dryRun";
  const now = new Date();
  const distinctDates = await fetchSnapshotDates(); // newest-first
  if (distinctDates.length === 0) {
    return { snapshotDate: null, skipped: "no snapshots", recipients: 0, sent: 0, failed: 0, dryRun };
  }
  const latest = distinctDates[0];

  // Preview: compose one digest against a generic window and send only to the
  // preview address, bypassing all gating + bookkeeping.
  if (opts.previewEmail) {
    return runPreview(opts.previewEmail, latest, distinctDates, now);
  }

  const run = dryRun
    ? null
    : ((await prisma.watchListDigestRun.findFirst({
        where: { snapshotDate: latest, status: { not: "completed" } },
        orderBy: { startedAt: "desc" },
      })) ??
      (await prisma.watchListDigestRun.create({ data: { snapshotDate: latest, status: "running" } })));

  const monthLabel = latest.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const base = appBase();

  const prefByUser = new Map(
    (await prisma.digestPreference.findMany()).map((p) => [p.userId, p]),
  );

  const orgRows = await prisma.watchList.findMany({
    where: { organizationId: { not: null } },
    distinct: ["organizationId"],
    select: { organizationId: true },
  });

  let sent = 0, failed = 0, recipients = 0;

  for (const { organizationId } of orgRows) {
    if (!organizationId) continue;
    const org = await prisma.organization.findUnique({
      where: { id: organizationId }, select: { id: true, clerkOrgId: true },
    });
    if (!org?.clerkOrgId) continue;

    const members = await listOrgMembers(org.clerkOrgId);
    const dueMembers = members.filter((m) => {
      const p = prefByUser.get(m.userId);
      return isDigestDue({
        unsubscribed: p?.unsubscribed ?? false,
        cadence: (p?.cadence as Cadence) ?? "monthly",
        latest,
        lastNotifiedSnapshotDate: p?.lastNotifiedSnapshotDate ?? null,
        lastDigestAt: p?.lastDigestAt ?? null,
        now,
      });
    });
    if (dueMembers.length === 0) continue;

    // Evaluate the org's watch lists once (prior-independent).
    const ctx = await buildOrgListContext(org.id, base);
    if (ctx.lists.length === 0) continue;
    const latestBySlug = await fetchSnapshotsAt(ctx.allSlugs, latest);

    // Prior-snapshot fetch grouped by the distinct prior dates among due members.
    const priorForUser = new Map<string, Date | null>();
    const priorByDate = new Map<number, Map<string, SnapshotRow>>();
    for (const m of dueMembers) {
      const p = prefByUser.get(m.userId);
      const prior = selectPriorForRecipient(latest, p?.lastNotifiedSnapshotDate ?? null, distinctDates);
      priorForUser.set(m.userId, prior);
      if (prior && !priorByDate.has(prior.getTime())) {
        priorByDate.set(prior.getTime(), await fetchSnapshotsAt(ctx.allSlugs, prior));
      }
    }

    for (const m of dueMembers) {
      const prior = priorForUser.get(m.userId) ?? null;
      const priorBySlug = prior ? (priorByDate.get(prior.getTime()) ?? new Map()) : new Map();
      const lists = ctx.lists
        .map((c) => buildListChanges({
          watchListName: c.name, matchedPmSlugs: c.matchedPmSlugs,
          latestBySlug, priorBySlug, metaBySlug: c.metaBySlug,
        }))
        .filter((l) => l.operators.length > 0);
      const digest = buildDigest({
        recipientFirstName: null, monthLabel, lists,
        unsubscribeUrl: `${base}/api/digest/unsubscribe?u=${encodeURIComponent(m.userId)}&t=${signUnsubToken(m.userId)}`,
        scorecardBaseUrl: base,
      });
      if (!digest) continue;
      recipients++;
      if (dryRun) { sent++; continue; }
      if (run) {
        const already = await prisma.watchListDigestSend.findUnique({
          where: { runId_userId: { runId: run.id, userId: m.userId } },
        });
        if (already) continue;
      }
      const result = await sendEmail({ to: m.email, subject: digest.subject, html: digest.html, text: digest.text });
      if (result.ok) sent++; else failed++;
      if (run) {
        await prisma.watchListDigestSend.create({
          data: { runId: run.id, userId: m.userId, email: m.email, status: result.ok ? "sent" : "failed" },
        });
        if (result.ok) {
          await prisma.digestPreference.upsert({
            where: { userId: m.userId },
            update: { lastNotifiedSnapshotDate: latest, lastDigestAt: now },
            create: { userId: m.userId, lastNotifiedSnapshotDate: latest, lastDigestAt: now },
          });
        }
      }
    }
  }

  if (run) {
    await prisma.watchListDigestRun.update({
      where: { id: run.id }, data: { status: "completed", completedAt: new Date(), recipientCount: recipients },
    });
  }
  return { snapshotDate: latest.toISOString(), skipped: "", recipients, sent, failed, dryRun };
```

- [ ] **Step 4: Add the two helpers** used above, after `runDigest` in `digest-run.ts`:

```ts
interface OrgListContext {
  lists: { name: string; matchedPmSlugs: string[]; metaBySlug: Map<string, OperatorMeta> }[];
  allSlugs: string[];
}

async function buildOrgListContext(orgId: string, base: string): Promise<OrgListContext> {
  const entitlement = await getEntitledMarketIds(orgId);
  const watchLists = await listWatchListes(orgId);
  const lists: OrgListContext["lists"] = [];
  const allSlugs = new Set<string>();
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
    matchedPmSlugs.forEach((s) => allSlugs.add(s));
    lists.push({ name: wl.name, matchedPmSlugs, metaBySlug });
  }
  return { lists, allSlugs: [...allSlugs] };
}

async function runPreview(
  previewEmail: string, latest: Date, distinctDates: Date[], _now: Date,
): Promise<DigestRunSummary> {
  const base = appBase();
  const monthLabel = latest.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const prior = selectPriorForRecipient(latest, null, distinctDates); // generic 2nd-most-recent window
  const orgRows = await prisma.watchList.findMany({
    where: { organizationId: { not: null } }, distinct: ["organizationId"], select: { organizationId: true },
  });
  for (const { organizationId } of orgRows) {
    if (!organizationId) continue;
    const ctx = await buildOrgListContext(organizationId, base);
    if (ctx.lists.length === 0) continue;
    const latestBySlug = await fetchSnapshotsAt(ctx.allSlugs, latest);
    const priorBySlug = prior ? await fetchSnapshotsAt(ctx.allSlugs, prior) : new Map();
    const lists = ctx.lists
      .map((c) => buildListChanges({ watchListName: c.name, matchedPmSlugs: c.matchedPmSlugs, latestBySlug, priorBySlug, metaBySlug: c.metaBySlug }))
      .filter((l) => l.operators.length > 0);
    const digest = buildDigest({
      recipientFirstName: null, monthLabel, lists,
      unsubscribeUrl: `${base}/api/digest/unsubscribe?u=preview&t=preview`,
      scorecardBaseUrl: base,
    });
    if (!digest) continue; // this org had no changes; try the next
    const result = await sendEmail({ to: previewEmail, subject: `[preview] ${digest.subject}`, html: digest.html, text: digest.text });
    return { snapshotDate: latest.toISOString(), skipped: "preview", recipients: 1, sent: result.ok ? 1 : 0, failed: result.ok ? 0 : 1, dryRun: false };
  }
  return { snapshotDate: latest.toISOString(), skipped: "preview: no org had changes", recipients: 0, sent: 0, failed: 0, dryRun: false };
}
```

- [ ] **Step 5: Verify** — the pure gate is already unit-tested (Task 2). Confirm the orchestrator type-checks and the suite is green:

Run: `npx tsc --noEmit && npm run test:watch-list`
Expected: tsc clean; full suite passes. If `selectSnapshotPair`/`filterSubscribed` are now unused, remove them from the import (and, if nothing else references them, from `digest-gather.ts` + their tests — but ONLY if truly unused; `filterSubscribed` may still be referenced by its test, in which case leave it).

- [ ] **Step 6: Commit**

```bash
git add src/lib/watch-list/digest-run.ts src/lib/watch-list/digest-gather.ts src/lib/watch-list/digest-gather.test.ts
git commit -m "feat(digest): per-recipient cadence gating + since-last-notified diff window"
```

---

### Task 4: `/settings/notifications` page + server action + header link

**Files:**
- Create: `src/app/settings/notifications/page.tsx`
- Create: `src/app/settings/notifications/actions.ts`
- Modify: `src/components/layout/SiteHeader.tsx`

**Interfaces:**
- Consumes: `parseCadence` (Task 2), `prisma`, Clerk `auth()`.
- Produces: `updateDigestPreference(formData: FormData): Promise<void>` server action.

- [ ] **Step 1: Server action** — create `src/app/settings/notifications/actions.ts`:

```ts
"use server";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { parseCadence } from "@/lib/watch-list/digest-gather";

export async function updateDigestPreference(formData: FormData): Promise<void> {
  const { userId } = await auth();
  if (!userId) return;
  const subscribed = formData.get("subscribed") === "on";
  const cadence = parseCadence(formData.get("cadence")) ?? "monthly";
  await prisma.digestPreference.upsert({
    where: { userId },
    update: { unsubscribed: !subscribed, cadence },
    create: { userId, unsubscribed: !subscribed, cadence },
  });
  revalidatePath("/settings/notifications");
}
```

- [ ] **Step 2: Settings page** — create `src/app/settings/notifications/page.tsx`:

```tsx
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateDigestPreference } from "./actions";

export const dynamic = "force-dynamic";

export default async function NotificationSettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");
  const pref = await prisma.digestPreference.findUnique({ where: { userId } });
  const subscribed = !(pref?.unsubscribed ?? false);
  const cadence = pref?.cadence ?? "monthly";

  return (
    <div className="mx-auto max-w-[640px] px-6 py-10 sm:px-10">
      <h1 className="text-xl font-semibold text-navy">Notification settings</h1>
      <form action={updateDigestPreference} className="mt-6 space-y-6">
        <section className="rounded-lg border border-grid p-5">
          <h2 className="text-sm font-semibold text-navy">Watch-list email digest</h2>
          <p className="mt-1 text-sm text-slate-600">
            A summary of how your watched operators changed. Cadence is a maximum —
            you&apos;re only emailed when something actually changes.
          </p>
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input type="checkbox" name="subscribed" defaultChecked={subscribed} />
            Email me the digest
          </label>
          <fieldset className="mt-4">
            <legend className="text-sm font-medium text-navy">Frequency</legend>
            {(["daily", "weekly", "monthly"] as const).map((c) => (
              <label key={c} className="mt-1 flex items-center gap-2 text-sm capitalize">
                <input type="radio" name="cadence" value={c} defaultChecked={cadence === c} />
                {c}
              </label>
            ))}
          </fieldset>
        </section>
        <button type="submit" className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white">
          Save
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Header link** — in `src/components/layout/SiteHeader.tsx`, find the signed-in `<UserButton ... />` usage and give it a custom menu link. Replace the self-closing `<UserButton .../>` with:

```tsx
<UserButton>
  <UserButton.MenuItems>
    <UserButton.Link
      label="Notification settings"
      labelIcon={<span aria-hidden style={{ fontSize: 14 }}>🔔</span>}
      href="/settings/notifications"
    />
  </UserButton.MenuItems>
</UserButton>
```
Preserve any existing props already on `<UserButton>` (e.g. `afterSignOutUrl`, `appearance`). If `UserButton` is imported but the file is a server component, this composition is still valid — `UserButton.MenuItems`/`UserButton.Link` are Clerk's supported RSC-safe children.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run test:watch-list`
Expected: tsc clean; suite green (no new unit tests here — `parseCadence` is covered in Task 2; the action + page are server-only and validated by tsc). Manually confirm the page renders the form and the action's `parseCadence` guard rejects a bad value (falls back to monthly).

- [ ] **Step 5: Commit**

```bash
git add src/app/settings/notifications/page.tsx src/app/settings/notifications/actions.ts src/components/layout/SiteHeader.tsx
git commit -m "feat(digest): /settings/notifications page + cadence server action + header link"
```

---

## Self-Review

**1. Spec coverage:**
- Per-user cadence + default monthly → Task 1 (schema) + Task 4 (UI/action). ✓
- Cadence upper-bound (new-data + throttle gates) → Task 2 `isDigestDue` + Task 3 wiring. ✓
- Diff-since-last-notified window → Task 2 `selectPriorForRecipient` + Task 3 per-recipient prior. ✓
- Remove global run guard, keep run/send logs → Task 3. ✓
- `/settings/notifications` on/off + cadence + re-subscribe → Task 4. ✓
- Additive migration, no backfill → Task 1. ✓
- Pure gate in server-only-free `digest-gather.ts` → Tasks 2/3. ✓
- Grouped prior fetch (not per-recipient) → Task 3 `priorByDate`. ✓

**2. Placeholder scan:** No TBD/TODO; every code step is complete. The only judgment call flagged (removing now-unused `selectSnapshotPair`/`filterSubscribed`) names the exact condition and the safe default (leave if referenced).

**3. Type consistency:** `Cadence`/`PERIOD_DAYS`/`parseCadence`/`isDigestDue`/`selectPriorForRecipient` (Task 2) are consumed with matching signatures in Tasks 3 (runDigest) and 4 (action). `OperatorMeta` reused in `buildOrgListContext`. `DigestRunSummary` return shape unchanged. Prisma `digestPreference` accessor + the 3 new columns (Task 1) used in Tasks 3 (upsert watermarks) and 4 (read/upsert). `runDigest`/`buildDigest`/`buildListChanges`/`fetchSnapshotsAt` signatures unchanged.
