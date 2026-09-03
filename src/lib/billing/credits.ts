// v0.33 — Report credits: pure helpers.
//
// A credit is an unredeemed report purchase. The three-pack ($299) mints
// three; the single report ($149) grants its entitlement directly and mints
// none.
//
// WHY CREDITS AT ALL. At the moment of purchase the buyer usually knows ONE
// operator name — they arrived by searching it. The other operators worth
// checking are revealed afterwards, by the scorecard's peer table. So a pack
// cannot grant three entitlements at checkout; it has to grant something
// redeemable later.

/** Who owns a credit or entitlement: an org, or a guest email. Exactly one. */
export interface CreditOwner {
  organizationId: string | null;
  guestEmail: string | null;
}

/** Prisma `where` fragment selecting rows owned by this buyer.
 *
 *  Filters on exactly ONE column. NULLs are distinct in Postgres, so a
 *  fragment naming both columns would match no rows at all — a silent
 *  no-access bug rather than a loud one. Throws when neither is set, because
 *  the alternative is a query that matches every row in the table. */
export function ownerWhere(
  owner: CreditOwner
): { organizationId: string } | { guestEmail: string } {
  if (owner.organizationId) return { organizationId: owner.organizationId };
  if (owner.guestEmail) return { guestEmail: owner.guestEmail };
  throw new Error("credit owner has neither organizationId nor guestEmail");
}
