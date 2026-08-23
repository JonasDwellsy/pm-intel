import { marketIqPropertyActivityPath } from "@/lib/market-iq/property-activity";
import type { MarketIqDailyMatchTriage, MarketIqDailyTeamMember } from "@/lib/market-iq/daily-watchlist-triage";
import type { MarketIqDailyWatchlistVisibility } from "@/lib/market-iq/daily-watchlists";

export const MARKET_IQ_DAILY_DELIVERY_CADENCES = ["daily", "weekly", "in_app_only"] as const;
export type MarketIqDailyDeliveryCadence = typeof MARKET_IQ_DAILY_DELIVERY_CADENCES[number];

export type MarketIqPersistedDailyMatch = {
  id: string;
  watchlistName: string;
  marketId: string;
  editionId: string;
  eventKey: string;
  eventType: string;
  headline: string;
  detail: string;
  observedAt: Date;
  propertyId: string | null;
  sectionHref: string;
};

export type MarketIqDailyInboxMatch = {
  id: string;
  watchlistName: string;
  marketId: string;
  editionId: string;
  eventKey: string;
  eventType: string;
  headline: string;
  detail: string;
  observedAt: string;
  propertyId: string | null;
  sectionHref: string;
  readAt: string | null;
  emailedAt: string | null;
  watchlistVisibility: MarketIqDailyWatchlistVisibility;
  triage: MarketIqDailyMatchTriage;
};

export type MarketIqDailyDeliveryState = {
  cadence: MarketIqDailyDeliveryCadence;
  lastDeliveredAt: string | null;
  matches: MarketIqDailyInboxMatch[];
  teamMembers: MarketIqDailyTeamMember[];
  viewerUserId: string;
};

export function parseMarketIqDailyDeliveryCadence(value: unknown): MarketIqDailyDeliveryCadence | null {
  return typeof value === "string" && (MARKET_IQ_DAILY_DELIVERY_CADENCES as readonly string[]).includes(value)
    ? value as MarketIqDailyDeliveryCadence
    : null;
}

export function marketIqDailyDeliveryIsDue(input: {
  cadence: MarketIqDailyDeliveryCadence;
  lastDeliveredAt: Date | null;
  now: Date;
}) {
  if (input.cadence === "in_app_only") return false;
  if (!input.lastDeliveredAt) return true;
  const minimum = input.cadence === "weekly" ? 7 * 24 * 60 * 60 * 1000 : 20 * 60 * 60 * 1000;
  return input.now.getTime() - input.lastDeliveredAt.getTime() >= minimum;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

export function uniqueMarketIqDailyMatches(matches: MarketIqPersistedDailyMatch[]) {
  const byEvent = new Map<string, MarketIqPersistedDailyMatch & { watchlistNames: string[] }>();
  for (const match of [...matches].sort((left, right) => right.observedAt.getTime() - left.observedAt.getTime())) {
    const current = byEvent.get(match.eventKey);
    if (current) {
      if (!current.watchlistNames.includes(match.watchlistName)) current.watchlistNames.push(match.watchlistName);
    } else byEvent.set(match.eventKey, { ...match, watchlistNames: [match.watchlistName] });
  }
  return [...byEvent.values()];
}

export function buildMarketIqDailyWatchlistEmail(input: {
  recipientName: string | null;
  cadence: "daily" | "weekly";
  matches: MarketIqPersistedDailyMatch[];
  appOrigin: string;
}) {
  const unique = uniqueMarketIqDailyMatches(input.matches).slice(0, 20);
  if (!unique.length) return null;
  const count = unique.length;
  const period = input.cadence === "weekly" ? "weekly" : "daily";
  const subject = `Market IQ: ${count} new watchlist match${count === 1 ? "" : "es"}`;
  const greeting = input.recipientName ? `Hi ${input.recipientName},` : "Hello,";
  const inboxUrl = `${input.appOrigin}/market-iq/daily#daily-watchlist-inbox`;
  const textItems = unique.map((match) => {
    const editionUrl = `${input.appOrigin}/market-iq/daily?market=${encodeURIComponent(match.marketId)}&edition=${encodeURIComponent(match.editionId)}${match.sectionHref}`;
    const propertyUrl = match.propertyId ? `${input.appOrigin}${marketIqPropertyActivityPath(match.marketId, match.propertyId)}` : editionUrl;
    return `• ${match.headline}\n  ${match.detail}\n  ${propertyUrl}\n  Matched: ${match.watchlistNames.join(", ")}`;
  }).join("\n\n");
  const text = `${greeting}\n\n${count} newly observed event${count === 1 ? "" : "s"} matched Market IQ watchlists you follow in this ${period} update.\n\n${textItems}\n\nOpen your match inbox: ${inboxUrl}\n\nObserved listing activity only. Asking rents are advertised, concessions are not verified, and off-market means leased or withdrawn, undetermined.`;
  const cards = unique.map((match) => {
    const editionUrl = `${input.appOrigin}/market-iq/daily?market=${encodeURIComponent(match.marketId)}&edition=${encodeURIComponent(match.editionId)}${match.sectionHref}`;
    const primaryUrl = match.propertyId ? `${input.appOrigin}${marketIqPropertyActivityPath(match.marketId, match.propertyId)}` : editionUrl;
    return `<div style="border:1px solid #d7dee8;border-radius:12px;padding:18px;margin:0 0 12px;background:#fff"><div style="font-size:11px;font-weight:700;color:#0f766e;text-transform:uppercase;letter-spacing:.08em">${escapeHtml(match.eventType.replaceAll("_", " "))}</div><h2 style="font-size:18px;line-height:1.4;color:#17324a;margin:7px 0">${escapeHtml(match.headline)}</h2><p style="font-size:14px;line-height:1.6;color:#596579;margin:0 0 12px">${escapeHtml(match.detail)}</p><p style="font-size:11px;color:#7b8798;margin:0 0 12px">Matched: ${escapeHtml(match.watchlistNames.join(", "))}</p><a href="${escapeHtml(primaryUrl)}" style="font-size:13px;font-weight:700;color:#0f766e;text-decoration:none">${match.propertyId ? "View property" : "Open Daily Edition"}</a></div>`;
  }).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Arial,sans-serif"><div style="max-width:680px;margin:0 auto;padding:28px 18px"><div style="background:#17324a;color:#fff;border-radius:14px 14px 0 0;padding:24px 28px"><div style="font-size:11px;font-weight:700;color:#5eead4;text-transform:uppercase;letter-spacing:.12em">Market IQ ${period} watch</div><div style="font-size:26px;font-weight:700;margin-top:7px">What matched your watchlists</div></div><div style="background:#fff;border:1px solid #d7dee8;border-top:0;border-radius:0 0 14px 14px;padding:28px"><p style="font-size:15px;color:#334155;line-height:1.6;margin-top:0">${escapeHtml(greeting)}</p><p style="font-size:15px;color:#334155;line-height:1.6">${count} newly observed event${count === 1 ? "" : "s"} matched watchlists you follow.</p>${cards}<a href="${escapeHtml(inboxUrl)}" style="display:inline-block;margin-top:10px;background:#17324a;color:#fff;text-decoration:none;font-weight:700;border-radius:8px;padding:12px 18px">Open match inbox</a><p style="font-size:11px;line-height:1.6;color:#7b8798;border-top:1px solid #e5e7eb;margin:24px 0 0;padding-top:18px">Observed listing activity only. Asking rents are advertised, concessions are not verified, and off-market means leased or withdrawn, undetermined.</p></div></div></body></html>`;
  return { subject, text, html, eventCount: count, eventKeys: unique.map((match) => match.eventKey) };
}
