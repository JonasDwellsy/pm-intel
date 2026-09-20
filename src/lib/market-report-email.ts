import "server-only";

import { citySlug, stateCodeToSlug } from "@/lib/slugify";

const PRODUCT_NAME = "Operator IQ";

type MarketForReport = {
  city: string;
  state: string;
  activeOperatorCount: number | null;
  operatorCountEligible: number;
  medianDomT12: number;
  marketRentGrowthT12: number | null;
  dataAsOf: Date | null;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(date: Date | null): string {
  if (!date) return "Latest available data";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatRentGrowth(value: number | null): string {
  if (value == null) return "Not available";
  const percentage = value * 100;
  return `${percentage >= 0 ? "+" : ""}${percentage.toFixed(2)}%`;
}

export function marketPagePath(market: Pick<MarketForReport, "city" | "state">) {
  return `/property-managers/${stateCodeToSlug(market.state)}/${citySlug(market.city)}`;
}

export function buildMarketReportEmail(market: MarketForReport, reportUrl: string) {
  const marketName = `${market.city}, ${market.state}`;
  const safeMarketName = escapeHtml(marketName);
  const safeReportUrl = escapeHtml(reportUrl);
  const activeOperators = market.activeOperatorCount ?? market.operatorCountEligible;
  const asOf = formatDate(market.dataAsOf);
  const rentGrowth = formatRentGrowth(market.marketRentGrowthT12);

  const subject = `Your free ${marketName} market report`;
  const html = `<!doctype html>
<html><body style="margin:0;background:#f4f6fa;color:#2a3547;font-family:Inter,Arial,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden">A current read on operators, leasing speed, and rent movement in ${safeMarketName}.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#fff;border:1px solid #e6eaf1;border-radius:14px;overflow:hidden">
      <tr><td style="padding:20px 28px;border-bottom:1px solid #eef1f6;font-size:18px;font-weight:700;color:#0f1f3f">Dwellsy IQ <span style="color:#0e7c86">Markets</span></td></tr>
      <tr><td style="padding:30px 28px 10px">
        <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#8894ac">Your home-market report</p>
        <h1 style="margin:0;color:#0f1f3f;font-size:28px;line-height:1.2">${safeMarketName}</h1>
        <p style="margin:10px 0 0;font-size:13px;color:#5b6577">Data current through ${escapeHtml(asOf)}</p>
      </td></tr>
      <tr><td style="padding:18px 28px 8px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:8px">
          <tr>
            <td style="padding:16px;background:#f2f5f8;border-radius:8px"><div style="font-size:22px;font-weight:700;color:#0f1f3f">${activeOperators.toLocaleString("en-US")}</div><div style="margin-top:4px;font-size:12px;color:#5b6577">Active operators</div></td>
            <td style="padding:16px;background:#f2f5f8;border-radius:8px"><div style="font-size:22px;font-weight:700;color:#0f1f3f">${market.medianDomT12.toFixed(1)}d</div><div style="margin-top:4px;font-size:12px;color:#5b6577">Median days on market</div></td>
            <td style="padding:16px;background:#f2f5f8;border-radius:8px"><div style="font-size:22px;font-weight:700;color:#0f1f3f">${escapeHtml(rentGrowth)}</div><div style="margin-top:4px;font-size:12px;color:#5b6577">Rent growth T12</div></td>
          </tr>
        </table>
      </td></tr>
      <tr><td style="padding:18px 28px 30px">
        <p style="margin:0 0 20px;font-size:15px;line-height:1.6">This snapshot gives you a current structural read on the operator landscape, leasing speed, and rent movement in ${safeMarketName}. It is built from observed rental-listing activity, not operator self-reporting.</p>
        <a href="${safeReportUrl}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#0f1f3f;color:#fff;text-decoration:none;font-size:14px;font-weight:700">Explore the live market</a>
      </td></tr>
      <tr><td style="padding:18px 28px 24px;border-top:1px solid #eef1f6;font-size:11px;line-height:1.5;color:#8894ac">You requested this one-time report on the ${PRODUCT_NAME} homepage. This does not subscribe you to recurring email. Dwellsy, Inc.</td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  const text = `${marketName} home-market report\nData current through ${asOf}\n\nActive operators: ${activeOperators.toLocaleString("en-US")}\nEligible benchmark cohort: ${market.operatorCountEligible.toLocaleString("en-US")}\nMedian days on market: ${market.medianDomT12.toFixed(1)} days\nRent growth T12: ${rentGrowth}\n\nExplore the live market: ${reportUrl}\n\nBuilt from observed rental-listing activity, not operator self-reporting. You requested this one-time email on the ${PRODUCT_NAME} homepage; it does not subscribe you to recurring email.`;

  return { subject, html, text };
}
