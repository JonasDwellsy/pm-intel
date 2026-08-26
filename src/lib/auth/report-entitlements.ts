// v0.30 — per-report / market-pass access (pure logic).
//
// The consumer single-report funnel adds THREE new ways to reach a scorecard,
// on top of the existing B2B market entitlement (market-entitlements.ts). This
// module is a SIBLING of that one, not a replacement: the existing market gate
// is unchanged and always wins first. A viewer can read an operator's report
// when ANY of these holds:
//   1. isAdmin                 — internal bypass (same as market gate)
//   2. marketEntitled          — the existing B2B path: entitled to the PM's
//                                whole market (org allMarkets or explicit grant)
//   3. hasReportPurchase       — bought the $29 single report for THIS pm
//   4. hasActiveMarketPass     — holds a live $49 30-day pass, or an active
//                                $19/mo subscription, for the PM's market
//
// Pure (no Prisma / Clerk / server-only) so it unit-tests like
// market-entitlements.ts. The async gatherer lives in
// report-entitlements.server.ts.

export type ReportAccessReason =
  | "admin"
  | "market" // existing B2B market entitlement
  | "report" // per-PM single-report purchase
  | "pass" // time-boxed market pass or active subscription
  | null; // no access — show the purchase CTA

export interface ReportAccessInputs {
  isAdmin: boolean;
  /** Result of the EXISTING market entitlement check for the PM's market. */
  marketEntitled: boolean;
  /** A ReportEntitlement row exists for this pm owned by the viewer. */
  hasReportPurchase: boolean;
  /** A live MarketPass or active Subscription for this market owned by the
   *  viewer. */
  hasActiveMarketPass: boolean;
}

/** Highest-precedence reason the viewer may read this report, or null if they
 *  may not. Precedence mirrors the market gate (admin first) and keeps the
 *  existing market path ahead of the new consumer paths. */
export function reportAccessReason(i: ReportAccessInputs): ReportAccessReason {
  if (i.isAdmin) return "admin";
  if (i.marketEntitled) return "market";
  if (i.hasReportPurchase) return "report";
  if (i.hasActiveMarketPass) return "pass";
  return null;
}

/** Convenience boolean. */
export function isReportAccessible(i: ReportAccessInputs): boolean {
  return reportAccessReason(i) !== null;
}
