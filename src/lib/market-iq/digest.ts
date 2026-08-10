import { marketIqAlertMatchesWatchlist, type MarketIqWatchlistView } from "@/lib/market-iq/watchlists";

export type MarketIqDigestAlert = {
  id: string;
  geographyType: string;
  geographyValue: string;
  propertyType: string;
  bedrooms: number;
  severity: string;
  headline: string;
  narrative: string;
  observedMonth: Date;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function buildMarketIqDigest({
  recipientName,
  watchlists,
  alerts,
  dashboardUrl,
}: {
  recipientName: string | null;
  watchlists: MarketIqWatchlistView[];
  alerts: MarketIqDigestAlert[];
  dashboardUrl: string;
}) {
  const scopedAlerts = alerts
    .filter((alert) => watchlists.some((watchlist) => marketIqAlertMatchesWatchlist(alert, watchlist)))
    .sort((a, b) =>
      b.observedMonth.getTime() - a.observedMonth.getTime() ||
      Number(b.severity === "material") - Number(a.severity === "material")
    );
  const includedAlerts = scopedAlerts.slice(0, 8);
  const greeting = recipientName ? `Hi ${recipientName},` : "Hello,";
  const subject = includedAlerts.length
    ? `Market IQ: ${includedAlerts.length} Cleveland market signal${includedAlerts.length === 1 ? "" : "s"}`
    : "Market IQ: your Cleveland watchlist is steady";
  const intro = includedAlerts.length
    ? `${includedAlerts.length} market signal${includedAlerts.length === 1 ? "" : "s"} matched your saved Market IQ watchlists.`
    : "No material asking-rent changes matched your saved Market IQ watchlists in the latest trend update.";
  const alertText = includedAlerts.length
    ? includedAlerts.map((alert) => `• ${alert.headline}\n  ${alert.narrative}`).join("\n\n")
    : "No material changes this period.";
  const text = `${greeting}\n\n${intro}\n\n${alertText}\n\nOpen Market IQ: ${dashboardUrl}\n\nMarket IQ reports asking-market intelligence. It does not measure occupancy, signed leases, or effective rent.`;
  const alertHtml = includedAlerts.length
    ? includedAlerts.map((alert) => `
      <div style="border:1px solid #d7dee8;border-radius:10px;padding:18px;margin:0 0 12px;background:#ffffff">
        <div style="color:#a4511b;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">${escapeHtml(alert.severity)}</div>
        <h2 style="color:#0c1f44;font-size:18px;line-height:1.35;margin:6px 0 8px">${escapeHtml(alert.headline)}</h2>
        <p style="color:#465166;font-size:14px;line-height:1.6;margin:0">${escapeHtml(alert.narrative)}</p>
      </div>`).join("")
    : `<div style="border:1px solid #bcdce7;border-radius:10px;padding:18px;background:#edf8fb;color:#0c1f44">No material changes this period.</div>`;
  const html = `<!doctype html>
  <html><body style="margin:0;background:#f5f7fa;font-family:Arial,sans-serif;color:#18233a">
    <div style="max-width:660px;margin:0 auto;padding:28px 18px">
      <div style="background:#0c1f44;border-radius:12px 12px 0 0;padding:22px 26px;color:#ffffff">
        <div style="color:#ffcf25;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">Dwellsy IQ</div>
        <div style="font-size:25px;font-weight:700;margin-top:5px">Market IQ weekly watch</div>
      </div>
      <div style="background:#ffffff;border:1px solid #d7dee8;border-top:0;border-radius:0 0 12px 12px;padding:26px">
        <p style="font-size:15px;line-height:1.6;margin:0 0 12px">${escapeHtml(greeting)}</p>
        <p style="font-size:15px;line-height:1.6;margin:0 0 22px">${escapeHtml(intro)}</p>
        ${alertHtml}
        <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;margin-top:12px;background:#0c1f44;color:#ffffff;text-decoration:none;font-weight:700;border-radius:7px;padding:12px 18px">Open Market IQ</a>
        <p style="color:#687386;font-size:12px;line-height:1.6;margin:24px 0 0;border-top:1px solid #e3e8ef;padding-top:18px">Market IQ reports high-frequency asking-market intelligence. It does not measure occupancy, signed leases, or effective rent.</p>
      </div>
    </div>
  </body></html>`;
  return { subject, text, html, alertCount: includedAlerts.length };
}
