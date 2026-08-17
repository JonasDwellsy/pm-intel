import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { runMarketIqEditionOrchestrator } from "@/lib/market-iq/report/edition-orchestrator.server";

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
  const url = new URL(request.url);
  try {
    return Response.json(await runMarketIqEditionOrchestrator({
      dryRun: url.searchParams.get("dryRun") === "1",
      triggerKind: "scheduled",
    }));
  } catch (error) {
    console.error("[cron/market-iq-editions] failed", error);
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
