// POST /api/buy-boxes/preview — run the apply engine against an
// in-memory draft buy box without persisting anything.
//
// Powers the editor's live match-count strip + "Preview top 10"
// panel. The body is the same three criterion arrays the editor
// manages in state; the response is a compact summary plus the top
// ten ranked matches (slug, name, market, fit score) so the panel
// can render without re-fetching.
//
// No id is required — we synthesize a draft id since applyBuyBox
// expects a BuyBoxDefinition.id field for its result envelope, and
// the caller throws away the id anyway.

import { applyBuyBox } from "@/lib/buy-box/apply";
import type { BuyBoxDefinition } from "@/lib/buy-box/scoring";

export interface PreviewResponse {
  totalCandidates: number;
  matchedCount: number;
  /** null when zero matches — UI shows a dash. */
  scoreMin: number | null;
  scoreMax: number | null;
  topTen: Array<{
    slug: string;
    name: string;
    market: string;
    fitScore: number;
  }>;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const input = body as {
    requiredCriteria?: unknown;
    preferredCriteria?: unknown;
    excludedCriteria?: unknown;
  };
  if (
    !Array.isArray(input.requiredCriteria) ||
    !Array.isArray(input.preferredCriteria) ||
    !Array.isArray(input.excludedCriteria)
  ) {
    return Response.json(
      {
        error:
          "requiredCriteria, preferredCriteria, excludedCriteria must be arrays.",
      },
      { status: 422 }
    );
  }

  const draft: BuyBoxDefinition = {
    id: "draft",
    name: "draft",
    requiredCriteria: input.requiredCriteria as never,
    preferredCriteria: input.preferredCriteria as never,
    excludedCriteria: input.excludedCriteria as never,
  };

  const result = await applyBuyBox(draft);

  const scores = result.results.map((r) => r.fitScore);
  const scoreMin = scores.length > 0 ? Math.min(...scores) : null;
  const scoreMax = scores.length > 0 ? Math.max(...scores) : null;

  const topTen = result.results.slice(0, 10).map((r) => ({
    slug: r.pmSlug,
    name: r.name,
    market: r.marketName,
    fitScore: r.fitScore,
  }));

  const response: PreviewResponse = {
    totalCandidates: result.totalCandidates,
    matchedCount: result.matchedCount,
    scoreMin,
    scoreMax,
    topTen,
  };
  return Response.json(response);
}
