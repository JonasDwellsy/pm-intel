import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import {
  DIGEST_KIND,
  digestKindFromRunId,
} from "@/lib/email/digest-delivery-ledger";
import { DigestPreviewPanel } from "./DigestPreviewPanel";

// Admin → Digests. Send yourself a preview of the watch-list change-alert
// digest (no CRON_SECRET needed) and see reconciled delivery outcomes for both
// scheduled digest types. Auth: gated by src/app/admin/layout.tsx.

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Digests · Admin",
  robots: { index: false, follow: false },
};

function fmtWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
      timeZoneName: "short",
    });
  } catch {
    return iso;
  }
}

function statusClass(status: string): string {
  if (status === "completed") return "text-green-700";
  if (status === "completed_with_errors") return "text-amber-600";
  if (status === "running") return "text-grey-600";
  return "text-red-700"; // failed / anything else
}

function digestLabel(kind: string): string {
  if (kind === DIGEST_KIND.watchList) return "Watch list";
  if (kind === DIGEST_KIND.marketBrief) return "Market brief";
  return kind;
}

export default async function AdminDigestsPage() {
  const runs = await prisma.watchListDigestRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 12,
    select: {
      id: true,
      snapshotDate: true,
      status: true,
      startedAt: true,
      sends: { select: { status: true } },
    },
  });

  return (
    <div className="mx-auto max-w-[1100px] px-6 pb-16">
      <h1 className="text-[20px] font-semibold text-navy mb-1">Digests</h1>
      <p className="text-[13px] text-grey-600 mb-6 max-w-[680px]">
        The watch-list change-alert digest emails each org member (unless they
        unsubscribe) when their watched operators change, on their chosen
        cadence. Use the preview below to send yourself one fully-rendered
        digest — it bypasses all gating and never emails real recipients, so
        it&rsquo;s safe to run anytime.
      </p>

      <section className="mb-10">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-grey-600 mb-3">
          Preview
        </h2>
        <DigestPreviewPanel />
      </section>

      <section>
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-grey-600 mb-3">
          Recent scheduled runs
        </h2>
        {runs.length === 0 ? (
          <p className="text-[13px] text-grey-600">No runs recorded yet.</p>
        ) : (
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr className="text-left text-grey-600 border-b border-grid">
                <th className="py-2 pr-4 font-medium">Started (UTC)</th>
                <th className="py-2 pr-4 font-medium">Digest</th>
                <th className="py-2 pr-4 font-medium">Snapshot</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium text-right">Attempted</th>
                <th className="py-2 pr-4 font-medium text-right">Sent</th>
                <th className="py-2 pr-4 font-medium text-right">Failed</th>
                <th className="py-2 pr-4 font-medium text-right">Uncertain</th>
                <th className="py-2 font-medium text-right">In progress</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-grid/60">
                  <td className="py-2 pr-4 text-navy">{fmtWhen(r.startedAt.toISOString())}</td>
                  <td className="py-2 pr-4 text-grey-600">
                    {digestLabel(digestKindFromRunId(r.id))}
                  </td>
                  <td className="py-2 pr-4 text-grey-600">
                    {r.snapshotDate.toISOString().slice(0, 10)}
                  </td>
                  <td className={`py-2 pr-4 font-medium ${statusClass(r.status)}`}>{r.status}</td>
                  <td className="py-2 pr-4 text-right text-navy">{r.sends.length}</td>
                  <td className="py-2 pr-4 text-right text-navy">
                    {r.sends.filter((send) => send.status === "sent").length}
                  </td>
                  <td className="py-2 pr-4 text-right text-navy">
                    {r.sends.filter((send) => send.status === "failed").length}
                  </td>
                  <td className="py-2 pr-4 text-right text-navy">
                    {r.sends.filter((send) => send.status === "uncertain").length}
                  </td>
                  <td className="py-2 text-right text-navy">
                    {r.sends.filter((send) => send.status === "claimed").length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
