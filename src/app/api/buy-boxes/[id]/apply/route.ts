// POST /api/buy-boxes/[id]/apply — run the saved buy box against the
// full operator universe, return the ranked TargetListResult. Scoped
// to the authenticated Clerk user: a buy box owned by a different
// user returns 404 (matching the GET behaviour) so we don't leak
// existence.
//
// applyBuyBox loads every PM in the database and evaluates each. For
// the current 10-market footprint (~694 PMs) this is one DB read +
// ~694 in-memory evaluator calls per request — well under 1s
// end-to-end. As coverage scales we'll need pagination + caching;
// flagged for v2.

import { auth } from "@clerk/nextjs/server";
import { applyBuyBox } from "@/lib/buy-box/apply";
import { getBuyBox } from "@/lib/buy-box/store";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_req: Request, { params }: RouteParams) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { id } = await params;
  const buyBox = await getBuyBox(id, userId);
  if (!buyBox) return Response.json({ error: "Not found." }, { status: 404 });

  const result = await applyBuyBox(buyBox);
  return Response.json(result);
}
