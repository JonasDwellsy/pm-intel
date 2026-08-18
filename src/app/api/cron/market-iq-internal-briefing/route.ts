import { runMarketIqInternalBriefingDryRun } from "@/lib/market-iq/briefing-email-orchestrator.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!marketIqPreviewEnabled()) {
    return Response.json({ error: "Market IQ scheduler is disabled" }, { status: 404 });
  }
  try {
    return Response.json(await runMarketIqInternalBriefingDryRun({ triggerKind: "scheduled" }));
  } catch (error) {
    console.error("[cron/market-iq-internal-briefing] failed", error);
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
