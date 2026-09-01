// GET /api/cron/watch-list-digest — daily Vercel Cron entrypoint. Gating is
// PER-RECIPIENT (see runDigest): each org member is emailed only when there is
// new snapshot data since they were last notified AND their chosen cadence
// (daily/weekly/monthly) throttle has elapsed AND the digest is non-empty — so
// a faster cadence is an upper bound, never a stale or empty send.
// Authenticated by CRON_SECRET (Vercel Cron attaches it as a Bearer token)
// and enabled only by OPERATOR_IQ_SCHEDULER_ENABLED=1.
// Modes: default = send; ?dryRun=1 = compose+count, send nothing, record
// nothing; ?preview=<email> = send one fully-rendered digest to <email>
// (bypasses recipient gating + bookkeeping). The route itself remains inert
// unless the dedicated Dwellsy IQ Markets scheduler flag is enabled.
import { runDigest } from "@/lib/watch-list/digest-run";
import { operatorIqSchedulerEnabled } from "@/lib/operator-iq/feature";

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
  if (!operatorIqSchedulerEnabled()) {
    return Response.json({ error: "Dwellsy IQ Markets scheduler is disabled" }, { status: 404 });
  }
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
