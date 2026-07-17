// POST   /api/watch-lists/[id]/members — pin a company (add a member).
// DELETE /api/watch-lists/[id]/members — unpin a company (remove a member).
//
// v0.26 — manual-pin watch lists ("kind": "pinned"). Mutations are
// owner-only: canEditList (own list, or a legacy-owned list in your
// org) is enforced INSIDE addMember/removeMember, not here — this
// route just resolves auth context and shapes the response, mirroring
// ../route.ts. A false return from either store fn collapses
// "list doesn't exist" and "not authorized to edit it" into the same
// 404, so we never leak the existence of another org's (or another
// user's private) watch list.

import { auth } from "@clerk/nextjs/server";
import { addMember, removeMember } from "@/lib/watch-list/store";
import { getActiveOrgId } from "@/lib/auth/active-org";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Shared boilerplate: resolve userId + organizationId, return early
 *  with the appropriate error response on failure. Mirrors
 *  ../route.ts's resolveAuthContext(). */
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

function readMemberKey(body: unknown): string | null {
  const input = body as { memberKey?: unknown };
  if (typeof input.memberKey !== "string" || input.memberKey.length === 0) {
    return null;
  }
  return input.memberKey;
}

export async function POST(req: Request, { params }: RouteParams) {
  const ctx = await resolveAuthContext();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const memberKey = readMemberKey(body);
  if (!memberKey) {
    return Response.json({ error: "memberKey is required." }, { status: 422 });
  }

  const ok = await addMember(id, memberKey, {
    userId: ctx.userId,
    organizationId: ctx.organizationId,
  });
  if (!ok) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: Request, { params }: RouteParams) {
  const ctx = await resolveAuthContext();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const memberKey = readMemberKey(body);
  if (!memberKey) {
    return Response.json({ error: "memberKey is required." }, { status: 422 });
  }

  const ok = await removeMember(id, memberKey, {
    userId: ctx.userId,
    organizationId: ctx.organizationId,
  });
  if (!ok) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({ ok: true });
}
