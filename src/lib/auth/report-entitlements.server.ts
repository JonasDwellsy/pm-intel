// v0.30 — per-report / market-pass access (server resolver).
//
// Thin DB/auth wrapper around the pure logic in report-entitlements.ts, in the
// exact shape of market-entitlements.server.ts. NON-BREAKING BY DESIGN: this
// FIRST calls the existing resolveViewerEntitlement()/isMarketEntitled() pair,
// so every B2B viewer keeps their current access unchanged; the new
// purchase/pass reads only ever ADD access, never remove it.
//
// Ownership is guest-OR-org:
//   - Signed-in workspace viewer → keyed on our Organization.id (via
//     getActiveOrgContext), same identity the market gate uses.
//   - Guest (consumer funnel) → keyed on a lowercased email the caller passes
//     in, sourced from a signed magic-link token (never trusted from raw user
//     input). Omit guestEmail to check only the signed-in identity.

import "server-only";
import { prisma } from "@/lib/prisma";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isAdminUser } from "@/lib/auth/is-admin";
import {
  resolveViewerEntitlement,
  isMarketEntitled,
} from "@/lib/auth/market-entitlements.server";
import {
  reportAccessReason,
  type ReportAccessReason,
} from "@/lib/auth/report-entitlements";

export interface ResolveReportAccessOptions {
  /** Verified guest email (from a signed token), lowercased by the caller or
   *  here. Enables guest-keyed purchase/pass lookups. */
  guestEmail?: string | null;
}

export interface ReportAccess {
  accessible: boolean;
  reason: ReportAccessReason;
}

/** Resolve whether the current request may read `pmSlug` (in `marketId`).
 *  Order matches the pure resolver: admin → existing market entitlement →
 *  per-PM purchase → live market pass / active subscription. */
export async function resolveReportAccess(
  pmSlug: string,
  marketId: string,
  opts: ResolveReportAccessOptions = {}
): Promise<ReportAccess> {
  const guestEmail = opts.guestEmail?.trim().toLowerCase() || null;

  // 1 + 2: reuse the EXISTING gate verbatim. Admin and market entitlement are
  // resolved exactly as the B2B scorecard page does today.
  const { userId, organizationId } = await getActiveOrgContext();
  const isAdmin = isAdminUser(userId);
  let marketEntitled = false;
  if (!isAdmin) {
    const entitlement = await resolveViewerEntitlement();
    marketEntitled = isMarketEntitled(entitlement, marketId);
  }

  // Short-circuit before touching the new tables when the existing gate
  // already grants access — keeps the B2B path's cost unchanged.
  if (isAdmin || marketEntitled) {
    const reason = reportAccessReason({
      isAdmin,
      marketEntitled,
      hasReportPurchase: false,
      hasActiveMarketPass: false,
    });
    return { accessible: reason !== null, reason };
  }

  // Build the owner predicate: the signed-in org and/or the verified guest
  // email. `.filter(Boolean)` drops the absent side so we never match on a
  // null column.
  const owners: Array<{ organizationId?: string; guestEmail?: string }> = [];
  if (organizationId) owners.push({ organizationId });
  if (guestEmail) owners.push({ guestEmail });

  // No identity at all (anonymous, no token) → no consumer grant possible.
  if (owners.length === 0) {
    return { accessible: false, reason: null };
  }

  const now = new Date();
  const [purchase, pass, sub] = await Promise.all([
    prisma.reportEntitlement.findFirst({
      where: { pmSlug, OR: owners },
      select: { id: true },
    }),
    prisma.marketPass.findFirst({
      where: { marketId, expiresAt: { gt: now }, OR: owners },
      select: { id: true },
    }),
    prisma.subscription.findFirst({
      where: {
        status: "active",
        currentPeriodEnd: { gt: now },
        OR: owners,
      },
      select: { id: true },
    }),
  ]);

  const reason = reportAccessReason({
    isAdmin: false,
    marketEntitled: false,
    hasReportPurchase: Boolean(purchase),
    hasActiveMarketPass: Boolean(pass || sub),
  });
  return { accessible: reason !== null, reason };
}
