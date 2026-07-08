// GET /api/cron/watch-list-digest — daily Vercel Cron entrypoint. No-ops
// unless a new OperatorSnapshot date has appeared since the last completed
// run. Gated by CRON_SECRET (Vercel Cron attaches it as a Bearer token).
// Modes: default = send; ?dryRun=1 = compose+count, send nothing, record
// nothing; ?preview=<email> = send one fully-rendered digest to <email>,
// bypassing the idempotency guard.
import { runDigest } from "@/lib/watch-list/digest-run";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const previewEmail = url.searchParams.get("preview") ?? undefined;
  try {
    const summary = await runDigest({ mode: dryRun ? "dryRun" : "send", previewEmail });
    return Response.json(summary);
  } catch (err) {
    console.error("[cron/watch-list-digest] failed:", err);
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
