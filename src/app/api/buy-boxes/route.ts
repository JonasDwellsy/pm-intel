// GET /api/buy-boxes — list all (org-shared)
// POST /api/buy-boxes — create
//
// Auth is deferred (per the v0.8 spec — every buy box is shared at
// org level for MVP). When per-user auth lands, gate these handlers
// on the authenticated user id and respect isShared at read time.

import { createBuyBox, listBuyBoxes } from "@/lib/buy-box/store";

export async function GET() {
  const rows = await listBuyBoxes();
  return Response.json({ buyBoxes: rows });
}

export async function POST(req: Request) {
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

  const record = await createBuyBox({
    name: input.name,
    description: typeof input.description === "string" ? input.description : null,
    requiredCriteria: input.requiredCriteria as never,
    preferredCriteria: input.preferredCriteria as never,
    excludedCriteria: input.excludedCriteria as never,
  });
  return Response.json({ buyBox: record }, { status: 201 });
}
