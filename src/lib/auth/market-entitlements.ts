// v0.22 — per-organization market entitlements (pure logic).
//
// Operator IQ is sold by market. An organization is entitled either to
// EVERY market (the `allMarkets` flag — internal/comp accounts and
// national-tier clients) or to an explicit set of granted market ids.
// Internal admins always resolve to ALL.
//
// This module is intentionally pure (no Prisma, no Clerk, no
// `server-only`) so it can be unit-tested with real input/output, the
// same way email-domain.ts is. The async DB/auth wrappers that gather
// the inputs live in market-entitlements.server.ts.

/** Sentinel for "entitled to all current and future markets". Distinct
 *  from a Set so callers can short-circuit without enumerating every
 *  market id. */
export const ALL_MARKETS = "all" as const;

/** A resolved entitlement: either ALL_MARKETS, or the concrete set of
 *  market ids the org may access. An empty Set means "locked" (no
 *  premium market access) — the fail-closed default. */
export type MarketEntitlement = typeof ALL_MARKETS | Set<string>;

export interface EntitlementInputs {
  /** Viewer is an internal Dwellsy admin (ADMIN_USER_IDS). */
  isAdmin: boolean;
  /** Organization.allMarkets — entitled to all current + future markets. */
  allMarkets: boolean;
  /** Explicit per-market grants (OrganizationMarketAccess.marketId). */
  grantedMarketIds: string[];
}

/** Collapse the raw org/admin facts into a resolved entitlement.
 *  Precedence: admin bypass → allMarkets flag → explicit grants →
 *  empty (locked). */
export function computeEntitlement(inputs: EntitlementInputs): MarketEntitlement {
  if (inputs.isAdmin || inputs.allMarkets) return ALL_MARKETS;
  return new Set(inputs.grantedMarketIds);
}

/** True iff the entitlement grants access to `marketId`. */
export function isMarketEntitled(
  entitlement: MarketEntitlement,
  marketId: string
): boolean {
  return entitlement === ALL_MARKETS ? true : entitlement.has(marketId);
}

/** Filter a list of market ids down to the entitled ones, preserving
 *  input order. ALL_MARKETS returns a copy of the input unchanged. */
export function filterToEntitled(
  entitlement: MarketEntitlement,
  marketIds: readonly string[]
): string[] {
  if (entitlement === ALL_MARKETS) return [...marketIds];
  return marketIds.filter((id) => entitlement.has(id));
}
