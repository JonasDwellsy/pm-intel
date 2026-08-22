import {
  parseMarketIqReportSnapshot,
  type MarketIqReportSnapshot,
} from "@/lib/market-iq/report/report";

export const MARKET_IQ_REFRESH_MAX_ATTEMPTS = 2;
export const MARKET_IQ_REFRESH_STALE_AFTER_MS = 10 * 60 * 1_000;

export type MarketIqRefreshFailureStage =
  | "coordination"
  | "source"
  | "validation"
  | "persistence";

export type MarketIqRefreshFailureCategory =
  | "already_running"
  | "authentication"
  | "connection"
  | "data_unavailable"
  | "dns"
  | "invalid_snapshot"
  | "permission"
  | "schema"
  | "stale_run"
  | "timeout"
  | "tls"
  | "unclassified";

export type MarketIqRecordedRefreshFailure = {
  version: 1;
  stage: MarketIqRefreshFailureStage;
  category: MarketIqRefreshFailureCategory;
  attempts: number;
};

type ErrorFacts = {
  names: string[];
  codes: string[];
  messages: string[];
};

function collectErrorFacts(error: unknown, facts: ErrorFacts, depth = 0): void {
  if (!error || typeof error !== "object" || depth > 3) return;
  const value = error as {
    name?: unknown;
    code?: unknown;
    message?: unknown;
    cause?: unknown;
    errors?: unknown;
  };
  if (typeof value.name === "string") facts.names.push(value.name);
  if (value.code !== undefined) facts.codes.push(String(value.code).toUpperCase());
  if (typeof value.message === "string") facts.messages.push(value.message.toLowerCase());
  collectErrorFacts(value.cause, facts, depth + 1);
  if (Array.isArray(value.errors)) {
    for (const nested of value.errors) collectErrorFacts(nested, facts, depth + 1);
  }
}

export function classifyMarketIqRefreshFailure(error: unknown): {
  category: MarketIqRefreshFailureCategory;
  retryable: boolean;
} {
  if (error instanceof MarketIqRefreshSourceError) return error.classification;
  if (error instanceof MarketIqRefreshValidationError) {
    return { category: "invalid_snapshot", retryable: false };
  }

  const facts: ErrorFacts = { names: [], codes: [], messages: [] };
  collectErrorFacts(error, facts);
  const text = [...facts.names, ...facts.messages].join(" ");
  const codes = new Set(facts.codes);

  if (codes.has("28P01") || text.includes("password authentication") || text.includes("sasl")) {
    return { category: "authentication", retryable: false };
  }
  if (codes.has("42501") || text.includes("permission denied")) {
    return { category: "permission", retryable: false };
  }
  if (codes.has("42P01") || codes.has("42703") || text.includes("does not exist")) {
    return { category: "schema", retryable: false };
  }
  if (
    codes.has("UNABLE_TO_VERIFY_LEAF_SIGNATURE") ||
    codes.has("DEPTH_ZERO_SELF_SIGNED_CERT") ||
    text.includes("certificate") ||
    text.includes("ssl")
  ) {
    return { category: "tls", retryable: false };
  }
  if (codes.has("ENOTFOUND") || codes.has("EAI_AGAIN") || text.includes("getaddrinfo")) {
    return { category: "dns", retryable: codes.has("EAI_AGAIN") };
  }
  if (
    codes.has("ETIMEDOUT") ||
    codes.has("57014") ||
    text.includes("timeout") ||
    text.includes("timed out")
  ) {
    return { category: "timeout", retryable: true };
  }
  if (
    ["ECONNRESET", "ECONNREFUSED", "EPIPE", "08000", "08001", "08003", "08006", "57P01", "57P02", "57P03", "53300"]
      .some((code) => codes.has(code)) ||
    text.includes("connection terminated") ||
    text.includes("connection closed")
  ) {
    return { category: "connection", retryable: true };
  }
  if (
    text.includes("returned no rows") ||
    text.includes("returned no cleveland observations") ||
    text.includes("returned no 999")
  ) {
    return { category: "data_unavailable", retryable: false };
  }
  return { category: "unclassified", retryable: false };
}

