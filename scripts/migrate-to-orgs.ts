// v0.18 (PR #65) — Multi-tenancy Phase 1 backfill script.
//
// Provisions a Personal Organization for every distinct
// WatchList.ownerId that doesn't already have one, then backfills
// WatchList.organizationId to point at it.
//
// Usage:
//   Dry-run (no writes):     npm run migrate:to-orgs:dry-run
//   Apply for real:          npm run migrate:to-orgs
//
// Both modes log progress to stdout so you can watch the run against
// production. Failures-per-row are captured to Sentry with the
// rowId attached; the script does NOT abort on a per-row failure
// (one bad row should not block the rest of the backfill).
//
// Idempotency: re-running the script after a successful run is a
// safe no-op:
//   - For each distinct ownerId, provisionPersonalOrgForUser()
//     short-circuits if the user already has a personal org.
//   - WatchList rows that already have organizationId set are
//     skipped via the WHERE clause.
//
// Order of operations on production:
//   1. Deploy this PR (additive migration creates the tables +
//      nullable column).
//   2. Run `npm run migrate:to-orgs:dry-run` against prod (pull
//      env via `vercel env pull .env.local`, then run with
//      DATABASE_URL pointing at prod).
//   3. Verify the dry-run report looks sane.
//   4. Run `npm run migrate:to-orgs` for real.
//   5. Verify `SELECT COUNT(*) FROM "WatchList" WHERE "organizationId" IS NULL;`
//      returns 0 (modulo LEGACY_OWNER_ID rows — those don't map to
//      a real user and stay NULL; the follow-up NOT-NULL migration
//      in the next PR handles them).
//
// Special-case rows:
//   - WatchList.ownerId === LEGACY_OWNER_ID ("legacy-pre-auth"):
//     pre-PR-#50 rows that were never owned by a real Clerk user.
//     Skipped entirely — no Clerk user means no personal org to
//     provision. These rows stay with organizationId=NULL after
//     the script runs; the follow-up PR decides whether to delete
//     them or stamp them with a sentinel "legacy" org.
//   - WatchList.ownerId === DEFAULT_OWNER_ID ("shared"): historical
//     sentinel from pre-auth; the PR #50 migration should have
//     rewritten all of these to LEGACY_OWNER_ID. Defensive: we
//     log + skip these too.

import { PrismaClient } from "@prisma/client";
import { provisionPersonalOrgForUser } from "../src/lib/auth/provision-personal-org";
import { DEFAULT_OWNER_ID, LEGACY_OWNER_ID } from "../src/lib/watch-list/store";
import * as Sentry from "@sentry/nextjs";

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes("--dry-run");

interface Stats {
  distinctOwnersFound: number;
  personalOrgsExistingClerkSide: number;
  personalOrgsCreatedClerkSide: number;
  personalOrgsFailedToProvision: number;
  watchListsUpdated: number;
  watchListsSkippedLegacyOwner: number;
  watchListsSkippedAlreadyMigrated: number;
  watchListsFailedToUpdate: number;
}

