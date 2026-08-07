import "server-only";
import { prisma } from "@/lib/prisma";
import { parseScorecard } from "@/lib/scorecard/parse";
import { sizeBandLabel } from "@/lib/operator-size-bands";
import {
  reportedVsEstimateRatio,
  type ReportedSizeSourceKind,
} from "./reported-size";

// Read layer for the admin reported-size tool. Everything here is admin-only;
// no client-facing surface reads this module.

/** An operator the admin can attach a reported count to, WITH the figures we
 *  currently hold. Showing our own numbers beside the input is deliberate: the
 *  person typing "3,000" should see that we estimate 803, because that gap is
 *  the finding, not an inconvenience. */
export interface ReportedSizeTarget {
  kind: "pm" | "canonical";
  key: string;
  name: string;
  /** Market label, or "group · N markets" for a canonical. */
  context: string;
  observedUnits: number | null;
  estimatedUnits: number | null;
  estimatedBand: string | null;
}

const MAX_HITS = 25;

/** Sum a canonical group's member figures. A count like "950 across four
 *  markets" is a statement about the company, so it has to be compared against
 *  the company's total, not one market's slice. */
function sumMembers(
  members: Array<{ scorecardData: string }>
): { observed: number | null; estimated: number | null } {
  let observed: number | null = null;
  let estimated: number | null = null;
  for (const m of members) {
    let sc;
    try {
      sc = parseScorecard(m);
    } catch {
      continue; // a malformed blob shouldn't blank the whole group
    }
    const o = sc.coverage?.urusT12;
    if (typeof o === "number") observed = (observed ?? 0) + o;
    const e = sc.portfolioEstimate?.point;
    if (typeof e === "number") estimated = (estimated ?? 0) + e;
  }
  return { observed, estimated };
}

/** Case-insensitive search across canonical groups and standalone PMs, with
 *  each hit's current observed/estimated figures resolved. Short queries return
 *  nothing — the picker requires ≥2 characters. */
export async function searchReportedSizeTargets(
  query: string
): Promise<ReportedSizeTarget[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const [pms, canon] = await Promise.all([
    prisma.pM.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      select: {
        slug: true,
        name: true,
        scorecardData: true,
        market: { select: { fullName: true } },
      },
      take: MAX_HITS,
      orderBy: { name: "asc" },
    }),
    prisma.canonicalOperator.findMany({
      where: { canonicalName: { contains: q, mode: "insensitive" } },
      select: { canonicalSlug: true, canonicalName: true, marketCount: true },
      take: MAX_HITS,
      orderBy: { canonicalName: "asc" },
    }),
  ]);

  // Members for every canonical hit, in one query rather than N.
  const canonSlugs = canon.map((c) => c.canonicalSlug);
  const members = canonSlugs.length
    ? await prisma.pM.findMany({
        where: { canonicalOperatorId: { in: canonSlugs } },
        select: { canonicalOperatorId: true, scorecardData: true },
      })
    : [];
  const byCanon = new Map<string, Array<{ scorecardData: string }>>();
  for (const m of members) {
    if (!m.canonicalOperatorId) continue;
    const list = byCanon.get(m.canonicalOperatorId) ?? [];
    list.push({ scorecardData: m.scorecardData });
    byCanon.set(m.canonicalOperatorId, list);
  }

  const canonHits: ReportedSizeTarget[] = canon.map((c) => {
    const { observed, estimated } = sumMembers(byCanon.get(c.canonicalSlug) ?? []);
    return {
      kind: "canonical",
      key: c.canonicalSlug,
      name: c.canonicalName,
      context: `group · ${c.marketCount} markets`,
      observedUnits: observed,
      estimatedUnits: estimated,
      estimatedBand: sizeBandLabel(estimated),
    };
  });

  const pmHits: ReportedSizeTarget[] = pms.map((p) => {
    let observed: number | null = null;
    let estimated: number | null = null;
    try {
      const sc = parseScorecard(p);
      observed = sc.coverage?.urusT12 ?? null;
      estimated = sc.portfolioEstimate?.point ?? null;
    } catch {
      // leave both null — the row still renders, just without our figures
    }
    return {
      kind: "pm",
      key: p.slug,
      name: p.name,
      context: p.market?.fullName ?? p.slug,
      observedUnits: observed,
      estimatedUnits: estimated,
      estimatedBand: sizeBandLabel(estimated),
    };
  });

  // Groups first: a company-wide count belongs on the group, and putting those
  // hits on top makes the right target the easy one to pick.
  return [...canonHits, ...pmHits].slice(0, MAX_HITS);
}

