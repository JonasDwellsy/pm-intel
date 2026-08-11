import { runPortfolioMonitoring } from "@/lib/portfolio-iq/monitoring-run.server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  try {
    return Response.json(await runPortfolioMonitoring({ dryRun: url.searchParams.get("dryRun") === "1", triggerKind: "scheduled" }));
  } catch (error) {
    console.error("[cron/portfolio-iq-monitoring] failed", error);
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
