import "server-only";
import { prisma } from "@/lib/prisma";

export interface OperatorHit {
  kind: "pm" | "canonical";
  key: string; // PM slug or canonicalSlug
  currentName: string;
  context: string; // market label, or "group · N markets"
}

export interface ActiveCorrection {
  id: string;
  targetKind: string;
  targetKey: string;
  correctedName: string;
  originalName: string;
  currentName: string | null;
  updatedAt: Date;
}

const MAX_HITS = 25;

/** Case-insensitive name search across standalone PMs and canonical groups.
 *  Empty/short query returns nothing (the picker requires ≥2 chars). */
export async function searchOperators(query: string): Promise<OperatorHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const [pms, canon] = await Promise.all([
    prisma.pM.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      select: {
        slug: true,
        name: true,
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

  const pmHits: OperatorHit[] = pms.map((p) => ({
    kind: "pm",
    key: p.slug,
    currentName: p.name,
    context: p.market?.fullName ?? p.slug,
  }));
  const canonHits: OperatorHit[] = canon.map((c) => ({
    kind: "canonical",
    key: c.canonicalSlug,
    currentName: c.canonicalName,
    context: `group · ${c.marketCount} markets`,
  }));

  return [...canonHits, ...pmHits].slice(0, MAX_HITS);
}

/** All active corrections, joined with the operator's current live name so
 *  the admin table can show original → corrected and flag drift. */
export async function loadActiveCorrections(): Promise<ActiveCorrection[]> {
  const rows = await prisma.operatorNameCorrection.findMany({
    orderBy: { updatedAt: "desc" },
  });

  const pmKeys = rows.filter((r) => r.targetKind === "pm").map((r) => r.targetKey);
  const canonKeys = rows
    .filter((r) => r.targetKind === "canonical")
    .map((r) => r.targetKey);

  const [pms, canon] = await Promise.all([
    pmKeys.length
      ? prisma.pM.findMany({
          where: { slug: { in: pmKeys } },
          select: { slug: true, name: true },
        })
      : Promise.resolve([]),
    canonKeys.length
      ? prisma.canonicalOperator.findMany({
          where: { canonicalSlug: { in: canonKeys } },
          select: { canonicalSlug: true, canonicalName: true },
        })
      : Promise.resolve([]),
  ]);
  const pmName = new Map(pms.map((p) => [p.slug, p.name]));
  const canonName = new Map(canon.map((c) => [c.canonicalSlug, c.canonicalName]));

  return rows.map((r) => ({
    id: r.id,
    targetKind: r.targetKind,
    targetKey: r.targetKey,
    correctedName: r.correctedName,
    originalName: r.originalName,
    currentName:
      r.targetKind === "pm"
        ? pmName.get(r.targetKey) ?? null
        : canonName.get(r.targetKey) ?? null,
    updatedAt: r.updatedAt,
  }));
}
