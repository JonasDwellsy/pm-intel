import { prisma } from "@/lib/prisma";
import { toPmListItem } from "@/lib/slugify";
import type { LeadApiInput } from "@/lib/lead-schema";
import type { PMListItem } from "@/lib/types";

// Infer the most likely quadrant from property type and unit count when the
// owner doesn't explicitly state a preference. Heuristic; not the same as
// the operator-classification methodology.
export function inferQuadrant(
  propertyType: LeadApiInput["propertyType"],
  unitCount?: number
): string | null {
  if (propertyType === "multifamily") {
    if (unitCount !== undefined && unitCount >= 50) {
      return "MF/BTR / Institutional";
    }
    return "MF/BTR / Independent";
  }
  if (propertyType === "small-mf") {
    return "Scattered Site / Independent";
  }
  if (propertyType === "single-family" || propertyType === "condo") {
    if (unitCount !== undefined && unitCount >= 200) {
      return "Scattered Site / Institutional";
    }
    return "Scattered Site / Independent";
  }
  return null;
}

// Score a PM against a target quadrant.
//   3 — exact quadrant match
//   2 — same operating axis (institutional/independent)
//   1 — other
function quadrantScore(pmQuadrant: string, target: string): number {
  if (pmQuadrant === target) return 3;
  const [pmAsset, pmAxis] = pmQuadrant.split(" / ");
  const [targetAsset, targetAxis] = target.split(" / ");
  if (pmAxis === targetAxis) return 2;
  if (pmAsset === targetAsset) return 2;
  return 1;
}

export async function matchPms(input: LeadApiInput): Promise<PMListItem[]> {
  const target =
    input.preferredQuadrant ?? inferQuadrant(input.propertyType, input.unitCount);

  const candidates = await prisma.pM.findMany({
    where: input.marketId ? { marketId: input.marketId } : {},
    select: {
      slug: true,
      name: true,
      quadrant: true,
      hybrid: true,
      rankOverall: true,
      rankQuadrant: true,
      claimed: true,
      scorecardData: true,
    },
  });

  const ranked = candidates
    .map((pm) => ({
      pm,
      score: target ? quadrantScore(pm.quadrant, target) : 1,
      rank: pm.rankOverall ?? Number.POSITIVE_INFINITY,
    }))
    .sort((a, b) => b.score - a.score || a.rank - b.rank);

  return ranked.slice(0, 3).map((entry) => toPmListItem(entry.pm));
}
