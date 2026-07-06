import type { ScorecardData } from "@/lib/types";

/**
 * Parse a PM row's stored `scorecardData` JSON string into `ScorecardData`.
 *
 * Single typed choke point for the ~20 read sites that previously inlined
 * `JSON.parse(row.scorecardData) as ScorecardData`. Behavior-preserving: it
 * throws on malformed JSON exactly as those inline casts did, so it's a safe
 * mechanical swap. Callers that intentionally tolerate malformed blobs (e.g.
 * the seed's snapshot capture) keep their own try/catch. Having one accessor
 * also gives us a single place to add graceful handling later if we choose to.
 */
export function parseScorecard(row: { scorecardData: string }): ScorecardData {
  return JSON.parse(row.scorecardData) as ScorecardData;
}
