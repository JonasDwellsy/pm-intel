import type { MarketIqReportSnapshot } from "@/lib/market-iq/report/report";

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function safeColor(value: string, fallback: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

export function buildMarketIqReportEmail(input: {
  recipientName: string;
  recipientKind: "client" | "prospect";
  report: MarketIqReportSnapshot;
  reportUrl: string;
  pdfUrl: string;
}) {
  const { brand, scope, marketRead } = input.report;
  const primary = safeColor(brand.primaryColor, "#173B57");
  const accent = safeColor(brand.accentColor, "#B96D3A");
  const greeting = input.recipientName ? `Hi ${input.recipientName},` : "Hello,";
  const subject = `${brand.displayName} | ${scope.marketName} local market read`;
  const opening = input.report.editorial?.introduction || marketRead.narrative;
  const edition = input.report.editionComparison;
  const editionText = edition ? `\n\nSince the last market read: ${edition.heading}. ${edition.findings[0]?.headline ?? edition.narrative}` : "";
  const text = `${greeting}\n\n${brand.displayName} prepared an interactive local read on the ${scope.marketName} asking market. It covers Trends IQ rent level and direction, plus separately sourced listing activity, across ${scope.cities.join(", ")} and selected ZIP codes.\n\n${opening}${editionText}\n\nView the interactive report: ${input.reportUrl}\nOptional PDF export: ${input.pdfUrl}\n\nThis report measures advertised asking-market activity. It does not measure occupancy, signed leases, concessions, effective rent, or property-level financial performance.\n\nMarket data by Dwellsy IQ`;
  const contact = [brand.contactName, brand.contactEmail, brand.contactPhone].filter(Boolean).map((value) => escapeHtml(String(value))).join(" | ");
  const comparisonHtml = edition ? `<div style="margin-top:18px;border:1px solid #dce1e8;border-radius:10px;padding:18px"><div style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${accent}">Since the last market read</div><div style="font-size:16px;font-weight:700;line-height:1.4;margin-top:7px;color:${primary}">${escapeHtml(edition.heading)}</div><div style="font-size:13px;line-height:1.55;margin-top:7px;color:#5d687a">${escapeHtml(edition.findings[0]?.headline ?? edition.narrative)}</div></div>` : "";
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f5f3"><div style="display:none;max-height:0;overflow:hidden;opacity:0">An interactive ${escapeHtml(scope.marketName)} market read from ${escapeHtml(brand.displayName)}.</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f3"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#fff;border:1px solid #dce1e8;border-radius:14px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#172033"><tr><td style="padding:22px 28px;border-bottom:1px solid #e7e9ed"><div style="font-size:20px;font-weight:700;color:${primary}">${escapeHtml(brand.displayName)}</div><div style="margin-top:4px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${accent}">Interactive local market read</div></td></tr><tr><td style="padding:30px 28px"><p style="font-size:15px;line-height:1.6;margin:0 0 18px">${escapeHtml(greeting)}</p><p style="font-size:15px;line-height:1.65;margin:0 0 22px">${escapeHtml(brand.displayName)} prepared an interactive read on the ${escapeHtml(scope.marketName)} asking market, covering rent direction, local ZIPs, supply, and listing velocity.</p><div style="background:${primary};border-radius:10px;padding:22px;color:#fff"><div style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#dce6eb">What is happening locally</div><div style="font-size:18px;font-weight:700;line-height:1.4;margin-top:8px">${escapeHtml(opening)}</div><div style="font-size:12px;line-height:1.5;color:#dce6eb;margin-top:12px">${scope.cities.length} cities | ${scope.zipCodes.length} selected ZIPs | houses and apartments</div></div>${comparisonHtml}<div style="margin-top:24px"><a href="${escapeHtml(input.reportUrl)}" style="display:inline-block;background:${primary};color:#fff;text-decoration:none;border-radius:7px;padding:12px 18px;font-size:14px;font-weight:700;margin:0 8px 8px 0">Explore the market read</a><a href="${escapeHtml(input.pdfUrl)}" style="display:inline-block;color:${primary};text-decoration:none;border:1px solid #cfd6df;border-radius:7px;padding:11px 17px;font-size:14px;font-weight:700;margin-bottom:8px">PDF export</a></div><p style="border-top:1px solid #e7e9ed;color:#687386;font-size:12px;line-height:1.55;margin:24px 0 0;padding-top:18px">This report measures advertised asking-market activity. It does not measure occupancy, signed leases, concessions, effective rent, or property-level financial performance.</p>${contact ? `<p style="color:#445066;font-size:12px;line-height:1.55;margin:16px 0 0">Prepared by ${escapeHtml(brand.displayName)}<br>${contact}</p>` : `<p style="color:#445066;font-size:12px;line-height:1.55;margin:16px 0 0">Prepared by ${escapeHtml(brand.displayName)}</p>`}</td></tr><tr><td style="padding:16px 28px;background:#f8f8f6;border-top:1px solid #e7e9ed;text-align:right;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#929aaa">Market data by Dwellsy IQ</td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}
