import { prisma } from "@/lib/prisma";
import { citySlug, stateCodeToSlug } from "@/lib/slugify";
import type { ScorecardData } from "@/lib/types";

// Shared parsed MSA pool — used by both peer-comparison (Layer 3) and
// lending-signals (Layer 4). Loading + parsing the same scorecardData blobs
// twice would double the per-render work; expose a single `loadMsaPool` that
// both layers consume in parallel via the page-level Promise.all.

export interface PoolPm {
  slug: string;
  name: string;
  quadrant7Cell: string | null;
  /** Public scorecard URL (always unlocked, server-side). */
  href: string;
  scorecard: ScorecardData;
}

export async function loadMsaPool(marketId: string): Promise<PoolPm[]> {
  const rows = await prisma.pM.findMany({
    where: { marketId },
    select: {
      slug: true,
      name: true,
      quadrant7Cell: true,
      market: { select: { state: true, city: true } },
      scorecardData: true,
    },
  });

  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    quadrant7Cell: row.quadrant7Cell,
    href: `/property-managers/${stateCodeToSlug(row.market.state)}/${citySlug(row.market.city)}/${row.slug}?unlocked=true`,
    scorecard: JSON.parse(row.scorecardData) as ScorecardData,
  }));
}

// Operator type axis — used by both Layer 3 fallback cohorts and Layer 4
// vacancy/operator-stability percentile cohorts. Maps the 7-cell label down
// to {SFR, MF/BTR, Hybrid}.
export type OperatorType = "sfr" | "mfbtr" | "hybrid";

export function operatorType(q7: string | null | undefined): OperatorType {
  const lower = (q7 ?? "").toLowerCase();
  if (lower.startsWith("sfr")) return "sfr";
  if (
    lower.startsWith("small mf") ||
    lower.startsWith("large mf") ||
    lower.startsWith("mf")
  )
    return "mfbtr";
  return "hybrid";
}

export function operatorTypeLabel(t: OperatorType): string {
  return t === "sfr" ? "SFR" : t === "mfbtr" ? "MF/BTR" : "Hybrid";
}
