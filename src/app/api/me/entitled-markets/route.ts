// v0.22 — the viewer's entitled market ids, for client-side scoping of
// the global search (a static index shipped to the browser). Anonymous
// visitors get "all" (search is a funnel into the login wall, which then
// gates the scorecard); signed-in users get their org's entitled set
// (admin / all-markets orgs also get "all").

import { resolveViewerEntitlementForPublicSurface } from "@/lib/auth/market-entitlements.server";
import { ALL_MARKETS } from "@/lib/auth/market-entitlements";

export const dynamic = "force-dynamic";

export async function GET() {
  const ent = await resolveViewerEntitlementForPublicSurface();
  const entitled: "all" | string[] =
    ent === undefined || ent === ALL_MARKETS ? "all" : [...ent];
  return Response.json({ entitled });
}
