export const MARKET_IQ_DAILY_TRIAGE_STATUSES = ["new", "reviewing", "dismissed", "resolved"] as const;
export type MarketIqDailyTriageStatus = typeof MARKET_IQ_DAILY_TRIAGE_STATUSES[number];

export type MarketIqDailyTeamMember = {
  userId: string;
  name: string;
};

export type MarketIqDailyTriageNote = {
  id: string;
  authorUserId: string;
  authorName: string;
  body: string;
  createdAt: string;
};

export type MarketIqDailyMatchTriage = {
  status: MarketIqDailyTriageStatus;
  assignedToUserId: string | null;
  notes: MarketIqDailyTriageNote[];
};

export type MarketIqDailyTriageActionResult =
  | { ok: true; triage: MarketIqDailyMatchTriage }
  | { ok: false; message: string };

export type MarketIqDailyTriageMutationResult =
  | {
    ok: true;
    status: MarketIqDailyTriageStatus;
    assignedToUserId: string | null;
    note?: MarketIqDailyTriageNote;
  }
  | { ok: false; message: string };

export function parseMarketIqDailyTriageStatus(value: unknown): MarketIqDailyTriageStatus | null {
  return typeof value === "string" && (MARKET_IQ_DAILY_TRIAGE_STATUSES as readonly string[]).includes(value)
    ? value as MarketIqDailyTriageStatus
    : null;
}

export function parseMarketIqDailyTriageNote(value: unknown) {
  if (typeof value !== "string") return null;
  const body = value.trim();
  return body && body.length <= 1_000 ? body : null;
}