export interface ReportedSizeEntry {
  id: string;
  targetKind: string;
  targetKey: string;
  /** Current display name, null if the target has since been merged away. */
  name: string | null;
  reportedUnits: number;
  reportedAsOf: Date;
  sourceKind: ReportedSizeSourceKind;
  sourceNote: string | null;
  estimatedUnits: number | null;
  /** reported ÷ estimated. The point of the whole exercise. */
  ratio: number | null;
  updatedAt: Date;
}

/** Every recorded count, joined with the operator's current name + our current
 *  estimate so the admin table can show the gap directly. */
export async function loadReportedSizes(): Promise<ReportedSizeEntry[]> {
  const rows = await prisma.operatorReportedSize.findMany({
    orderBy: { reportedAsOf: "desc" },
  });
  if (rows.length === 0) return [];

  const pmKeys = rows.filter((r) => r.targetKind === "pm").map((r) => r.targetKey);
  const canonKeys = rows
    .filter((r) => r.targetKind === "canonical")
    .map((r) => r.targetKey);

  const [pms, canon, canonMembers] = await Promise.all([
    pmKeys.length
      ? prisma.pM.findMany({
          where: { slug: { in: pmKeys } },
          select: { slug: true, name: true, scorecardData: true },
        })
      : Promise.resolve([]),
    canonKeys.length
      ? prisma.canonicalOperator.findMany({
          where: { canonicalSlug: { in: canonKeys } },
          select: { canonicalSlug: true, canonicalName: true },
        })
      : Promise.resolve([]),
    canonKeys.length
      ? prisma.pM.findMany({
          where: { canonicalOperatorId: { in: canonKeys } },
          select: { canonicalOperatorId: true, scorecardData: true },
        })
      : Promise.resolve([]),
  ]);

  const pmByKey = new Map(pms.map((p) => [p.slug, p]));
  const canonByKey = new Map(canon.map((c) => [c.canonicalSlug, c]));
  const membersByCanon = new Map<string, Array<{ scorecardData: string }>>();
  for (const m of canonMembers) {
    if (!m.canonicalOperatorId) continue;
    const list = membersByCanon.get(m.canonicalOperatorId) ?? [];
    list.push({ scorecardData: m.scorecardData });
    membersByCanon.set(m.canonicalOperatorId, list);
  }

  return rows.map((r) => {
    let name: string | null = null;
    let estimated: number | null = null;
    if (r.targetKind === "pm") {
      const pm = pmByKey.get(r.targetKey);
      name = pm?.name ?? null;
      if (pm) {
        try {
          estimated = parseScorecard(pm).portfolioEstimate?.point ?? null;
        } catch {
          estimated = null;
        }
      }
    } else {
      name = canonByKey.get(r.targetKey)?.canonicalName ?? null;
      estimated = sumMembers(membersByCanon.get(r.targetKey) ?? []).estimated;
    }
    return {
      id: r.id,
      targetKind: r.targetKind,
      targetKey: r.targetKey,
      name,
      reportedUnits: r.reportedUnits,
      reportedAsOf: r.reportedAsOf,
      sourceKind: r.sourceKind as ReportedSizeSourceKind,
      sourceNote: r.sourceNote,
      estimatedUnits: estimated,
      ratio: reportedVsEstimateRatio(r.reportedUnits, estimated),
      updatedAt: r.updatedAt,
    };
  });
}
