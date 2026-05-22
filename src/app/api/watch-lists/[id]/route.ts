// GET    /api/watch-lists/[id] — fetch one (owned by current user).
// PUT    /api/watch-lists/[id] — update (owned by current user).
// DELETE /api/watch-lists/[id] — remove (owned by current user).
//
// Every handler scopes the row by the authenticated Clerk user id;
// requests for watch lists that belong to a different user return 404
// (not 403) so we don't leak the existence of other users' boxes.
// The middleware already requires a signed-in session to reach these
// routes, so userId is effectively guaranteed — the early 401 is just
// belt-and-suspenders in case the matcher is ever loosened.

import { auth } from "@clerk/nextjs/server";
import {
  deleteWatchList,
  getWatchList,
  updateWatchList,
} from "@/lib/watch-list/store";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { id } = await params;
  const record = await getWatchList(id, userId);
  if (!record) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({ watchList: record });
}

export async function PUT(req: Request, { params }: RouteParams) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const input = body as Record<string, unknown>;

  // Light validation — full schema validation lives in the editor UI
  // in PR #2. Here we just guard the critical shapes.
  for (const key of ["requiredCriteria", "preferredCriteria", "excludedCriteria"] as const) {
    if (input[key] !== undefined && !Array.isArray(input[key])) {
      return Response.json({ error: `${key} must be an array.` }, { status: 422 });
    }
  }

  const updated = await updateWatchList(
    id,
    {
      name: typeof input.name === "string" ? input.name : undefined,
      description:
        typeof input.description === "string" || input.description === null
          ? (input.description as string | null)
          : undefined,
      requiredCriteria: input.requiredCriteria as never,
      preferredCriteria: input.preferredCriteria as never,
      excludedCriteria: input.excludedCriteria as never,
    },
    userId
  );
  if (!updated) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({ watchList: updated });
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { id } = await params;
  const ok = await deleteWatchList(id, userId);
  if (!ok) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({ ok: true });
}
