// v0.33 — Report credits: the only writers of ReportCredit.
//
// Minting is idempotent via the (stripeSessionId, slot) unique index, because
// Stripe can deliver one event twice and the StripeWebhookEvent ledger is
// checked before processing rather than atomically with it.
//
// Redemption is a guarded row claim inside a transaction: the UPDATE names
// `redeemedAt: null` in its WHERE, so only one concurrent caller can move a
// given credit out of the unredeemed state. Claiming and granting share the
// transaction, so a credit is never spent without an entitlement appearing.

import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ownerWhere, type CreditOwner } from "./credits";

export type RedeemResult =
  | { ok: true; pmSlug: string }
  | { ok: false; reason: "no_credits" | "already_owned" };

/** Create `count` unredeemed credits for one completed pack purchase.
 *  Returns how many rows were created — 0 when this session already minted. */
export async function mintCredits(args: {
  owner: CreditOwner;
  stripeSessionId: string;
  count: number;
}): Promise<number> {
  const { owner, stripeSessionId, count } = args;
  ownerWhere(owner); // validate: throws on an ownerless mint
  if (count <= 0) return 0;

  const res = await prisma.reportCredit.createMany({
    data: Array.from({ length: count }, (_, slot) => ({
      organizationId: owner.organizationId,
      guestEmail: owner.guestEmail,
      stripeSessionId,
      slot,
    })),
    // The (stripeSessionId, slot) unique makes a repeat delivery a no-op
    // rather than a duplicate grant.
    skipDuplicates: true,
  });
  return res.count;
}

/** Unredeemed credits this buyer holds. */
export async function countUnredeemed(owner: CreditOwner): Promise<number> {
  return prisma.reportCredit.count({
    where: { ...ownerWhere(owner), redeemedAt: null },
  });
}

/** Spend one credit to grant `pmSlug` to this buyer. */
export async function redeemCredit(
  owner: CreditOwner,
  pmSlug: string
): Promise<RedeemResult> {
  const where = ownerWhere(owner);

  try {
    return await prisma.$transaction(async (tx) => {
      // Never burn a credit on something they already hold — a
      // double-clicked redeem button would otherwise cost the buyer a
      // report. Checked inside the transaction (via `tx`, not `prisma`) so
      // the check and the claim below commit or roll back atomically
      // together: this is READ COMMITTED, not a frozen snapshot, so a
      // concurrent same-operator redemption isn't blocked here — it's
      // caught when its `reportEntitlement.create` hits the unique
      // constraint below and gets mapped to `already_owned` in the catch.
      const existing = await tx.reportEntitlement.findFirst({
        where: { pmSlug, ...where },
        select: { id: true },
      });
      if (existing) return { ok: false, reason: "already_owned" } as const;

      // Claim with FOR UPDATE SKIP LOCKED: a plain SELECT (findFirst) would
      // let every concurrent caller pick the SAME candidate row (all
      // credits from one pack share a `createdAt`, so there's no tie-break),
      // then serialize on the UPDATE — the losers would re-check
      // `redeemedAt: null` against that one row's now-committed state and
      // wrongly report `no_credits` even when other unredeemed credits
      // exist. SKIP LOCKED instead has each caller skip rows already locked
      // by another in-flight transaction and take the next available one,
      // so concurrent callers fan out across distinct credits. The owner
      // predicate is built with Prisma.sql so the value is a bound
      // parameter, never interpolated text.
      const ownerSql = owner.organizationId
        ? Prisma.sql`"organizationId" = ${owner.organizationId}`
        : Prisma.sql`"guestEmail" = ${owner.guestEmail}`;

      const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "ReportCredit"
         WHERE ${ownerSql} AND "redeemedAt" IS NULL
         ORDER BY "createdAt" ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
      `);
      const credit = rows[0];
      if (!credit) return { ok: false, reason: "no_credits" } as const;

      // Defence-in-depth, not the primary guarantee: SKIP LOCKED already
      // ensures no other transaction holds or can claim this row, so this
      // `updateMany` should always affect exactly one row. Kept as a belt
      // for `redeemedAt: null` in case that invariant is ever violated.
      const claimed = await tx.reportCredit.updateMany({
        where: { id: credit.id, redeemedAt: null },
        data: { redeemedPmSlug: pmSlug, redeemedAt: new Date() },
      });
      if (claimed.count !== 1) return { ok: false, reason: "no_credits" } as const;

      await tx.reportEntitlement.create({
        data: {
          pmSlug,
          organizationId: owner.organizationId,
          guestEmail: owner.guestEmail,
          sourceCreditId: credit.id,
        },
      });
      return { ok: true, pmSlug } as const;
    });
  } catch (error) {
    // Two concurrent redemptions of the SAME pmSlug can both pass the
    // `existing` check above (neither entitlement exists yet at the time
    // each transaction reads it) and both proceed to claim a credit. The
    // loser's `reportEntitlement.create` then hits the unique constraint on
    // (pmSlug, organizationId)/(pmSlug, guestEmail) — Postgres reports this
    // as a raw error, not a RedeemResult, and the transaction rolls back
    // (so the loser's claimed credit is restored, unspent). Read `.code`
    // defensively rather than matching on message text.
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        // The winner already granted the entitlement; the buyer owns it now.
        return { ok: false, reason: "already_owned" };
      }
      if (error.code === "P2034") {
        // Write conflict / deadlock under serialisation: another
        // redemption claimed the credit first.
        return { ok: false, reason: "no_credits" };
      }
    }
    throw error;
  }
}
