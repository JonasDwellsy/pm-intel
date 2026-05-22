// POST /api/watch-lists/[id]/apply — run the saved watch list against the
// full operator universe, return the ranked TargetListResult.
//
// v0.18 (PR #65) — Multi-tenancy: scoped to the caller's active org.
// A watch list in a different org returns 404 (matching GET) so we
// don't leak existence. The 503 path covers the brief workspace-
// setup window after signup.
//
// applyWatchList loads every PM in the database and evaluates each.
// For the current 10-market footprint (~694 PMs) this is one DB
// read + ~694 in-memory evaluator calls per request — well under
// 1s end-to-end. As coverage scales we'll need pagination + caching;
// flagged for v2.

import { auth } from "@clerk/nextjs/server";
import { applyWatchList } from "@/lib/watch-list/apply";
import { getWatchList } from "@/lib/watch-list/store";
import { getActiveOrgId } from "@/lib/auth/active-org";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_req: Request, { params }: RouteParams) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const organizationId = await getActiveOrgId();
  if (!organizationId) {
    return Response.json(
      {
        error: "Workspace not yet provisioned. Try again in a moment.",
        workspaceSetupRequired: true,
      },
      { status: 503 }
    );
  }
  const { id } = await params;
  const watchList = await getWatchList(id, organizationId);
  if (!watchList) return Response.json({ error: "Not found." }, { status: 404 });

  const result = await applyWatchList(watchList);
  return Response.json(result);
}
