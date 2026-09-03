import test from "node:test";
import { strict as assert } from "node:assert";
import { PrismaClient } from "@prisma/client";
// RELATIVE imports, matching tests/database/seed-atomicity.test.ts. The `@/`
// alias is a tsconfig path that this runner does not resolve from here.
import {
  mintCredits,
  redeemCredit,
  countUnredeemed,
} from "../../src/lib/billing/credits.server";
import type { CreditOwner } from "../../src/lib/billing/credits";

// Credits are money. These run against a real database because every property
// worth guaranteeing here — idempotent minting, no double-spend, no credit
// burned on a report the buyer already owns — is a property of the constraints
// and the transaction, not of the TypeScript.

// Same database contract as seed-atomicity.test.ts: CI sets
// SEED_TEST_DATABASE_URL against a disposable Postgres and runs
// `prisma migrate deploy` first. Locally, skip rather than scribble on
// whatever DATABASE_URL happens to point at — which may be production.
//
// No DATABASE_URL fallback: importing @prisma/client auto-loads this repo's
// .env, which sets DATABASE_URL to the production Neon database — and it
// does so before any guard here runs. A fallback to DATABASE_URL would mean
// a plain local run connects to production instead of skipping.
const DB_URL = process.env.SEED_TEST_DATABASE_URL?.trim();
const IN_CI = Boolean(
  process.env.CI && !["false", "0"].includes(process.env.CI.trim().toLowerCase())
);
if (IN_CI && !DB_URL) {
  throw new Error(
    "SEED_TEST_DATABASE_URL is required in CI; refusing to skip the credit tests"
  );
}

// `datasourceUrl` (not `datasources.db.url`) so this client is unambiguously
// pinned to SEED_TEST_DATABASE_URL and never falls back to whatever .env
// supplied for DATABASE_URL.
const prisma = new PrismaClient(DB_URL ? { datasourceUrl: DB_URL } : undefined);

/** Unique per run so parallel or repeated runs never collide. */
function guest(tag: string): CreditOwner {
  return {
    organizationId: null,
    guestEmail: `credits-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.invalid`,
  };
}

async function cleanup(owner: CreditOwner) {
  const email = owner.guestEmail!;
  await prisma.reportEntitlement.deleteMany({ where: { guestEmail: email } });
  await prisma.reportCredit.deleteMany({ where: { guestEmail: email } });
}

test("minting a pack creates exactly `count` credits", { skip: !DB_URL }, async (t) => {
  const owner = guest("mint");
  t.after(() => cleanup(owner));

  const created = await mintCredits({
    owner,
    stripeSessionId: `cs_mint_${owner.guestEmail}`,
    count: 3,
  });
  assert.equal(created, 3);
  assert.equal(await countUnredeemed(owner), 3);
});

test("minting the same session twice is a no-op", { skip: !DB_URL }, async (t) => {
  // Stripe can deliver one event more than once, and the StripeWebhookEvent
  // ledger is checked BEFORE processing rather than atomically with it — so
  // two concurrent deliveries can both get past it. The
  // (stripeSessionId, slot) unique is what actually prevents six credits.
  const owner = guest("dupe");
  t.after(() => cleanup(owner));
  const sessionId = `cs_dupe_${owner.guestEmail}`;

  const first = await mintCredits({ owner, stripeSessionId: sessionId, count: 3 });
  const second = await mintCredits({ owner, stripeSessionId: sessionId, count: 3 });

  assert.equal(first, 3);
  assert.equal(second, 0, "the second mint must create nothing");
  assert.equal(await countUnredeemed(owner), 3);
});

test("concurrent mints of one session still yield `count` credits", { skip: !DB_URL }, async (t) => {
  const owner = guest("race");
  t.after(() => cleanup(owner));
  const sessionId = `cs_race_${owner.guestEmail}`;

  await Promise.all([
    mintCredits({ owner, stripeSessionId: sessionId, count: 3 }),
    mintCredits({ owner, stripeSessionId: sessionId, count: 3 }),
  ]);

  assert.equal(await countUnredeemed(owner), 3);
});

