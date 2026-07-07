# Watch-list change-alerts digest — design

**Status:** Approved (brainstorm) — 2026-07-07
**Feature:** Monthly email digest that notifies watch-list users when a watched operator's scorecard shifts. Third sibling of the watch-list feature set (CSV export and operator trajectory already shipped).

## Problem

Watch-list users only learn that a watched operator moved (star tier, portfolio, market footprint, concessions, eligibility) if they visit the app — the in-app `/changes` page + `ChangesBanner` surface the diff on page view. There is no **push** channel, so month-over-month intelligence goes unseen unless a user happens to log in. We want a monthly email digest that delivers "what moved in your watched operators" without requiring a visit.

## Key facts that shape the design

- **The diff engine already exists and is reused unchanged.** `src/lib/watch-list/change-detection.ts` — `diffSnapshots(prior, current): OperatorChange[]` and `summariseChanges(...): ChangeBreakdown` — already define what "the scorecard shifted" means: `star`, `portfolio_band`, `portfolio_size` (≥20%), `market_added`/`market_dropped`, `submarket_added`/`submarket_dropped`, `concession_transition`, `concession_shift` (≥5pp), `eligibility_flip`. The digest is a new **delivery path** for these diffs, not new diff logic.
- **Data changes monthly.** `OperatorSnapshot` rows are stamped at seed time with `snapshotDate = dataAsOf` (monthly cadence). There is nothing new to report between monthly seeds — so the digest is **event-driven on new data**, not a fixed weekly clock.
- **Watch lists are saved filters, org-scoped.** A `WatchList` is criteria (required/preferred/excluded), not a fixed operator roster; membership is derived at read time via `applyWatchList`. Authorization key is `WatchList.organizationId`. Members of an org share its lists.
- **Neither email nor scheduling infrastructure exists.** No email provider anywhere (the app's own `src/app/api/claims/route.ts` has a `TODO: wire to email delivery (Resend/SendGrid)`); no cron/queue/scheduler. Both are built from zero here.

## Decisions (locked in brainstorm)

1. **Trigger:** event-driven on new monthly data. Implemented as a **daily poller** (not a seed hook), so it detects *data* and survives the planned hand-off rewire of the ingestion side.
2. **Audience:** all members of any org that owns ≥1 watch list, **opt-out** (one-click unsubscribe). One aggregated digest per user.
3. **Architecture:** Vercel Cron → protected API route, reusing the diff engine, sending via Resend, with a **preview/dry-run mode**.

## Architecture

Three cleanly separated units:

- **Pure composer** — `src/lib/watch-list/digest.ts`. `buildDigest(input): DigestEmail | null`. No I/O. Returns `null` when there are zero changes for the recipient (→ skip send). Testable in isolation.
- **Provider wrapper** — `src/lib/email/send.ts`. `sendEmail({ to, subject, html, text }): Promise<SendResult>`. Thin Resend adapter; the only file that imports the `resend` SDK, so the provider is swappable.
- **Impure orchestration** — `src/app/api/cron/watch-list-digest/route.ts` (GET). Auth, data gathering, idempotency, fan-out, recording. Also serves preview/dry-run.

Supporting shared helper: extract the current inline `OperatorSnapshot → SnapshotRow` mapping from `src/lib/watch-list/changes.ts` into an exported helper (e.g. `toSnapshotRow(row)`), and have both `changes.ts` and the digest path use it, so page and email build `SnapshotRow` identically.

### Data flow (one run)

```
cron (daily) → GET /api/cron/watch-list-digest  (Authorization: Bearer CRON_SECRET)
  1. latest = max(OperatorSnapshot.snapshotDate); prior = second-most-recent distinct snapshotDate
  2. if a completed WatchListDigestRun exists for `latest` → 200 no-op   (idempotency guard)
     (preview/dryRun modes bypass this guard)
  3. create WatchListDigestRun(snapshotDate=latest, status="running")
  4. orgs = distinct WatchList.organizationId (non-null) with ≥1 list
  5. for each org:
       members = Clerk org memberships → emails; drop DigestPreference.unsubscribed
       for each of the org's watch lists:
         matchedPmSlugs = applyWatchList(list, <entitlement-scoped operator set for this org>)
         snapshots = OperatorSnapshot rows for matchedPmSlugs at {latest, prior}
         changesByOperator = diffSnapshots(prior→current) per slug (skip slugs w/o both snapshots)
       aggregate per recipient across the org's lists
  6. for each recipient with ≥1 change:
       email = buildDigest(...)               // null if no changes → skip
       if already in WatchListDigestSend(runId, userId) → skip (retry-safe)
       sendEmail(...); record WatchListDigestSend
  7. mark run completed, recipientCount
```

Entitlement scoping (step 5): the digest MUST evaluate watch lists through the same market-entitlement-scoped operator set that `/results` uses, so an org is never emailed about markets it cannot access.

## Data model (Prisma additions)

```prisma
model DigestPreference {
  id           String   @id @default(cuid())
  userId       String   @unique          // Clerk user id
  unsubscribed Boolean  @default(false)
  updatedAt    DateTime @updatedAt
}

model WatchListDigestRun {
  id             String    @id @default(cuid())
  snapshotDate   DateTime                         // the data month this run reports
  status         String    @default("running")    // running | completed | failed
  recipientCount Int       @default(0)
  startedAt      DateTime  @default(now())
  completedAt    DateTime?
  sends          WatchListDigestSend[]
  @@index([snapshotDate])
}

model WatchListDigestSend {
  id        String   @id @default(cuid())
  runId     String
  userId    String
  email     String
  status    String                    // sent | failed
  sentAt    DateTime @default(now())
  run       WatchListDigestRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  @@unique([runId, userId])           // never double-email the same recipient in one run
}
```

Org membership is resolved live via Clerk, not stored. No migration to `WatchList`/`OperatorSnapshot`.

## Digest content

- One email per user, aggregating **all watch lists in the user's org(s)** (a user in multiple orgs gets one email covering all).
- Subject: `Your Dwellsy IQ watch-list update — <Month Year>`.
- Body: a section per watch list that has changes; within a section, operators ordered by change salience:
  1. High-signal (lead): `star`, `eligibility_flip`, `market_added`/`market_dropped`, `portfolio_band`.
  2. Secondary (compact): `submarket_added`/`submarket_dropped`, `concession_transition`/`concession_shift`, `portfolio_size`.
- Each changed operator links to its scorecard page. A one-line `summariseChanges` roll-up per list heads the section.
- Operator display data (name, market, scorecard href) for each changed `pmSlug` comes from the matched-set evaluation (`ResultRowVM` from the same `/results` path), joined to the diff by `pmSlug` — the diff engine is slug-keyed and carries no display strings.
- Lists with zero changes are omitted. Recipients with zero changes across all lists are not emailed.
- HTML email with inline styles + a plain-text alternative. CAN-SPAM footer with the unsubscribe link and a physical-address line.

## Recipients & unsubscribe

- Recipients: Clerk org-membership emails for every org owning ≥1 watch list, minus `DigestPreference.unsubscribed` users.
- Unsubscribe: **stateless tokenized** link `GET /api/digest/unsubscribe?u=<userId>&t=<hmac>`, where `t = HMAC-SHA256(userId, DIGEST_UNSUB_SECRET)`. Route verifies the HMAC (constant-time), upserts `DigestPreference{ userId, unsubscribed: true }`, and renders a plain confirmation page. No auth, no token table.

## Provider & config

- Provider: **Resend** (named in the codebase's existing TODO; clean SDK, HTML support, simple domain verification, generous free tier).
- New dependency: `resend`. New env vars: `RESEND_API_KEY`, `DIGEST_FROM_EMAIL` (e.g. `Dwellsy IQ <iq@dwellsy.com>`, requires a Resend-verified sending domain), `DIGEST_UNSUB_SECRET`, and `CRON_SECRET` (shared with the cron route). All added to `.env.example` with comments.
- `vercel.json` (new): `{ "crons": [{ "path": "/api/cron/watch-list-digest", "schedule": "0 13 * * *" }] }` — daily 13:00 UTC. The idempotency guard makes the daily cadence safe: it only sends on the day a new snapshot date first appears.

## Preview / dry-run

The same route supports, for an authenticated admin (or the `CRON_SECRET`):
- `?dryRun=1` — run the full composition, log per-recipient change counts and the rendered subject lines, send nothing, record no run.
- `?preview=<email>` — compose the digest for the current data month and send it **only** to `<email>`, bypassing the idempotency guard and the recipient list.

## Testing

- **Pure `buildDigest`** (primary): change-scenario fixtures → asserts subject, section presence/ordering, salience grouping, operator links; empty input → `null`.
- **Snapshot-pair selection**: given seeded snapshot dates, returns the correct `{latest, prior}` and skips slugs lacking both.
- **Unsubscribe token**: `sign(userId)` → verifies; tampered token rejected.
- **Idempotency**: a completed run for `latest` → route no-ops; a partial run re-fired → already-sent recipients skipped.
- **Entitlement scoping**: an operator outside the org's entitled markets is excluded from that org's digest.
- Reuse `scripts/seed-change-scenario.ts` patterns for before/after snapshot fixtures.

## Out of scope

- **Brand-new operators** (matched by the list but with no prior-month snapshot) are not reported — `diffSnapshots` requires both a prior and current snapshot. Roster additions ("a new operator now matches your filter") are a distinct signal deferred to a later version; this release reports movement of operators present in both months.
- Per-watch-list subscription granularity (org-level opt-out only for now).
- Instant / real-time alerts (monthly only).
- In-app digest history UI.
- SMS / Slack / other channels.
- The eventual live-DB ingestion rewire — the poller is designed to survive it (it detects a new `snapshotDate`), but wiring that integration is not part of this feature.

## Hand-off notes

- The trigger detects *data* (new `snapshotDate`), not the seed mechanism, so it keeps working when ingestion is rewired to a live Dwellsy DB connection.
- The email provider sits behind `sendEmail(...)`; swapping Resend for another provider touches one file.
- All new env vars are documented in `.env.example`.
