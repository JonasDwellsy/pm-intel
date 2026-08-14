import Link from "next/link";
import { CopyMarketReportLink } from "@/components/market-iq/CopyMarketReportLink";
import { revokeMarketIqReport, sendMarketIqReport } from "@/app/market-iq/report/actions";

type Report = {
  id: string;
  publicToken: string;
  status: string;
  publishedAt: Date | null;
  createdAt: Date;
  sends: Array<{
    id: string;
    deliveryStatus: string;
    sentAt: Date | null;
    deliveredAt: Date | null;
    deliveryError: string | null;
    lastEmailEventAt: Date | null;
    lastEmailEventType: string | null;
    recipient: { name: string; email: string; kind: string };
  }>;
};

function dateLabel(value: Date | string | null) {
  return value ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "Not published";
}

export function MarketIqReportHistory({ reports, highlightedId, delivery }: { reports: Report[]; highlightedId?: string; delivery?: string }) {
  return <section className="rounded-xl border border-grid bg-white p-5">
    <p className="dq-eyebrow">Report history</p>
    <h2 className="dq-h2">Published links</h2>
    {delivery === "sent" && <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">SendGrid accepted the PM-branded report email. Delivery events will update below.</p>}
    {delivery === "failed" && <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">SendGrid did not accept the email. Review the delivery record below before retrying.</p>}
    {reports.length ? <div className="mt-4 divide-y divide-grid">{reports.map((report) => {
      const latest = report.sends[0] ?? null;
      return <article key={report.id} className={`py-4 first:pt-0 ${highlightedId === report.id ? "rounded-lg bg-teal-soft px-3" : ""}`}>
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-sm font-semibold text-navy">Cleveland client report</p><p className="mt-1 text-xs capitalize text-muted-foreground">{report.status} · {dateLabel(report.publishedAt ?? report.createdAt)}</p></div>
          <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${report.status === "published" ? "bg-emerald-50 text-emerald-800" : "bg-surface-soft text-muted-foreground"}`}>{report.status}</span>
        </div>
        {report.status === "published" && <>
          <div className="mt-3 flex flex-wrap gap-2">
            <CopyMarketReportLink path={`/reports/market/${report.publicToken}`} />
            <Link href={`/reports/market/${report.publicToken}`} target="_blank" className="rounded-md bg-navy px-3 py-2 text-xs font-semibold text-white">Open client view</Link>
            <Link href={`/reports/market/${report.publicToken}/pdf`} target="_blank" className="rounded-md border border-grid bg-white px-3 py-2 text-xs font-semibold text-navy">Download PDF</Link>
            <form action={revokeMarketIqReport}><input type="hidden" name="reportId" value={report.id} /><button className="rounded-md border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-800">Revoke</button></form>
          </div>
          <details className="mt-3 rounded-lg border border-grid bg-white px-3 py-3">
            <summary className="cursor-pointer text-xs font-semibold text-navy">Email this report as your firm</summary>
            <form action={sendMarketIqReport} className="mt-4 grid gap-3">
              <input type="hidden" name="reportId" value={report.id} />
              <label className="text-xs font-semibold text-navy">Recipient name<input name="recipientName" required maxLength={120} className="mt-1.5 w-full rounded-md border border-grid px-3 py-2 text-sm font-normal" /></label>
              <label className="text-xs font-semibold text-navy">Recipient email<input name="recipientEmail" required type="email" maxLength={254} className="mt-1.5 w-full rounded-md border border-grid px-3 py-2 text-sm font-normal" /></label>
              <label className="text-xs font-semibold text-navy">Relationship<select name="recipientKind" defaultValue="client" className="mt-1.5 w-full rounded-md border border-grid bg-white px-3 py-2 text-sm font-normal"><option value="client">Current client</option><option value="prospect">Prospect</option></select></label>
              <button className="rounded-md bg-navy px-3 py-2.5 text-xs font-semibold text-white">Send market advisory</button>
              <p className="text-[11px] leading-5 text-muted-foreground">The email uses your firm name and reply-to contact. It links only to this immutable report and its PDF.</p>
            </form>
          </details>
        </>}
        {latest && <div className="mt-3 rounded-md bg-surface-soft px-3 py-2 text-[11px] leading-5 text-muted-foreground">
          <p><span className="font-semibold text-navy">Latest delivery:</span> {latest.recipient.name} ({latest.recipient.kind}) · <span className="font-semibold capitalize">{latest.deliveryStatus}</span>{latest.lastEmailEventType ? ` · ${latest.lastEmailEventType}` : ""}</p>
          <p>{latest.deliveredAt ? `Delivered ${dateLabel(latest.deliveredAt)}` : latest.sentAt ? `Accepted ${dateLabel(latest.sentAt)}` : latest.deliveryError ? latest.deliveryError : "Awaiting provider acceptance"}</p>
        </div>}
      </article>;
    })}</div> : <p className="mt-3 text-sm leading-6 text-muted-foreground">No client reports have been published yet.</p>}
  </section>;
}
