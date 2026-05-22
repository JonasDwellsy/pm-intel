// GET  /api/watch-lists — list watch lists in the caller's active org.
// POST /api/watch-lists — create a new watch list in the caller's active org.
//
// Both handlers run AFTER Clerk's middleware (see middleware.ts) has
// already verified the caller has an active session — auth.protect()
// on this route would redirect/404 anonymous requests before we ever
// got here. We still call auth() to grab the userId for the
// ownerId column (forensics) and getActiveOrgId() to resolve the
// org scope for authorization.
//
// v0.18 (PR #65) — Multi-tenancy: organizationId is the authorization
// key. When getActiveOrgId() returns null (user's personal-org
// provisioning hasn't completed yet), we return 503 with a clear
// message — the client-side editor surfaces it as "workspace still
// setting up" UI.

import { auth } from "@clerk/nextjs/server";
import { createWatchList, listWatchListes } from "@/lib/watch-list/store";
import { captureServerEvent } from "@/lib/analytics-server";
import { getActiveOrgId } from "@/lib/auth/active-org";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const organizationId = await getActiveOrgId();
  if (!organizationId) {
    // Soft fallback — user's personal org isn't provisioned yet.
    // The /setup-workspace page handles the retry loop; API
    // callers see a 503 with retry-after guidance.
    return Response.json(
      {
        error: "Workspace not yet provisioned. Try again in a moment.",
        workspaceSetupRequired: true,
      },
      { status: 503 }
    );
  }
  const rows = await listWatchListes(organizationId);
  return Response.json({ watchListes: rows });
}

export async function POST(req: Request) {
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const input = body as {
    name?: unknown;
    description?: unknown;
    requiredCriteria?: unknown;
    preferredCriteria?: unknown;
    excludedCriteria?: unknown;
  };
  if (typeof input.name !== "string" || input.name.length === 0) {
    return Response.json({ error: "name is required." }, { status: 422 });
  }
  if (!Array.isArray(input.requiredCriteria) ||
      !Array.isArray(input.preferredCriteria) ||
      !Array.isArray(input.excludedCriteria)) {
    return Response.json(
      { error: "requiredCriteria, preferredCriteria, excludedCriteria must be arrays." },
      { status: 422 }
    );
  }

  const record = await createWatchList({
    name: input.name,
    description: typeof input.description === "string" ? input.description : null,
    ownerId: userId,
    organizationId,
    isShared: false,
    requiredCriteria: input.requiredCriteria as never,
    preferredCriteria: input.preferredCriteria as never,
    excludedCriteria: input.excludedCriteria as never,
  });

  // v0.17 — Server-side capture so we never lose the conversion if
  // the client tab closes between POST and the redirect to /results.
  // initial_operator_count counts CRITERIA, not matched operators —
  // the matched count requires an applyWatchList() pass which we
  // intentionally don't do here (creation is the conversion, not the
  // first results render). Match-count fires from /results via the
  // watch_list_viewed event instead.
  const initialCriteriaCount =
    (input.requiredCriteria as unknown[]).length +
    (input.preferredCriteria as unknown[]).length +
    (input.excludedCriteria as unknown[]).length;
  captureServerEvent({
    userId,
    event: "watch_list_created",
    properties: {
      watch_list_id: record.id,
      initial_operator_count: initialCriteriaCount,
      // v0.18 — tag with org for org-level funnel analytics.
      organization_id: organizationId,
    },
  });

  return Response.json({ watchList: record }, { status: 201 });
}
