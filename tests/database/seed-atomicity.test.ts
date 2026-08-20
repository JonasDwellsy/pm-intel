import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import {
  runSeed,
  SEED_CONTENT_VERSION,
  type SeedFailurePoint,
} from "../../prisma/seed";
import { LEGACY_OWNER_ID } from "../../src/lib/watch-list/store";

const databaseUrl = process.env.SEED_TEST_DATABASE_URL;
const seedData = JSON.parse(
  readFileSync(new URL("../../src/data/scorecard_data.json", import.meta.url), "utf8")
) as {
  markets: Array<{ id: string }>;
  pms: Array<{ slug: string }>;
  canonicalOperators: Record<string, unknown>;
};

async function captureState(client: PrismaClient) {
  const marketId = seedData.markets[0].id;
  const pmSlug = seedData.pms[0].slug;
  const canonicalSlug = Object.keys(seedData.canonicalOperators)[0];

  const [
    counts,
    market,
    pm,
    canonical,
    brief,
    customerStarterList,
    legacyStarterList,
    fingerprint,
  ] =
    await Promise.all([
      Promise.all([
        client.market.count(),
        client.pM.count(),
        client.canonicalOperator.count(),
        client.operatorSnapshot.count(),
        client.marketBrief.count(),
        client.watchList.count(),
      ]),
      client.market.findUnique({
        where: { id: marketId },
        select: { city: true, fullName: true },
      }),
      client.pM.findUnique({
        where: { slug: pmSlug },
        select: { name: true, scorecardData: true, dataAsOf: true },
      }),
      client.canonicalOperator.findUnique({
        where: { canonicalSlug },
        select: { canonicalName: true, aggregateStats: true },
      }),
      client.marketBrief.findFirst({
        where: { inputDigest: "rollback-sentinel-brief" },
        select: { headlineRead: true, inputDigest: true },
      }),
      client.watchList.findFirst({
        where: { ownerId: "rollback-sentinel-owner" },
        select: { name: true, ownerId: true },
      }),
      client.watchList.findFirst({
        where: { ownerId: LEGACY_OWNER_ID },
        select: { name: true, ownerId: true },
      }),
      client.appSetting.findUnique({
        where: { key: "seed_content_version" },
        select: { value: true },
      }),
    ]);

  return {
    counts,
    market,
    pm,
    canonical,
    brief,
    customerStarterList,
    legacyStarterList,
    fingerprint,
  };
}

test(
  "seed replacement is atomic and deletes only legacy starter watch lists",
  { skip: databaseUrl ? false : "SEED_TEST_DATABASE_URL is not configured" },
  async () => {
    assert.ok(databaseUrl);
    const client = new PrismaClient({ datasourceUrl: databaseUrl });
    const marketId = seedData.markets[0].id;
    const pmSlug = seedData.pms[0].slug;
    const canonicalSlug = Object.keys(seedData.canonicalOperators)[0];

    try {
      await runSeed(client, { force: true });

      assert.equal(await client.market.count(), seedData.markets.length);
      assert.equal(await client.pM.count(), seedData.pms.length);
      assert.equal(
        await client.canonicalOperator.count(),
        Object.keys(seedData.canonicalOperators).length
      );

      await client.market.update({
        where: { id: marketId },
        data: { city: "Rollback Sentinel City" },
      });
      await client.pM.update({
        where: { slug: pmSlug },
        data: {
          name: "Rollback Sentinel PM",
          scorecardData: JSON.stringify({ vintage: "before-interruption" }),
        },
      });
      await client.canonicalOperator.update({
        where: { canonicalSlug },
        data: { canonicalName: "Rollback Sentinel Canonical" },
      });
      await client.marketBrief.create({
        data: {
          marketSlug: "rollback-sentinel-market",
          methodologyVersion: "rollback-sentinel-methodology",
          dataAsOf: new Date("2000-01-01T00:00:00.000Z"),
          headlineRead: "Rollback Sentinel Headline",
          shareMovement: "sentinel",
          operatorLandscape: "sentinel",
          notableSignals: "sentinel",
          inputDigest: "rollback-sentinel-brief",
        },
      });
      await client.watchList.create({
        data: {
          name: "Evernest-Style SFR Density Build-Out",
          ownerId: "rollback-sentinel-owner",
        },
      });
      await client.watchList.create({
        data: {
          name: "Evernest-Style SFR Density Build-Out",
          ownerId: LEGACY_OWNER_ID,
        },
      });
      await client.appSetting.update({
        where: { key: "seed_content_version" },
        data: { value: "rollback-sentinel-fingerprint" },
      });

      const before = await captureState(client);
      const failurePoints: SeedFailurePoint[] = [
        "after-delete",
        "before-fingerprint",
      ];

      for (const failAt of failurePoints) {
        await assert.rejects(
          runSeed(client, { force: true, failAt }),
          new RegExp(`injected failure at ${failAt}`)
        );
        assert.deepEqual(await captureState(client), before);
      }

      const startedAt = Date.now();
      await runSeed(client, { force: true });
      const elapsedMs = Date.now() - startedAt;

      assert.ok(
        elapsedMs < 60_000,
        `batched atomic replacement took ${elapsedMs}ms`
      );
      assert.equal(
        (
          await client.appSetting.findUniqueOrThrow({
            where: { key: "seed_content_version" },
            select: { value: true },
          })
        ).value,
        SEED_CONTENT_VERSION
      );
      assert.equal(
        await client.marketBrief.count({
          where: { inputDigest: "rollback-sentinel-brief" },
        }),
        0
      );
      assert.equal(
        await client.watchList.count({
          where: { ownerId: "rollback-sentinel-owner" },
        }),
        1
      );
      assert.equal(
        await client.watchList.count({
          where: { ownerId: LEGACY_OWNER_ID },
        }),
        0
      );
    } finally {
      await client.$disconnect();
    }
  }
);