export class MarketIqRefreshSourceError extends Error {
  constructor(
    readonly classification: ReturnType<typeof classifyMarketIqRefreshFailure>,
    readonly attempts: number,
    cause: unknown,
  ) {
    super("The authoritative source refresh failed.", { cause });
    this.name = "MarketIqRefreshSourceError";
  }
}

export class MarketIqRefreshValidationError extends Error {
  constructor() {
    super("The authoritative source returned an invalid report snapshot.");
    this.name = "MarketIqRefreshValidationError";
  }
}

export async function runMarketIqSourceWithRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: {
    sleep?: (milliseconds: number) => Promise<void>;
    delayMilliseconds?: number;
  } = {},
): Promise<{ value: T; attempts: number }> {
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const delayMilliseconds = options.delayMilliseconds ?? 1_000;

  for (let attempt = 1; attempt <= MARKET_IQ_REFRESH_MAX_ATTEMPTS; attempt += 1) {
    try {
      return { value: await operation(attempt), attempts: attempt };
    } catch (error) {
      const classification = classifyMarketIqRefreshFailure(error);
      if (!classification.retryable || attempt === MARKET_IQ_REFRESH_MAX_ATTEMPTS) {
        throw new MarketIqRefreshSourceError(classification, attempt, error);
      }
      await sleep(delayMilliseconds);
    }
  }
  throw new Error("The bounded source retry loop terminated unexpectedly.");
}

export function validateMarketIqLiveReportSnapshot(snapshot: MarketIqReportSnapshot): {
  observationCount: number;
  sourceAvailableThrough: Date;
} {
  const parsed = parseMarketIqReportSnapshot(JSON.stringify(snapshot));
  const trendsSource = parsed?.sources.find((source) => source.name === "Dwellsy IQ Trends");
  const observationCount = parsed?.marketRead.cells.reduce(
    (total, cell) => total + cell.series.length,
    0,
  ) ?? 0;
  const availableThrough = trendsSource?.availableThrough ?? parsed?.scope.periodEnd;
  const sourceAvailableThrough = availableThrough
    ? new Date(`${availableThrough.slice(0, 10)}T00:00:00.000Z`)
    : new Date(Number.NaN);

  if (
    !parsed ||
    parsed.scope.seededExample ||
    !trendsSource ||
    observationCount === 0 ||
    Number.isNaN(sourceAvailableThrough.getTime())
  ) {
    throw new MarketIqRefreshValidationError();
  }
  return { observationCount, sourceAvailableThrough };
}

export function recordedMarketIqRefreshFailure(input: {
  stage: MarketIqRefreshFailureStage;
  error?: unknown;
  category?: MarketIqRefreshFailureCategory;
  attempts?: number;
}): MarketIqRecordedRefreshFailure {
  const sourceError = input.error instanceof MarketIqRefreshSourceError ? input.error : null;
  return {
    version: 1,
    stage: input.stage,
    category: input.category ?? sourceError?.classification.category ?? classifyMarketIqRefreshFailure(input.error).category,
    attempts: input.attempts ?? sourceError?.attempts ?? 1,
  };
}

export function parseRecordedMarketIqRefreshFailure(value: string | null | undefined): MarketIqRecordedRefreshFailure | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<MarketIqRecordedRefreshFailure>;
    const stages: MarketIqRefreshFailureStage[] = ["coordination", "source", "validation", "persistence"];
    const categories: MarketIqRefreshFailureCategory[] = [
      "already_running", "authentication", "connection", "data_unavailable", "dns",
      "invalid_snapshot", "permission", "schema", "stale_run", "timeout", "tls", "unclassified",
    ];
    if (
      parsed.version !== 1 ||
      !stages.includes(parsed.stage as MarketIqRefreshFailureStage) ||
      !categories.includes(parsed.category as MarketIqRefreshFailureCategory) ||
      !Number.isInteger(parsed.attempts) ||
      Number(parsed.attempts) < 1
    ) return null;
    return parsed as MarketIqRecordedRefreshFailure;
  } catch {
    return null;
  }
}
