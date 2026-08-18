import type { MarketIqBriefingArchivePayload } from "@/lib/market-iq/weekly-briefing";

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function moveLabel(move: MarketIqBriefingArchivePayload["currentMoves"][number]) {
  const direction = move.yearOverYearPct === null
    ? "No year-over-year read"
    : `${move.yearOverYearPct >= 0 ? "+" : ""}${move.yearOverYearPct.toFixed(1)}% YoY`;
  const rent = move.rent === null ? "Rent unavailable" : `$${Math.round(move.rent).toLocaleString("en-US")}`;
  return `${move.marketName}: ${move.geographyLabel}, ${move.segmentLabel}, ${rent}, ${direction}`;
}

export function buildMarketIqInternalBriefingEmail(input: {
  payload: MarketIqBriefingArchivePayload;
  briefingUrl: string;
  recipientName?: string | null;
}) {
  const greeting = input.recipientName?.trim() ? `Hi ${input.recipientName.trim()},` : "Hello,";
  const moves = input.payload.currentMoves.slice(0, 3);
  const subject = `Market IQ weekly briefing: ${dateLabel(input.payload.weekOf)}`;
  const moveHtml = moves.length
    ? `<ul style="margin:12px 0 0;padding-left:20px">${moves.map((move) => `<li style="margin:0 0 8px">${escapeHtml(moveLabel(move))}</li>`).join("")}</ul>`
    : '<p style="margin:12px 0 0;color:#64748b">No current Trends IQ movement was available in this frozen briefing.</p>';
  const moveText = moves.length ? moves.map((move) => `- ${moveLabel(move)}`).join("\n") : "- No current Trends IQ movement was available in this frozen briefing.";

  return {
    subject,
    html: `<div style="margin:0;background:#f7f7f4;padding:32px 16px;font-family:Arial,sans-serif;color:#173a55"><div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #dbe3ea;border-radius:16px;overflow:hidden"><div style="padding:28px 30px;background:#173a55;color:#ffffff"><div style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#9fb4c5">Dwellsy IQ · Market IQ</div><h1 style="margin:12px 0 0;font-size:25px;line-height:1.25">Weekly market briefing</h1><p style="margin:8px 0 0;color:#cbd8e2">Week of ${escapeHtml(dateLabel(input.payload.weekOf))}</p></div><div style="padding:28px 30px"><p style="margin:0 0 16px">${escapeHtml(greeting)}</p><p style="margin:0;font-size:18px;font-weight:700;line-height:1.45">${escapeHtml(input.payload.headline)}</p><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:22px 0"><div style="padding:14px;background:#f3f6f8;border-radius:10px"><strong style="font-size:22px">${input.payload.counts.reviews}</strong><br><span style="font-size:12px;color:#64748b">drafts to review</span></div><div style="padding:14px;background:#f3f6f8;border-radius:10px"><strong style="font-size:22px">${input.payload.counts.exceptions}</strong><br><span style="font-size:12px;color:#64748b">exceptions</span></div></div><h2 style="margin:0;font-size:15px">Largest current moves</h2>${moveHtml}<p style="margin:24px 0 0"><a href="${escapeHtml(input.briefingUrl)}" style="display:inline-block;padding:12px 18px;border-radius:7px;background:#173a55;color:#ffffff;text-decoration:none;font-weight:700">Open frozen briefing</a></p><p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#64748b">This internal message links to a frozen Market IQ record. It is separate from Client Advisory and was not sent to any client or prospect.</p></div></div></div>`,
    text: `${greeting}\n\n${input.payload.headline}\n\nDrafts to review: ${input.payload.counts.reviews}\nExceptions: ${input.payload.counts.exceptions}\n\nLargest current moves\n${moveText}\n\nOpen frozen briefing: ${input.briefingUrl}\n\nThis internal message is separate from Client Advisory and was not sent to any client or prospect.`,
  };
}
