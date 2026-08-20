import { runPortfolioIqDigests } from "@/lib/portfolio-iq/digest-run.server";
import { portfolioIqSchedulerEnabled } from "@/lib/portfolio-iq/feature";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!portfolioIqSchedulerEnabled()) {
    return Response.json({ error: "Portfolio IQ scheduler is disabled" }, { status: 404 });
  }
  const url = new URL(request.url);
  try {
    return Response.json(await runPortfolioIqDigests({ dryRun: url.searchParams.get("dryRun") === "1", baseUrl: url.origin }));
  } catch (error) {
    console.error("[cron/portfolio-iq-digest] failed", error);
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
