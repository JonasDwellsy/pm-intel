// GET  /api/watch-lists — list the authenticated user's saved watch lists.
// POST /api/watch-lists — create a new watch list owned by the authenticated user.
//
// Both handlers run AFTER Clerk's middleware (see middleware.ts) has
// already verified the caller has an active session — auth.protect()
// on this route would redirect/404 anonymous requests before we ever
// got here. We still call auth() to grab the userId for the
// ownerId column; the auth() helper is request-scoped and reads
// straight from the verified Clerk session cookie.

import { auth } from "@clerk/nextjs/server";
import { createWatchList, listWatchListes } from "@/lib/watch-list/store";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const rows = await listWatchListes(userId);
  return Response.json({ watchListes: rows });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
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
    isShared: false,
    requiredCriteria: input.requiredCriteria as never,
    preferredCriteria: input.preferredCriteria as never,
    excludedCriteria: input.excludedCriteria as never,
  });
  return Response.json({ watchList: record }, { status: 201 });
}
