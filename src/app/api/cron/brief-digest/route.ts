// GET /api/cron/brief-digest — Vercel Cron entrypoint for the scheduled
// market-brief email. Per-recipient gating (see runBriefDigest): each org
// member is emailed only when a new snapshot has landed since they were last
// notified AND their cadence throttle has elapsed AND there's something to
// report. Authenticated by CRON_SECRET (Vercel Cron attaches it as a Bearer
// token) and enabled only by OPERATOR_IQ_SCHEDULER_ENABLED=1.
// Modes: default = send; ?dryRun=1 = compose+count, send/record nothing;
// ?preview=<email> = one fully-rendered digest to <email> (bypasses recipient
// gating). The route itself remains inert unless the dedicated Operator IQ
// scheduler flag is enabled.
// INERT until SENDGRID_API_KEY + DIGEST_FROM_EMAIL + CRON_SECRET +
// DIGEST_UNSUB_SECRET + OPERATOR_IQ_SCHEDULER_ENABLED=1 are set in Vercel.
import { runBriefDigest } from "@/lib/briefs-digest/run";
import { operatorIqSchedulerEnabled } from "@/lib/operator-iq/feature";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!operatorIqSchedulerEnabled()) {
    return Response.json({ error: "Operator IQ scheduler is disabled" }, { status: 404 });
  }
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const previewEmail = url.searchParams.get("preview") ?? undefined;
  try {
    const summary = await runBriefDigest({ mode: dryRun ? "dryRun" : "send", previewEmail });
    return Response.json(summary);
  } catch (err) {
    console.error("[cron/brief-digest] failed:", err);
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
