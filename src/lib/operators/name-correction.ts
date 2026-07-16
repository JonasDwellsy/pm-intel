// Pure operator display-name correction helpers. NO IO, NO "@/" imports —
// prisma/seed.ts imports this via a relative path under tsx, so keep it
// dependency-free. Used by both the live applier (the /admin/names server
// action, on DB rows with a stringified scorecardData blob) and the
// durable applier (seed.ts, on the in-memory seed data before create).

export interface SeedPm {
  slug: string;
  name: string;
  canonicalOperatorName?: string | null;
  [k: string]: unknown;
}
export interface SeedCanonical {
  canonicalName?: string;
  [k: string]: unknown;
}
export interface SeedCorrection {
  targetKind: string; // "pm" | "canonical"
  targetKey: string;
  correctedName: string;
  originalName: string;
}

/** Parse a scorecardData blob, mutate it via `fn`, re-stringify. Blob is a
 *  JSON object of shape `{ canonicalOperatorName?, pm: { name, ... }, ... }`. */
function editBlob(
  scorecardData: string,
  fn: (blob: { canonicalOperatorName?: string | null; pm?: { name?: string } }) => void
): string {
  const blob = JSON.parse(scorecardData);
  fn(blob);
  return JSON.stringify(blob);
}

/** Live patch for a standalone PM: set the `name` column and the blob's
 *  `pm.name`. If the blob's canonicalOperatorName equalled the OLD name
 *  case-insensitively (stale-casing alias, not a real DBA), move it with
 *  the correction so toPmListItem stays consistent. */
export function computePmNamePatch(
  current: { name: string; scorecardData: string },
  correctedName: string
): { name: string; scorecardData: string } {
  const oldName = current.name;
  const scorecardData = editBlob(current.scorecardData, (blob) => {
    if (blob.pm) blob.pm.name = correctedName;
    if (
      typeof blob.canonicalOperatorName === "string" &&
      blob.canonicalOperatorName.toLowerCase() === oldName.toLowerCase()
    ) {
      blob.canonicalOperatorName = correctedName;
    }
  });
  return { name: correctedName, scorecardData };
}

/** Live patch for a member of a corrected canonical group: set the member's
 *  canonicalOperatorName column and the blob's canonicalOperatorName. Does
 *  NOT touch the member's own pm.name. */
export function computeCanonicalMemberPatch(
  current: { scorecardData: string },
  correctedName: string
): { canonicalOperatorName: string; scorecardData: string } {
  const scorecardData = editBlob(current.scorecardData, (blob) => {
    blob.canonicalOperatorName = correctedName;
  });
  return { canonicalOperatorName: correctedName, scorecardData };
}

/** Durable applier: stamp corrections onto the in-memory seed data BEFORE
 *  the blob is built + rows are created. seed.ts sets `pm.name` (which
 *  flows into both the column and the freshly-built blob) so no blob-string
 *  surgery is needed here. Returns counts + a list of targetKeys that
 *  didn't resolve (unknown / stale) for logging. */
export function applyCorrectionsToSeedData(
  pms: SeedPm[],
  canonicalOperators: Record<string, SeedCanonical>,
  corrections: SeedCorrection[]
): { applied: number; stale: string[] } {
  const pmBySlug = new Map<string, SeedPm>();
  for (const pm of pms) pmBySlug.set(pm.slug, pm);
  const membersByCanonical = new Map<string, SeedPm[]>();
  for (const pm of pms) {
    const cid =
      typeof pm.canonicalOperatorId === "string" ? pm.canonicalOperatorId : null;
    if (cid) {
      const arr = membersByCanonical.get(cid) ?? [];
      arr.push(pm);
      membersByCanonical.set(cid, arr);
    }
  }

  let applied = 0;
  const stale: string[] = [];
  for (const c of corrections) {
    if (c.targetKind === "pm") {
      const pm = pmBySlug.get(c.targetKey);
      if (!pm) {
        stale.push(c.targetKey);
        continue;
      }
      pm.name = c.correctedName;
      if (
        typeof pm.canonicalOperatorName === "string" &&
        pm.canonicalOperatorName.toLowerCase() === c.originalName.toLowerCase()
      ) {
        pm.canonicalOperatorName = c.correctedName;
      }
      applied += 1;
    } else if (c.targetKind === "canonical") {
      const canon = canonicalOperators[c.targetKey];
      // Members are linked SOLELY by canonicalOperatorId — the same
      // structural link the live server action uses (prisma.pM.findMany({
      // where: { canonicalOperatorId: targetKey } })) — so the seed applier
      // touches the same member set. No name-based fallback: matching by
      // canonicalOperatorName could over-match unrelated PMs that merely
      // share a display name, and would let the two appliers diverge.
      const members = membersByCanonical.get(c.targetKey) ?? [];
      if (!canon && members.length === 0) {
        stale.push(c.targetKey);
        continue;
      }
      if (canon) canon.canonicalName = c.correctedName;
      for (const m of members) m.canonicalOperatorName = c.correctedName;
      applied += 1;
    } else {
      stale.push(c.targetKey);
    }
  }
  return { applied, stale };
}
