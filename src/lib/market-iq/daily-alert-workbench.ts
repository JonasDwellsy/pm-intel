import type { MarketIqDailyInboxMatch } from "@/lib/market-iq/daily-watchlist-delivery";
import type { MarketIqDailyTeamMember, MarketIqDailyTriageStatus } from "@/lib/market-iq/daily-watchlist-triage";

export const MARKET_IQ_ALERT_WORKBENCH_SCOPES = ["open", "mine", "unassigned", "all"] as const;
export type MarketIqAlertWorkbenchScope = typeof MARKET_IQ_ALERT_WORKBENCH_SCOPES[number];

export type MarketIqAlertWorkbenchItem = MarketIqDailyInboxMatch & {
  watchlistId: string;
  marketName: string;
  city: string;
  propertyManagerName: string | null;
};

export type MarketIqAlertWorkbenchState = {
  viewerUserId: string;
  teamMembers: MarketIqDailyTeamMember[];
  items: MarketIqAlertWorkbenchItem[];
  truncated: boolean;
};

export type MarketIqAlertWorkbenchFilters = {
  scope: MarketIqAlertWorkbenchScope;
  query: string;
  marketId: string;
  watchlistId: string;
  eventType: string;
  visibility: "all" | "private" | "organization";
  status: "all" | MarketIqDailyTriageStatus;
  assignee: "all" | "unassigned" | string;
  sort: "newest" | "oldest";
};

export const EMPTY_MARKET_IQ_ALERT_WORKBENCH_FILTERS: MarketIqAlertWorkbenchFilters = {
  scope: "open",
  query: "",
  marketId: "all",
  watchlistId: "all",
  eventType: "all",
  visibility: "all",
  status: "all",
  assignee: "all",
  sort: "newest",
};

export type MarketIqAlertWorkbenchCounts = {
  open: number;
  mine: number;
  unassigned: number;
  all: number;
};

export type MarketIqAlertWorkbenchBulkInput = {
  status?: MarketIqDailyTriageStatus;
  assignedToUserId?: string | null;
};

export type MarketIqAlertWorkbenchBulkResult =
  | { ok: true; updatedMatchIds: string[] }
  | { ok: false; message: string };

function isOpen(item: MarketIqAlertWorkbenchItem) {
  return item.triage.status === "new" || item.triage.status === "reviewing";
}

function normalized(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase("en-US") ?? "";
}

export function marketIqAlertWorkbenchCounts(items: MarketIqAlertWorkbenchItem[], viewerUserId: string): MarketIqAlertWorkbenchCounts {
  const open = items.filter(isOpen);
  return {
    open: open.length,
    mine: open.filter((item) => item.triage.assignedToUserId === viewerUserId).length,
    unassigned: open.filter((item) => !item.triage.assignedToUserId).length,
    all: items.length,
  };
}

export function filterMarketIqAlertWorkbenchItems(
  items: MarketIqAlertWorkbenchItem[],
  filters: MarketIqAlertWorkbenchFilters,
  viewerUserId: string,
) {
  const query = normalized(filters.query);
  return items.filter((item) => {
    if (filters.scope === "open" && !isOpen(item)) return false;
    if (filters.scope === "mine" && (!isOpen(item) || item.triage.assignedToUserId !== viewerUserId)) return false;
    if (filters.scope === "unassigned" && (!isOpen(item) || item.triage.assignedToUserId)) return false;
    if (filters.marketId !== "all" && item.marketId !== filters.marketId) return false;
    if (filters.watchlistId !== "all" && item.watchlistId !== filters.watchlistId) return false;
    if (filters.eventType !== "all" && item.eventType !== filters.eventType) return false;
    if (filters.visibility !== "all" && item.watchlistVisibility !== filters.visibility) return false;
    if (filters.status !== "all" && item.triage.status !== filters.status) return false;
    if (filters.assignee === "unassigned" && item.triage.assignedToUserId) return false;
    if (filters.assignee !== "all" && filters.assignee !== "unassigned" && item.triage.assignedToUserId !== filters.assignee) return false;
    if (query && ![
      item.headline,
      item.detail,
      item.marketName,
      item.watchlistName,
      item.city,
      item.propertyManagerName,
    ].map(normalized).join(" ").includes(query)) return false;
    return true;
  }).sort((left, right) => filters.sort === "oldest"
    ? Date.parse(left.observedAt) - Date.parse(right.observedAt)
    : Date.parse(right.observedAt) - Date.parse(left.observedAt));
}

export function parseMarketIqAlertWorkbenchBulkInput(value: unknown):
  | { ok: true; value: MarketIqAlertWorkbenchBulkInput }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "Choose a bulk update." };
  const candidate = value as Record<string, unknown>;
  const status = candidate.status;
  const assignedToUserId = candidate.assignedToUserId;
  const validStatus = status === undefined || ["new", "reviewing", "dismissed", "resolved"].includes(status as string);
  const validAssignee = assignedToUserId === undefined || assignedToUserId === null
    || typeof assignedToUserId === "string" && assignedToUserId.length > 0 && assignedToUserId.length <= 100;
  if (!validStatus || !validAssignee || status === undefined && assignedToUserId === undefined) {
    return { ok: false, error: "Choose a valid status or assignee." };
  }
  return { ok: true, value: {
    ...(status !== undefined ? { status: status as MarketIqDailyTriageStatus } : {}),
    ...(assignedToUserId !== undefined ? { assignedToUserId: assignedToUserId as string | null } : {}),
  } };
}
