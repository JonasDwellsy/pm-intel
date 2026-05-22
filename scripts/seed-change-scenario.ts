// One-shot demo seeder for the v0.16 Watch list change-detection
// feedback loop (PR #57). Sets up a known multi-signal scenario so
// the banner + /watch-lists/[id]/changes detail view can be
// manually verified without waiting a month for the next real
// data refresh.
//
// Usage:
//   TEST_USER_ID=user_2xxxxxxxxxxxxxxxxx npx tsx scripts/seed-change-scenario.ts
//
// TEST_USER_ID = the Clerk user id you want to own the demo watch
// list. Find it in the Clerk dashboard under your user's "User ID"
// field (starts with "user_"). Required — the script errors out if
// it's missing so we don't accidentally assign a demo watch list
// to "shared" or some placeholder owner.
//
// What this script writes (all destructive but idempotent — re-runs
// reset the same scenario, never accumulate duplicates):
//
//   1. A WatchList row owned by TEST_USER_ID with name
//      "Demo · Change Detection Scenario". Required criterion:
//      marketIds in ["chattanooga-tn"], so all three demo operators
//      match. Existing demo row (matched by name + ownerId) is
//      deleted first.
//
//   2. Three operators × two OperatorSnapshot rows each:
//        Doorby                — A: silver/no-portfolio, B: gold/+30% size
//        Vianova Development   — A: 1 MSA, B: 2 MSAs (adds Knoxville)
//        Brookside Properties  — A: concession 0, B: concession 0.15
//      A is dated 14 days ago; B is dated today. Synthetic dates
//      that won't collide with the real seed's dataAsOf
//      (2026-05-19) so the diff is unambiguous.
//
//   3. One WatchListView row dated 7 days ago (between A and B).
//      This is the "prior visit" the banner diffs against. Without
//      it the very first /results visit by TEST_USER_ID would be
//      treated as a first-visit-no-baseline case per the v1 spec
//      and render no banner — defeating the demo's purpose. The
//      spec's "do not write a WatchListView" instruction works for
//      production data (where the first real visit naturally has
//      no baseline) but not for synthetic demo data where we WANT
//      the banner to render on the next page load. Documented
//      divergence; see PR #58 body for the full reasoning.
//
// Expected banner copy on the next /watch-lists/<id>/results
// visit by TEST_USER_ID:
//   "3 operators moved since your last visit ·
//    1 star change, 1 portfolio shift,
//    1 new market entry, 1 concession move →"
//
// Click-through to /watch-lists/<id>/changes should show 4 rows:
//   - Doorby — Star · Lease-up Speed — silver → Gold ★
//   - Doorby — Portfolio · size — 200 → 260 units (+30%)
//   - Vianova Development — Market · entered — knoxville-tn
//   - Brookside Properties — Concession use · appeared — none → 15.0%

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TEST_USER_ID = process.env.TEST_USER_ID;
if (!TEST_USER_ID || !TEST_USER_ID.startsWith("user_")) {
  console.error(
    "ERROR: TEST_USER_ID env var is required and must be a Clerk user id (format: user_...).\n" +
      "Find yours in the Clerk dashboard → Users → your row → User ID field.\n" +
      "Then re-run:\n" +
      "  TEST_USER_ID=user_2xxxxxxxxxxxxxxxxx npx tsx scripts/seed-change-scenario.ts"
  );
  process.exit(1);
}

const WATCH_LIST_NAME = "Demo · Change Detection Scenario";

// Synthetic snapshot dates. Both A and B sit OUTSIDE the real seed's
// dataAsOf (2026-05-19) so the prisma unique constraint can't
// collide. The user only needs to ensure the dataset has been
// seeded at least once (so the PM rows exist) before running this.
const NOW = new Date();
const DAYS = 24 * 60 * 60 * 1000;
const SNAPSHOT_A_DATE = new Date(NOW.getTime() - 14 * DAYS); // 14 days ago
const SNAPSHOT_B_DATE = new Date(NOW.getTime() - 0 * DAYS); // today
const PRIOR_VIEW_DATE = new Date(NOW.getTime() - 7 * DAYS); // 7 days ago, between A and B

const METHODOLOGY_VERSION = "v0.8";

/** A single PM's two snapshots. Synthetic — the values don't have
 *  to match the operator's real production data because the diff
 *  library treats each snapshot as canonical for the date it's
 *  stamped with. */
interface ScenarioOperator {
  pmSlug: string;
  display: string;
  // Snapshot A (before)
  before: {
    starsPerMetric: Record<string, "gold" | "silver" | null>;
    estimatedPortfolioPoint: number | null;
    estimatedPortfolioBand: string | null;
    topMSAs: string[];
    topSubmarkets: string[];
    concessionRate: number | null;
    isEligibleForRanking: boolean;
  };
  // Snapshot B (current)
  after: {
    starsPerMetric: Record<string, "gold" | "silver" | null>;
    estimatedPortfolioPoint: number | null;
    estimatedPortfolioBand: string | null;
    topMSAs: string[];
    topSubmarkets: string[];
    concessionRate: number | null;
    isEligibleForRanking: boolean;
  };
}

