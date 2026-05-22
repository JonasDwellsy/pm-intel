// POST /api/watch-lists/[id]/apply — run the saved watch list against the
// full operator universe, return the ranked TargetListResult. Scoped
// to the authenticated Clerk user: a watch list owned by a different
// user returns 404 (matching the GET behaviour) so we don't leak
// existence.
//
// applyWatchList loads every PM in the database and evaluates each. For
// the current 10-market footprint (~694 PMs) this is one DB read +
// ~694 in-memory evaluator calls per request — well under 1s
// end-to-end. As coverage scales we'll need pagination + caching;
// flagged for v2.

import { auth } from "@clerk/nextjs/server";
import { applyWatchList } from "@/lib/watch-list/apply";
import { getWatchList } from "@/lib/watch-list/store";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_req: Request, { params }: RouteParams) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { id } = await params;
  const watchList = await getWatchList(id, userId);
  if (!watchList) return Response.json({ error: "Not found." }, { status: 404 });

  const result = await applyWatchList(watchList);
  return Response.json(result);
}
