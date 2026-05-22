// GET    /api/watch-lists/[id] — fetch one (scoped to caller's active org).
// PUT    /api/watch-lists/[id] — update (scoped to caller's active org).
// DELETE /api/watch-lists/[id] — remove (scoped to caller's active org).
//
// v0.18 (PR #65) — Multi-tenancy: organizationId is the authorization
// key. Requests for watch lists in a different org return 404 (not
// 403) so we don't leak the existence of other orgs' rows.
//
// The middleware already requires a signed-in session to reach these
// routes, so userId is effectively guaranteed — the early 401 is just
// belt-and-suspenders. The 503 path covers the brief window after
// signup where the user's personal org isn't provisioned yet.

import { auth } from "@clerk/nextjs/server";
import {
  deleteWatchList,
  getWatchList,
  updateWatchList,
} from "@/lib/watch-list/store";
import { getActiveOrgId } from "@/lib/auth/active-org";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Shared boilerplate: resolve userId + organizationId, return early
 *  with the appropriate error response on failure. */
async function resolveAuthContext(): Promise<
  | { error: Response }
  | { userId: string; organizationId: string }
> {
  const { userId } = await auth();
  if (!userId) {
    return {
      error: Response.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }
  const organizationId = await getActiveOrgId();
  if (!organizationId) {
    return {
      error: Response.json(
        {
          error: "Workspace not yet provisioned. Try again in a moment.",
          workspaceSetupRequired: true,
        },
        { status: 503 }
      ),
    };
  }
  return { userId, organizationId };
}

export async function GET(_req: Request, { params }: RouteParams) {
  const ctx = await resolveAuthContext();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const record = await getWatchList(id, ctx.organizationId);
  if (!record) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({ watchList: record });
}

export async function PUT(req: Request, { params }: RouteParams) {
  const ctx = await resolveAuthContext();
  if ("error" in ctx) return ctx.error;
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
    ctx.organizationId
  );
  if (!updated) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({ watchList: updated });
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const ctx = await resolveAuthContext();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const ok = await deleteWatchList(id, ctx.organizationId);
  if (!ok) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({ ok: true });
}