// Three operators, each exercising a different signal from the
// diff library. Identical "stable" fields across before/after when
// not under test — keeps the diff scoped to the intended signal.
const SCENARIO: ScenarioOperator[] = [
  {
    // OPERATOR 1 — star change (Lease-up Speed: silver → gold) +
    // portfolio size shift (200 → 260 units, +30%, same Medium band).
    pmSlug: "doorby-property-management-chattanooga-tn",
    display: "Doorby Property Management",
    before: {
      starsPerMetric: {
        leaseUp: "silver",
        tenancy: "gold",
        rentPerformance: "gold",
        marketingDiscipline: null,
        inventoryTransparency: null,
      },
      estimatedPortfolioPoint: 200,
      estimatedPortfolioBand: "Medium",
      topMSAs: ["chattanooga-tn"],
      topSubmarkets: ["chattanooga"],
      concessionRate: 0.05,
      isEligibleForRanking: true,
    },
    after: {
      starsPerMetric: {
        leaseUp: "gold", // promoted
        tenancy: "gold",
        rentPerformance: "gold",
        marketingDiscipline: null,
        inventoryTransparency: null,
      },
      estimatedPortfolioPoint: 260, // +30%
      estimatedPortfolioBand: "Medium",
      topMSAs: ["chattanooga-tn"],
      topSubmarkets: ["chattanooga"],
      concessionRate: 0.05,
      isEligibleForRanking: true,
    },
  },
  {
    // OPERATOR 2 — new MSA added to topMSAs (canonical footprint
    // expansion). Single-market operator in real data; the synthetic
    // snapshot lets the demo show a multi-market expansion signal
    // without needing a real cross-market entity.
    pmSlug: "vianova-development-chattanooga-tn",
    display: "Vianova Development",
    before: {
      starsPerMetric: {
        leaseUp: "silver",
        tenancy: null,
        rentPerformance: "silver",
        marketingDiscipline: "gold",
        inventoryTransparency: null,
      },
      estimatedPortfolioPoint: 80,
      estimatedPortfolioBand: "Low",
      topMSAs: ["chattanooga-tn"],
      topSubmarkets: ["chattanooga"],
      concessionRate: 0,
      isEligibleForRanking: true,
    },
    after: {
      starsPerMetric: {
        leaseUp: "silver",
        tenancy: null,
        rentPerformance: "silver",
        marketingDiscipline: "gold",
        inventoryTransparency: null,
      },
      estimatedPortfolioPoint: 80,
      estimatedPortfolioBand: "Low",
      topMSAs: ["chattanooga-tn", "knoxville-tn"], // added Knoxville
      topSubmarkets: ["chattanooga"],
      concessionRate: 0,
      isEligibleForRanking: true,
    },
  },
  {
    // OPERATOR 3 — concession use transition (null → 0.15).
    // Operator had no detected concession activity in the prior
    // T12; the next refresh surfaces concession language across
    // 15% of their listings.
    pmSlug: "brookside-properties-chattanooga-tn",
    display: "Brookside Properties",
    before: {
      starsPerMetric: {
        leaseUp: "gold",
        tenancy: "silver",
        rentPerformance: null,
        marketingDiscipline: "gold",
        inventoryTransparency: "gold",
      },
      estimatedPortfolioPoint: 240,
      estimatedPortfolioBand: "Medium",
      topMSAs: ["chattanooga-tn"],
      topSubmarkets: ["chattanooga"],
      concessionRate: null, // no detected concession activity
      isEligibleForRanking: true,
    },
    after: {
      starsPerMetric: {
        leaseUp: "gold",
        tenancy: "silver",
        rentPerformance: null,
        marketingDiscipline: "gold",
        inventoryTransparency: "gold",
      },
      estimatedPortfolioPoint: 240,
      estimatedPortfolioBand: "Medium",
      topMSAs: ["chattanooga-tn"],
      topSubmarkets: ["chattanooga"],
      concessionRate: 0.15, // appeared
      isEligibleForRanking: true,
    },
  },
];

