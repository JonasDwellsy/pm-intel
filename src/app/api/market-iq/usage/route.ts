import { NextResponse } from "next/server";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { recordUsageEventAwait } from "@/lib/usage/record";

const ROUTES: Array<[RegExp, string]> = [
  [/^\/market-iq$/, "home"],
  [/^\/market-iq\/market(?:\/|$)/, "market_intelligence"],
  [/^\/market-iq\/editions(?:\/|$)/, "client_reports"],
  [/^\/market-iq\/(?:distribution|published|delivery)(?:\/|$)/, "sharing"],
  [/^\/market-iq\/(?:get-started|launch)(?:\/|$)/, "setup"],
  [/^\/market-iq\/(?:subscribe|account)(?:\/|$)/, "account"],
  [/^\/market-iq\/(?:report|review)(?:\/|$)/, "report_workflow"],
];

export async function POST(request: Request) {
  const { userId, clerkOrgId } = await getActiveOrgContext();
  if (!userId) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await request.json().catch(() => null) as { pathname?: unknown } | null;
  const pathname = typeof body?.pathname === "string" ? body.pathname : "";
  const route = ROUTES.find(([pattern]) => pattern.test(pathname));
  if (!route) return NextResponse.json({ ok: false }, { status: 400 });

  await recordUsageEventAwait({
    userId,
    orgId: clerkOrgId,
    eventName: "market_iq_page_view",
    targetKind: "market_iq_page",
    targetSlug: route[1],
  });
  return NextResponse.json({ ok: true });
}
