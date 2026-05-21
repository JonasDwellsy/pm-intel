// POST /api/buy-boxes/[id]/apply — run the saved buy box against the
// full operator universe, return the ranked TargetListResult.
//
// applyBuyBox loads every PM in the database and evaluates each. For
// the current 10-market footprint (~694 PMs) this is one DB read +
// ~694 in-memory evaluator calls per request — well under 1s
// end-to-end. As coverage scales we'll need pagination + caching;
// flagged for v2.

import { applyBuyBox } from "@/lib/buy-box/apply";
import { getBuyBox } from "@/lib/buy-box/store";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const buyBox = await getBuyBox(id);
  if (!buyBox) return Response.json({ error: "Not found." }, { status: 404 });

  const result = await applyBuyBox(buyBox);
  return Response.json(result);
}
