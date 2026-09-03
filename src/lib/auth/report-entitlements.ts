// v0.33 — per-report access (pure logic).
//
// The consumer funnel adds ONE new way to reach a scorecard on top of the
// existing B2B market entitlement (market-entitlements.ts). This module is a
// SIBLING of that one, not a replacement: the existing market gate is
// unchanged and always wins first. A viewer can read an operator's report
// when ANY of these holds:
//   1. isAdmin           — internal bypass (same as market gate)
//   2. marketEntitled    — existing B2B path: entitled to the PM's whole
//                          market (org allMarkets or explicit grant)
//   3. hasReportPurchase — holds a ReportEntitlement for THIS pm, bought
//                          outright ($149) or redeemed from a pack credit
//
// There is deliberately no market-wide consumer path. The removed $19/mo
// subscription carried no marketId and was resolved without one, so it
// granted every operator in all 44 markets. Deleting the input is the fix.
//
// Pure (no Prisma / Clerk / server-only) so it unit-tests like
// market-entitlements.ts. The async gatherer lives in
// report-entitlements.server.ts.

export type ReportAccessReason =
  | "admin"
  | "market" // existing B2B market entitlement
  | "report" // per-PM entitlement: direct purchase or redeemed credit
  | null; // no access — show the purchase CTA

export interface ReportAccessInputs {
  isAdmin: boolean;
  /** Result of the EXISTING market entitlement check for the PM's market. */
  marketEntitled: boolean;
  /** A ReportEntitlement row exists for this pm owned by the viewer. */
  hasReportPurchase: boolean;
}

/** Highest-precedence reason the viewer may read this report, or null if they
 *  may not. Precedence mirrors the market gate (admin first) and keeps the
 *  existing market path ahead of the consumer path. */
export function reportAccessReason(i: ReportAccessInputs): ReportAccessReason {
  if (i.isAdmin) return "admin";
  if (i.marketEntitled) return "market";
  if (i.hasReportPurchase) return "report";
  return null;
}

/** Convenience boolean. */
export function isReportAccessible(i: ReportAccessInputs): boolean {
  return reportAccessReason(i) !== null;
}