test("redeeming spends one credit and grants the entitlement", { skip: !DB_URL }, async (t) => {
  const owner = guest("redeem");
  t.after(() => cleanup(owner));
  await mintCredits({ owner, stripeSessionId: `cs_r_${owner.guestEmail}`, count: 3 });

  const res = await redeemCredit(owner, "acme-property-management-denver-co");
  assert.deepEqual(res, { ok: true, pmSlug: "acme-property-management-denver-co" });
  assert.equal(await countUnredeemed(owner), 2);

  const ent = await prisma.reportEntitlement.findFirst({
    where: { guestEmail: owner.guestEmail!, pmSlug: "acme-property-management-denver-co" },
    select: { sourceCreditId: true },
  });
  assert.ok(ent, "an entitlement must exist");
  assert.ok(ent.sourceCreditId, "it must record which credit paid for it");
});

test("redeeming with no credits fails without granting anything", { skip: !DB_URL }, async (t) => {
  const owner = guest("empty");
  t.after(() => cleanup(owner));

  const res = await redeemCredit(owner, "some-operator-denver-co");
  assert.deepEqual(res, { ok: false, reason: "no_credits" });
  const ent = await prisma.reportEntitlement.count({
    where: { guestEmail: owner.guestEmail! },
  });
  assert.equal(ent, 0);
});

test("redeeming a report you already own does NOT burn a credit", { skip: !DB_URL }, async (t) => {
  // Otherwise a buyer clicking twice pays twice for the same report.
  const owner = guest("owned");
  t.after(() => cleanup(owner));
  await mintCredits({ owner, stripeSessionId: `cs_o_${owner.guestEmail}`, count: 3 });
  const slug = "dup-operator-denver-co";

  assert.deepEqual(await redeemCredit(owner, slug), { ok: true, pmSlug: slug });
  assert.equal(await countUnredeemed(owner), 2);

  assert.deepEqual(await redeemCredit(owner, slug), {
    ok: false,
    reason: "already_owned",
  });
  assert.equal(await countUnredeemed(owner), 2, "no second credit may be spent");
});

test("three concurrent redemptions of two credits grant exactly two reports", { skip: !DB_URL }, async (t) => {
  // The guarded row claim is the whole point: only one transaction can move a
  // given credit out of the unredeemed state.
  const owner = guest("concurrent");
  t.after(() => cleanup(owner));
  await mintCredits({ owner, stripeSessionId: `cs_c_${owner.guestEmail}`, count: 2 });

  const results = await Promise.all([
    redeemCredit(owner, "op-a-denver-co"),
    redeemCredit(owner, "op-b-denver-co"),
    redeemCredit(owner, "op-c-denver-co"),
  ]);

  const granted = results.filter((r) => r.ok).length;
  assert.equal(granted, 2, `expected 2 grants, got ${granted}`);
  assert.equal(await countUnredeemed(owner), 0);
  assert.equal(
    await prisma.reportEntitlement.count({ where: { guestEmail: owner.guestEmail! } }),
    2
  );
});

test(
  "two concurrent redemptions of the SAME pmSlug grant exactly one",
  { skip: !DB_URL },
  async (t) => {
    // The already_owned check moved inside the transaction so it reads the
    // same snapshot as the credit claim. Before that fix, both callers could
    // pass the pre-transaction check, and the loser's INSERT would hit the
    // ReportEntitlement unique constraint and throw instead of returning a
    // RedeemResult. Neither call may throw; exactly one must win.
    const owner = guest("same-slug");
    t.after(() => cleanup(owner));
    await mintCredits({ owner, stripeSessionId: `cs_ss_${owner.guestEmail}`, count: 3 });
    const slug = "same-slug-operator-denver-co";

    const results = await Promise.all([
      redeemCredit(owner, slug),
      redeemCredit(owner, slug),
    ]);

    const granted = results.filter((r) => r.ok);
    const alreadyOwned = results.filter(
      (r) => !r.ok && r.reason === "already_owned"
    );
    assert.equal(granted.length, 1, `expected exactly 1 grant, got ${granted.length}`);
    assert.equal(
      alreadyOwned.length,
      1,
      `expected exactly 1 already_owned, got ${alreadyOwned.length}`
    );

    assert.equal(await countUnredeemed(owner), 2, "exactly one credit spent");
    assert.equal(
      await prisma.reportEntitlement.count({
        where: { guestEmail: owner.guestEmail!, pmSlug: slug },
      }),
      1,
      "exactly one entitlement created"
    );
  }
);

test.after(async () => {
  await prisma.$disconnect();
});
