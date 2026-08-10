export interface PortfolioDigestSignal {
  severity: string;
  category: string;
  headline: string;
  narrative: string;
  ownerQuestion: string | null;
  asset: { slug: string; name: string } | null;
  decision?: { state: string; assignedTo: string | null } | null;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

export function buildPortfolioIqDigest(input: {
  portfolioName: string;
  recipientName: string | null;
  dashboardUrl: string;
  signals: PortfolioDigestSignal[];
  preview?: boolean;
}) {
  const included = input.signals.slice(0, 8);
  const attention = included.filter((signal) => signal.severity === "high").length;
  const market = included.filter((signal) => signal.category === "market").length;
  const readiness = included.filter((signal) => signal.category === "readiness").length;
  const greeting = input.recipientName ? `Hi ${input.recipientName},` : "Hello,";
  const summary = attention
    ? `${attention} propert${attention === 1 ? "y" : "ies"} need attention${market ? `, with ${market} local-market change${market === 1 ? "" : "s"}` : ""}.`
    : included.length
      ? `${included.length} portfolio update${included.length === 1 ? "" : "s"} are ready, including ${readiness} setup item${readiness === 1 ? "" : "s"}.`
      : "No material Portfolio Watch changes were detected this week.";
  const subject = `${input.preview ? "[preview] " : ""}Portfolio IQ: ${summary}`;
  const textSignals = included.map((signal) => `• ${signal.headline}\n  ${signal.narrative}${signal.ownerQuestion ? `\n  Ask: ${signal.ownerQuestion}` : ""}${signal.decision?.assignedTo ? `\n  Assigned to: ${signal.decision.assignedTo}` : ""}`).join("\n\n");
  const text = `${greeting}\n\n${summary}\n\n${textSignals || "No material changes this period."}\n\nOpen Portfolio IQ: ${input.dashboardUrl}\n\nPortfolio IQ reports asking-market intelligence. It does not measure occupancy, signed leases, or effective rent.`;
  const cards = included.length ? included.map((signal) => `
    <div style="border:1px solid #d7dee8;border-radius:10px;padding:18px;margin:0 0 12px;background:#fff">
      <div style="color:${signal.severity === "high" ? "#a4511b" : "#19758f"};font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">${escapeHtml(signal.category)} · ${escapeHtml(signal.severity)}</div>
      <h2 style="color:#0c1f44;font-size:18px;line-height:1.35;margin:6px 0 8px">${escapeHtml(signal.headline)}</h2>
      <p style="color:#465166;font-size:14px;line-height:1.6;margin:0">${escapeHtml(signal.narrative)}</p>
      ${signal.ownerQuestion ? `<p style="color:#0c1f44;font-size:13px;line-height:1.55;margin:12px 0 0;padding-top:10px;border-top:1px solid #e3e8ef"><strong>Question for your team:</strong> ${escapeHtml(signal.ownerQuestion)}</p>` : ""}
      ${signal.decision?.assignedTo ? `<p style="color:#687386;font-size:12px;line-height:1.55;margin:10px 0 0"><strong>Assigned to:</strong> ${escapeHtml(signal.decision.assignedTo)}</p>` : ""}
    </div>`).join("") : `<div style="border:1px solid #bcdce7;border-radius:10px;padding:18px;background:#edf8fb;color:#0c1f44">No material changes this period.</div>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f5f7fa;font-family:Arial,sans-serif;color:#18233a"><div style="max-width:660px;margin:0 auto;padding:28px 18px"><div style="background:#0c1f44;border-radius:12px 12px 0 0;padding:22px 26px;color:#fff"><div style="color:#ffcf25;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">Dwellsy IQ</div><div style="font-size:25px;font-weight:700;margin-top:5px">Portfolio IQ weekly watch</div><div style="font-size:13px;margin-top:5px;color:#d9e3f3">${escapeHtml(input.portfolioName)}</div></div><div style="background:#fff;border:1px solid #d7dee8;border-top:0;border-radius:0 0 12px 12px;padding:26px"><p style="font-size:15px;line-height:1.6;margin:0 0 12px">${escapeHtml(greeting)}</p><p style="font-size:15px;line-height:1.6;margin:0 0 22px">${escapeHtml(summary)}</p>${cards}<a href="${escapeHtml(input.dashboardUrl)}" style="display:inline-block;margin-top:12px;background:#0c1f44;color:#fff;text-decoration:none;font-weight:700;border-radius:7px;padding:12px 18px">Open Portfolio Watch</a><p style="color:#687386;font-size:12px;line-height:1.6;margin:24px 0 0;border-top:1px solid #e3e8ef;padding-top:18px">Portfolio IQ reports high-frequency asking-market intelligence. It does not measure occupancy, signed leases, concessions, or effective rent.</p></div></div></body></html>`;
  return { subject, text, html, signalCount: included.length, attentionCount: attention };
}