async function main(): Promise<void> {
  const mode = DRY_RUN ? "DRY-RUN" : "APPLY";
  console.log(`\n=== migrate-to-orgs [${mode}] ===\n`);

  if (DRY_RUN) {
    console.log("No writes will be performed. Report only.\n");
  }

  const stats: Stats = {
    distinctOwnersFound: 0,
    personalOrgsExistingClerkSide: 0,
    personalOrgsCreatedClerkSide: 0,
    personalOrgsFailedToProvision: 0,
    watchListsUpdated: 0,
    watchListsSkippedLegacyOwner: 0,
    watchListsSkippedAlreadyMigrated: 0,
    watchListsFailedToUpdate: 0,
  };

  // Distinct ownerIds across all WatchList rows that haven't been
  // migrated yet. We use groupBy here so the Clerk API isn't called
  // once per WatchList — most users have multiple watch lists.
  const groups = await prisma.watchList.groupBy({
    by: ["ownerId"],
    where: { organizationId: null },
  });
  stats.distinctOwnersFound = groups.length;
  console.log(`Found ${groups.length} distinct ownerIds with unmigrated watch lists.\n`);

  // Build a map from ownerId → Organization.id (our DB row id) by
  // provisioning where needed.
  const orgIdByOwner = new Map<string, string>();

  for (const group of groups) {
    const ownerId = group.ownerId;

    // Skip legacy sentinels — they don't map to a real Clerk user.
    if (ownerId === LEGACY_OWNER_ID || ownerId === DEFAULT_OWNER_ID) {
      console.log(
        `  ⊘ Skipping sentinel ownerId "${ownerId}" — pre-auth row, no real user to provision for.`
      );
      continue;
    }

    console.log(`→ Provisioning personal org for userId="${ownerId}"...`);

    if (DRY_RUN) {
      console.log(`    (dry-run) would provision personal org`);
      stats.personalOrgsCreatedClerkSide += 1; // approximate; could be already_exists
      continue;
    }

    try {
      const result = await provisionPersonalOrgForUser(ownerId);
      if (result.status === "failed" || !result.clerkOrgId) {
        console.error(
          `    ✗ FAILED to provision personal org for ${ownerId}: ${result.error ?? "no clerkOrgId returned"}`
        );
        Sentry.captureException(
          new Error(`migrate-to-orgs: personal org provisioning failed`),
          {
            tags: { script: "migrate-to-orgs", phase: "provision_org" },
            extra: { ownerId, error: result.error },
          }
        );
        stats.personalOrgsFailedToProvision += 1;
        continue;
      }
      if (result.status === "already_exists") {
        stats.personalOrgsExistingClerkSide += 1;
        console.log(
          `    ✓ Personal org already exists Clerk-side (${result.clerkOrgId})`
        );
      } else {
        stats.personalOrgsCreatedClerkSide += 1;
        console.log(
          `    ✓ Created Clerk-side (${result.clerkOrgId}) — webhook will write our DB row`
        );
      }

      // The webhook handler typically races behind us. To avoid a
      // dependency on webhook delivery during a backfill, we ALSO
      // upsert the Organization + Membership rows ourselves. Same
      // upsert pattern as the webhook so the eventual webhook
      // delivery is a no-op.
      const org = await upsertOrganization(ownerId, result.clerkOrgId);
      orgIdByOwner.set(ownerId, org.id);
    } catch (err) {
      console.error(`    ✗ EXCEPTION provisioning for ${ownerId}:`, err);
      Sentry.captureException(err, {
        tags: { script: "migrate-to-orgs", phase: "provision_org" },
        extra: { ownerId },
      });
      stats.personalOrgsFailedToProvision += 1;
    }
  }

  console.log(`\n--- Personal orgs phase complete. Backfilling WatchList.organizationId... ---\n`);

  // Now backfill WatchList.organizationId by ownerId. One UPDATE per
  // (ownerId, orgId) pair — Postgres optimizes this well at the
  // 100s-of-rows scale we expect at v1 launch.
  for (const [ownerId, organizationId] of orgIdByOwner) {
    if (DRY_RUN) {
      const count = await prisma.watchList.count({
        where: { ownerId, organizationId: null },
      });
      console.log(
        `  (dry-run) would update ${count} watch list(s) for owner ${ownerId} → org ${organizationId}`
      );
      stats.watchListsUpdated += count;
      continue;
    }

    try {
      const result = await prisma.watchList.updateMany({
        where: { ownerId, organizationId: null },
        data: { organizationId },
      });
      console.log(
        `  ✓ Updated ${result.count} watch list(s) for owner ${ownerId} → org ${organizationId}`
      );
      stats.watchListsUpdated += result.count;
    } catch (err) {
      console.error(`  ✗ FAILED to update watch lists for owner ${ownerId}:`, err);
      Sentry.captureException(err, {
        tags: { script: "migrate-to-orgs", phase: "backfill_watch_lists" },
        extra: { ownerId, organizationId },
      });
      stats.watchListsFailedToUpdate += 1;
    }
  }

  // Count what's left unmigrated. Should be only the LEGACY/DEFAULT
  // sentinel rows after a successful run.
  const unmigratedCount = await prisma.watchList.count({
    where: { organizationId: null },
  });
  const legacyCount = await prisma.watchList.count({
    where: {
      organizationId: null,
      OR: [
        { ownerId: LEGACY_OWNER_ID },
        { ownerId: DEFAULT_OWNER_ID },
      ],
    },
  });
  stats.watchListsSkippedLegacyOwner = legacyCount;
  stats.watchListsSkippedAlreadyMigrated = unmigratedCount - legacyCount;

  console.log(`\n=== Done. Report: ===\n`);
  console.log(JSON.stringify(stats, null, 2));
  console.log(
    `\nRemaining WatchList rows with NULL organizationId: ${unmigratedCount} ` +
      `(${legacyCount} are legacy sentinels — expected; ${unmigratedCount - legacyCount} are unexpected — investigate before enforcing NOT NULL).`
  );

  if (DRY_RUN) {
    console.log("\nNo writes performed. Re-run without --dry-run to apply.\n");
  }

  await prisma.$disconnect();
}

/** Belt-and-suspenders DB write so the script doesn't depend on
 *  webhook delivery during a backfill. The webhook handler uses
 *  the same upsert pattern, so subsequent webhook deliveries are
 *  no-ops. */
async function upsertOrganization(
  ownerId: string,
  clerkOrgId: string
): Promise<{ id: string }> {
  return prisma.organization.upsert({
    where: { clerkOrgId },
    create: {
      clerkOrgId,
      // Placeholder name; the webhook will overwrite with the real
      // Clerk-side name. If the webhook never fires (Clerk webhook
      // not configured), we still have a working row.
      name: "Personal",
      slug: null,
      personalForUserId: ownerId,
    },
    update: {
      // Preserve any name the webhook already wrote.
    },
    select: { id: true },
  });
}

main()
  .catch((err) => {
    console.error("\n✗ migrate-to-orgs FAILED at top level:", err);
    Sentry.captureException(err, {
      tags: { script: "migrate-to-orgs", phase: "top_level" },
    });
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
