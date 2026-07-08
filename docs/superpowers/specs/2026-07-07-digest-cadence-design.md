# Watch-list digest — user-chosen cadence + period-window trigger — design

**Status:** Approved (brainstorm) — 2026-07-07
**Builds on:** the monthly digest shipped in PR #171 (`docs/superpowers/specs/2026-07-07-watch-list-digest-design.md`).

## Problem

The shipped digest fires **once per new global `OperatorSnapshot.snapshotDate`** (idempotency keyed on that date). That was right for monthly data. When the Dwellsy-DB integration makes data update **daily**, a new `snapshotDate` would land daily and the digest would email **daily** — for a national (all-markets) subscriber, effectively every day with only yesterday-vs-today micro-deltas. Cadence must decouple from the raw-data cadence, and different clients want different frequencies.

## Decisions (locked in brainstorm)

1. **Per-user, user-chosen cadence:** `daily | weekly | monthly`, default **monthly**. Extends the existing per-user `DigestPreference` (matches the per-user opt-out model).
2. **Cadence is an upper bound, not a schedule:** an email is sent only when there is genuinely new data since the user was last notified — a faster cadence never produces empty or duplicate emails.
3. **Diff window = "since you were last notified"** (not a fixed period-back date), so every email shows exactly what changed since that user's previous digest — no gaps, no overlaps.
4. **New `/settings/notifications` page** for the user to set on/off + cadence (also the first in-app way to re-subscribe after the email unsubscribe link).

## Preference model

Add three columns to the existing `DigestPreference` (per-user):

```prisma
model DigestPreference {
  id                       String    @id @default(cuid())
  userId                   String    @unique
  unsubscribed             Boolean   @default(false)
  cadence                  String    @default("monthly")   // "daily" | "weekly" | "monthly"
  lastNotifiedSnapshotDate DateTime?                       // snapshot the user was last diffed THROUGH
  lastDigestAt             DateTime?                       // wall-clock of last send (throttle)
  updatedAt                DateTime  @updatedAt
}
```

An **absent** row = subscribed + monthly + never-notified (so existing users are unchanged). All new columns are nullable/defaulted → additive migration, no backfill.

## Trigger redesign

The daily Vercel Cron keeps running. The global `WatchListDigestRun` "skip if a completed run exists for `latest`" guard is **removed** (incompatible with per-user cadence) and replaced by per-recipient gating. `WatchListDigestRun`/`WatchListDigestSend` remain for observability + within-run retry-safety (the `@@unique([runId, userId])` guard).

**Per-recipient send condition** — send iff ALL hold:
- not `unsubscribed`, and
- **new data:** `latest > (lastNotifiedSnapshotDate ?? −∞)` where `latest = max(OperatorSnapshot.snapshotDate)`, and
- **throttle:** `lastDigestAt == null` OR `daysBetween(lastDigestAt, now) >= periodDays(cadence)` where `periodDays = { daily: 1, weekly: 7, monthly: 28 }`, and
- the composed digest is non-empty (`buildDigest` returns non-null).

**Diff window:** `prior = lastNotifiedSnapshotDate ?? <previous distinct snapshotDate before latest>`. Diff `latest` vs `prior` per matched operator (reusing `diffSnapshots`). For a brand-new subscriber (no `lastNotifiedSnapshotDate`), `prior` is the second-most-recent distinct snapshot date (today's behavior).

**On successful send:** set `lastNotifiedSnapshotDate = latest`, `lastDigestAt = now`.

### Pure gate helper (server-only-free, unit-tested)

Lives in `digest-gather.ts`:

```
type Cadence = "daily" | "weekly" | "monthly";
const PERIOD_DAYS: Record<Cadence, number> = { daily: 1, weekly: 7, monthly: 28 };

isDigestDue(args: {
  unsubscribed: boolean;
  cadence: Cadence;
  latest: Date;
  lastNotifiedSnapshotDate: Date | null;
  lastDigestAt: Date | null;
  now: Date;
}): boolean
```
Returns true when subscribed AND `latest > lastNotifiedSnapshotDate` AND throttle elapsed. (The non-empty-digest check stays in the orchestrator, since it needs the composed content.)

`selectPriorForRecipient(latest, lastNotifiedSnapshotDate, distinctDates): Date | null` — pure prior-selection.

### Behavior (why it's correct)

| cadence | Monthly data (today) | Daily data (integration) |
|---|---|---|
| monthly | 1 / month | 1 / month |
| weekly | ~1 / month* | 1 / week, each covering a week of change |
| daily | ~1 / month* | up to 1 / day |

\* the "new data" gate: with monthly data there is nothing new between months, so a daily/weekly subscriber still gets ~monthly and is never emailed with zero changes.

### Snapshot fetching

`latest` snapshots are fetched once per watch list (shared). `prior` is per-recipient (their `lastNotifiedSnapshotDate`), but in practice due recipients cluster on a few distinct prior dates — fetch `prior` snapshots grouped by the distinct `lastNotifiedSnapshotDate` values among due recipients (typically 1–2 fetches), not one per recipient.

## `/settings/notifications` page

- Route `src/app/settings/notifications/page.tsx` (server component): reads the caller's `DigestPreference` (via `auth()` userId) and renders an **Email digest** section:
  - Subscribe toggle (on = `unsubscribed:false`).
  - Cadence selector — Daily / Weekly / Monthly radio (disabled/greyed when unsubscribed).
- A server action `updateDigestPreference({ subscribed, cadence })` upserts the row for the current userId. Validates `cadence ∈ {daily,weekly,monthly}`.
- Linked from the user menu / site header (a "Notification settings" entry).
- Copy notes that cadence is a maximum — you're only emailed when watched operators change.

## Testing

- **`isDigestDue`** matrix: unsubscribed → false; new-data gate (latest ≤ lastNotified → false); throttle per cadence (elapsed < period → false, ≥ period → true); null watermarks → due.
- **`selectPriorForRecipient`**: returns `lastNotifiedSnapshotDate` when set; falls back to the second-most-recent distinct date when null; handles < 2 dates.
- **Server action**: rejects invalid cadence; upserts subscribed/cadence correctly.
- **`runDigest`**: per-recipient gating replaces the global guard (exercised structurally + via `?dryRun=1`).

## Out of scope

- Per-watch-list cadence (cadence is per-user, spanning all their org's lists).
- Time-of-day / timezone-aware send windows (the daily cron time governs).
- Digest history / in-app notification center.
- Backfilling `lastNotifiedSnapshotDate` for existing users (absent = treated as never-notified; first post-deploy run diffs against the previous distinct snapshot, same as today).
