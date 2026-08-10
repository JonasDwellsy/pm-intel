export interface CompCandidateInput {
  sourceRecordId: string;
  address: string | null;
  communityName: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  propertyType: string;
  bedrooms: number | null;
  bathrooms: number | null;
  askingRent: number | null;
  squareFeet: number | null;
  activatedAt: Date | null;
}

export interface ProposedComp extends CompCandidateInput {
  comparisonKey: string;
  propertyLabel: string;
  selectionReason: string;
}

export function comparisonAddress(value: string): string {
  return value
    .replace(/\s+(?:apt|apartment|unit|ste|suite)\s*[-#]?\s*[a-z0-9-]+.*$/i, "")
    .replace(/\s+#\s*[a-z0-9-]+.*$/i, "")
    .trim();
}

export function normalizedAddress(value: string): string {
  return comparisonAddress(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function sameText(left: string | null, right: string): boolean {
  return Boolean(left && left.trim().toLowerCase() === right.trim().toLowerCase());
}

function candidateScore(candidate: CompCandidateInput, subject: {
  city: string;
  postalCode: string;
}): number {
  let score = 0;
  if (candidate.postalCode === subject.postalCode) score += 12;
  if (sameText(candidate.city, subject.city)) score += 7;
  if (candidate.communityName) score += 1;
  if (candidate.askingRent && candidate.askingRent > 0) score += 1;
  if (candidate.squareFeet && candidate.squareFeet > 0) score += 1;
  return score;
}

export function proposeCompMembers(input: {
  subjectAddresses: string[];
  city: string;
  postalCode: string;
  candidates: CompCandidateInput[];
  limit?: number;
}): ProposedComp[] {
  const subjectKeys = input.subjectAddresses.map(normalizedAddress).filter(Boolean);
  const unique = new Map<string, CompCandidateInput>();

  for (const candidate of input.candidates) {
    if (!candidate.address) continue;
    const key = normalizedAddress(candidate.address);
    if (!key) continue;
    if (subjectKeys.some((subjectKey) => key.startsWith(subjectKey) || subjectKey.startsWith(key))) continue;
    const current = unique.get(key);
    const candidateTime = candidate.activatedAt?.getTime() ?? 0;
    const currentTime = current?.activatedAt?.getTime() ?? 0;
    if (!current || candidateTime > currentTime) unique.set(key, candidate);
  }

  return [...unique.entries()]
    .sort((left, right) => {
      const scoreDelta = candidateScore(right[1], input) - candidateScore(left[1], input);
      if (scoreDelta !== 0) return scoreDelta;
      return (right[1].activatedAt?.getTime() ?? 0) - (left[1].activatedAt?.getTime() ?? 0);
    })
    .slice(0, input.limit ?? 5)
    .map(([comparisonKey, candidate]) => ({
      ...candidate,
      comparisonKey,
      propertyLabel: candidate.communityName?.trim() || comparisonAddress(candidate.address as string),
      selectionReason:
        candidate.postalCode === input.postalCode
          ? "Same ZIP code"
          : sameText(candidate.city, input.city)
            ? "Same city"
            : "Cleveland MSA fallback",
    }));
}
