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

  // Never burn a credit on something they already hold — a double-clicked
  // redeem button would otherwise cost the buyer a report.
  const existing = await prisma.reportEntitlement.findFirst({
    where: { pmSlug, ...where },
    select: { id: true },
  });
  if (existing) return { ok: false, reason: "already_owned" };

  return prisma.$transaction(async (tx) => {
    const credit = await tx.reportCredit.findFirst({
      where: { ...where, redeemedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!credit) return { ok: false, reason: "no_credits" } as const;

    // The guard: only one transaction can satisfy `redeemedAt: null`.
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
}
