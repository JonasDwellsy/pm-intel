// v0.22 — per-organization market entitlements (server resolver).
//
// Thin DB/auth wrappers around the pure logic in market-entitlements.ts.
// SECURITY-CRITICAL: every server read path that exposes premium market
// data MUST scope to the result of resolveViewerEntitlement() (or
// getEntitledMarketIds for a known org). A read path that doesn't is an
// entitlement boundary violation — the same rule that applies to
// getActiveOrgId() for watch lists.

import "server-only";
import { prisma } from "@/lib/prisma";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isAdminUser } from "@/lib/auth/is-admin";
import {
  ALL_MARKETS,
  computeEntitlement,
  type MarketEntitlement,
} from "@/lib/auth/market-entitlements";

export { ALL_MARKETS, isMarketEntitled, filterToEntitled } from "@/lib/auth/market-entitlements";
export type { MarketEntitlement } from "@/lib/auth/market-entitlements";

/** Resolve a specific organization's entitlement from the DB. Does NOT
 *  apply the admin bypass (an org's grants are about the org, not the
 *  viewer) — use resolveViewerEntitlement() for request-time gating.
 *  Unknown org id → empty set (fail-closed). */
export async function getEntitledMarketIds(
  organizationId: string
): Promise<MarketEntitlement> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      allMarkets: true,
      marketAccess: { select: { marketId: true } },
    },
  });
  if (!org) return new Set<string>();
  return computeEntitlement({
    isAdmin: false,
    allMarkets: org.allMarkets,
    grantedMarketIds: org.marketAccess.map((m) => m.marketId),
  });
}

/** Resolve the current request's viewer entitlement. Applies the admin
 *  bypass first, then the viewer's active org. No session or no
 *  resolvable org → empty set (fail-closed); callers gate accordingly.
 *  This is the entry point LOGIN-PROTECTED premium pages/data layers
 *  call. */
export async function resolveViewerEntitlement(): Promise<MarketEntitlement> {
  const { userId, organizationId } = await getActiveOrgContext();
  if (isAdminUser(userId)) return ALL_MARKETS;
  if (!organizationId) return new Set<string>();
  return getEntitledMarketIds(organizationId);
}

/** Variant for PUBLIC surfaces that anonymous visitors can reach (the
 *  coverage map, the watch-list preview). Returns `undefined` for
 *  anonymous (no session) so the caller leaves the view UNSCOPED — the
 *  all-markets marketing/SEO view. Signed-in users are scoped exactly
 *  as resolveViewerEntitlement (admin bypass, fail-closed on no org).
 *  Callers treat `undefined` as "don't filter". */
export async function resolveViewerEntitlementForPublicSurface(): Promise<
  MarketEntitlement | undefined
> {
  const { userId, organizationId } = await getActiveOrgContext();
  if (!userId) return undefined;
  if (isAdminUser(userId)) return ALL_MARKETS;
  if (!organizationId) return new Set<string>();
  return getEntitledMarketIds(organizationId);
}