async function main(): Promise<void> {
  console.log("[seed:change-scenario] Setting up demo data for", TEST_USER_ID);

  // 1. Wipe + re-create the demo Watch list. Match by name +
  // ownerId so we don't disturb other watch lists. Cascade-delete
  // handles any prior WatchListView rows attached to the old row.
  await prisma.watchList.deleteMany({
    where: { ownerId: TEST_USER_ID, name: WATCH_LIST_NAME },
  });
  const watchList = await prisma.watchList.create({
    data: {
      name: WATCH_LIST_NAME,
      description:
        "Synthetic demo data for the v0.16 change-detection feature. Re-run scripts/seed-change-scenario.ts to refresh.",
      ownerId: TEST_USER_ID!,
      isShared: false,
      requiredCriteria: JSON.stringify([
        {
          field: "marketIds",
          operator: "in",
          value: ["chattanooga-tn"],
        },
      ]),
      preferredCriteria: JSON.stringify([]),
      excludedCriteria: JSON.stringify([]),
    },
  });
  console.log(`  ✓ WatchList created: ${watchList.id}`);

  // 2. Wipe any synthetic snapshots for the three operators at the
  // demo dates so re-runs reset cleanly. We never touch the real
  // seed's snapshot (different dataAsOf), so production data is
  // unaffected.
  const slugs = SCENARIO.map((s) => s.pmSlug);
  const deleted = await prisma.operatorSnapshot.deleteMany({
    where: {
      pmSlug: { in: slugs },
      snapshotDate: { in: [SNAPSHOT_A_DATE, SNAPSHOT_B_DATE] },
    },
  });
  if (deleted.count > 0) {
    console.log(`  ✓ Cleared ${deleted.count} prior demo snapshot row(s)`);
  }

  // 3. Verify the three PMs exist in the DB before writing snapshots
  // for them. If the dataset hasn't been seeded yet, fail loudly so
  // the user knows to run `npm run seed` first.
  const pmsExist = await prisma.pM.findMany({
    where: { slug: { in: slugs } },
    select: { slug: true, name: true },
  });
  const missing = slugs.filter((s) => !pmsExist.some((p) => p.slug === s));
  if (missing.length > 0) {
    console.error(
      `ERROR: PM rows missing from DB: ${missing.join(", ")}\n` +
        "Run `npm run seed` first to populate the operator universe."
    );
    process.exit(1);
  }

  // 4. Write snapshot A + B for each operator. Two rows per operator,
  // six total. Idempotent via skipDuplicates on the unique key.
  const snapshotRows = SCENARIO.flatMap((op) => [
    {
      pmSlug: op.pmSlug,
      snapshotDate: SNAPSHOT_A_DATE,
      methodologyVersion: METHODOLOGY_VERSION,
      starsPerMetric: JSON.stringify(op.before.starsPerMetric),
      starGoldCount: countStars(op.before.starsPerMetric, "gold"),
      starSilverCount: countStars(op.before.starsPerMetric, "silver"),
      estimatedPortfolioPoint: op.before.estimatedPortfolioPoint,
      estimatedPortfolioBand: op.before.estimatedPortfolioBand,
      topMSAs: JSON.stringify(op.before.topMSAs),
      topSubmarkets: JSON.stringify(op.before.topSubmarkets),
      concessionRate: op.before.concessionRate,
      isEligibleForRanking: op.before.isEligibleForRanking,
    },
    {
      pmSlug: op.pmSlug,
      snapshotDate: SNAPSHOT_B_DATE,
      methodologyVersion: METHODOLOGY_VERSION,
      starsPerMetric: JSON.stringify(op.after.starsPerMetric),
      starGoldCount: countStars(op.after.starsPerMetric, "gold"),
      starSilverCount: countStars(op.after.starsPerMetric, "silver"),
      estimatedPortfolioPoint: op.after.estimatedPortfolioPoint,
      estimatedPortfolioBand: op.after.estimatedPortfolioBand,
      topMSAs: JSON.stringify(op.after.topMSAs),
      topSubmarkets: JSON.stringify(op.after.topSubmarkets),
      concessionRate: op.after.concessionRate,
      isEligibleForRanking: op.after.isEligibleForRanking,
    },
  ]);
  const insertResult = await prisma.operatorSnapshot.createMany({
    data: snapshotRows,
    skipDuplicates: true,
  });
  console.log(
    `  ✓ OperatorSnapshot: ${insertResult.count} row(s) written (${SCENARIO.length} operators × 2 snapshots)`
  );

  // 5. Write the "prior visit" WatchListView. Dated between A and B
  // so the diff baselines against snapshot A. Without this row, the
  // first /results visit would be treated as first-visit per the
  // v1 spec and the banner would not render.
  await prisma.watchListView.create({
    data: {
      userId: TEST_USER_ID!,
      watchListId: watchList.id,
      viewedAt: PRIOR_VIEW_DATE,
    },
  });
  console.log(
    `  ✓ WatchListView baseline written for ${TEST_USER_ID} at ${PRIOR_VIEW_DATE.toISOString()}`
  );

  console.log("\nDemo scenario ready. Open the watch list:");
  console.log(
    `  http://localhost:3000/watch-lists/${watchList.id}/results`
  );
  console.log("Expected banner:");
  console.log(
    "  '3 operators moved since your last visit · 1 star change, 1 portfolio shift, 1 new market entry, 1 concession move →'"
  );
}

/** Inline star counter — mirrors src/lib/operators/stars.ts but
 *  operates on the loose snapshot shape (one of `gold`, `silver`,
 *  or null per metric). */
function countStars(
  stars: Record<string, "gold" | "silver" | null>,
  tone: "gold" | "silver"
): number {
  return Object.values(stars).filter((s) => s === tone).length;
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
