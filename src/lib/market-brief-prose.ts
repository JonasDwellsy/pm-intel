// LLM prose generator for market briefs. Reads structured MarketBriefData
// from market-brief.ts, calls Claude Sonnet 4.6 once to produce four
// prose sections (headline, share movement, operator landscape, notable
// signals), and caches the result keyed by (marketSlug, methodologyVersion,
// dataAsOf).
//
// Cache rule: a row exists for the current (slug, version, date) tuple →
// return it. Cache miss → generate, persist, return. Rotating
// methodologyVersion or dataAsOf invalidates implicitly because no row
// exists for the new tuple.

import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { MarketBriefData } from "@/lib/market-brief";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2000;

export interface BriefProse {
  headlineRead: string;
  shareMovement: string;
  operatorLandscape: string;
  notableSignals: string;
  generatedAt: Date;
  /** True when this prose was just generated this request; false when
   *  it came out of the cache. Useful for the page renderer to attribute
   *  freshness in copy ("Generated <date>") without misrepresenting an
   *  old cached generation as new. */
  freshlyGenerated: boolean;
}

const SYSTEM_PROMPT = `You are Dwellsy IQ's research analyst. You write weekly market briefs — short, structural reads of rental-market dynamics in the seven covered MSAs (Phoenix, Jacksonville, and five Tennessee markets) using the same v0.6.4 methodology (7-cell operator taxonomy, gold/silver per-metric stars, share-of-market trajectory, canonical operator identity for multi-market entities).

Tone: institutional. Calm, declarative, structural. Think Brookings or Urban Institute, not industry press release. Reads as analyst-to-analyst — no marketing voice, no superlatives ("amazing", "best", "tremendous"), no hype. When the data is thin, say so plainly. When something is genuinely interesting, let the structure speak — don't manufacture excitement.

Rules:

1. **Use ONLY the data provided in the user message.** Do not invent operator names, statistics, or rankings from training knowledge. Do not assert market-wide patterns the data doesn't support.

2. **Acknowledge methodology caveats where relevant**: share trajectory is context, not ranked. Cohort sizes vary across markets (Memphis, Knoxville, Clarksville run smaller cohorts than Phoenix, Nashville, Jacksonville). New entrants below cohort threshold show as "new in coverage" not as share losers.

3. **Output format**: Respond with valid JSON exactly matching this shape:
{
  "headlineRead": "2-3 sentences. Structural takeaway for this market right now.",
  "shareMovement": "1 paragraph. Who's gaining share, who's losing, what's the pattern (consolidation, fragmentation, new entrants displacing incumbents).",
  "operatorLandscape": "1 paragraph. Describe the operator mix using the 7-cell quadrant data. SFR dominant? MF/BTR institutional? Mixed? Reference specific cell counts where they tell the story.",
  "notableSignals": "1 paragraph. Name 2-4 specific operators worth knowing about — gainers, losers, or new entrants. Use markdown link syntax with the provided scorecardUrl: [Operator Name](url). For canonical multi-market operators, mention their cross-market footprint briefly."
}

4. **Word budget**: headlineRead ≤ 60 words, each other section ≤ 130 words. Be tight.

5. **No raw numbers without context.** Don't say "shareYoYPp: 3.2" — say "+3.2pp share". Don't dump JSON fields verbatim into prose.

6. **If a section's data is sparse** (e.g., no notable share gainers because the cohort is thin), write 1-2 sentences acknowledging that and move on. Don't pad.

7. **Output ONLY the JSON object.** No prose preamble, no markdown code fences, no commentary.`;

function makeUserMessage(data: MarketBriefData): string {
  // Shape the data for the model: trim long arrays, keep key fields,
  // use markdown-friendly structure so the model can reference operators
  // by name + URL without parsing nested objects.
  const lines: string[] = [];
  lines.push(`# Market brief input: ${data.market.marketName}`);
  lines.push("");
  lines.push("## Market overview");
  lines.push(`- Active operators (≥3 listings T12): ${data.market.activeOperatorCount ?? "—"}`);
  lines.push(`- Eligible cohort: ${data.market.eligibleCount} of ${data.market.totalOperatorCount} tracked`);
  lines.push(`- Median DOM T12: ${data.market.medianDomT12.toFixed(1)} days`);
  if (data.market.marketRentGrowthT12 !== null) {
    const pct = (data.market.marketRentGrowthT12 * 100).toFixed(2);
    lines.push(`- Market rent growth T12: ${data.market.marketRentGrowthT12 >= 0 ? "+" : ""}${pct}%`);
  }
  if (data.market.deltaVsNationalPp !== null) {
    const sign = data.market.deltaVsNationalPp >= 0 ? "+" : "";
    lines.push(`- vs national benchmark: ${sign}${data.market.deltaVsNationalPp.toFixed(2)}pp`);
  }
  lines.push(`- Continuing share-trajectory cohort size: ${data.market.continuingCohortSize}`);
  lines.push(`- Methodology: ${data.market.methodologyVersion}, data as of ${data.market.dataAsOf}`);
  lines.push("");

  lines.push("## Top share gainers (continuing cohort)");
  if (data.shareGainers.length === 0) {
    lines.push("(none — no operators with positive share trajectory)");
  } else {
    for (const g of data.shareGainers) {
      lines.push(
        `- ${g.name} [${g.scorecardUrl}] — ${g.quadrant7Cell ?? "—"} — +${g.shareYoYPp.toFixed(2)}pp share YoY (T12 ${g.t12Listings} listings, prior ${g.t24t12Listings})`
      );
    }
  }
  lines.push("");

  lines.push("## Top share losers");
  if (data.shareLosers.length === 0) {
    lines.push("(none — no operators with negative share trajectory)");
  } else {
    for (const l of data.shareLosers) {
      lines.push(
        `- ${l.name} [${l.scorecardUrl}] — ${l.quadrant7Cell ?? "—"} — ${l.shareYoYPp.toFixed(2)}pp share YoY (T12 ${l.t12Listings}, prior ${l.t24t12Listings})`
      );
    }
  }
  lines.push("");

  lines.push("## Notable new entrants (new_in_coverage with ≥20 T12 listings)");
  if (data.newEntrants.length === 0) {
    lines.push("(none above the notability threshold)");
  } else {
    for (const e of data.newEntrants) {
      lines.push(
        `- ${e.name} [${e.scorecardUrl}] — ${e.quadrant7Cell ?? "—"} — ${e.t12Listings} T12 listings`
      );
    }
  }
  lines.push("");

  lines.push("## 7-cell quadrant breakdown");
  for (const q of data.quadrantBreakdown) {
    const sharePct = (q.share * 100).toFixed(1);
    const dom = q.medianDomT12 !== null ? `${q.medianDomT12.toFixed(1)}d DOM` : "DOM —";
    const rent =
      q.medianRentVsComp !== null
        ? `${q.medianRentVsComp >= 0 ? "+" : ""}${q.medianRentVsComp.toFixed(1)}% vs comp`
        : "rent —";
    lines.push(`- ${q.cell}: ${q.count} ops (${sharePct}%), ${dom}, ${rent}`);
  }
  lines.push("");

  if (data.crossMarketOperators.length > 0) {
    lines.push("## Cross-market operators in this market");
    for (const co of data.crossMarketOperators.slice(0, 10)) {
      lines.push(
        `- ${co.canonicalName} [${co.crossMarketProfileUrl}] — operates in ${co.marketCount} markets total; also in: ${co.otherMarketNames.join(", ")}`
      );
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("Produce the brief JSON now. Output ONLY the JSON.");
  return lines.join("\n");
}

function inputDigest(data: MarketBriefData): string {
  // Stable digest of the input we sent to the model. Lets us detect
  // "same cache key but different data" cases in debugging — if the
  // digest changes without the dataAsOf/methodologyVersion changing,
  // the upstream seed shifted and we should invalidate.
  const json = JSON.stringify(data);
  return crypto.createHash("sha256").update(json).digest("hex");
}

/** Look up the cached brief for this (marketSlug, methodologyVersion,
 *  dataAsOf) tuple. Returns null on cache miss. The dataAsOf comparison
 *  uses startOfDay since the seed stores midnight UTC timestamps. */
async function readCache(
  data: MarketBriefData
): Promise<BriefProse | null> {
  const row = await prisma.marketBrief.findUnique({
    where: {
      marketSlug_methodologyVersion_dataAsOf: {
        marketSlug: data.market.marketSlug,
        methodologyVersion: data.market.methodologyVersion,
        dataAsOf: new Date(data.market.dataAsOf),
      },
    },
  });
  if (!row) return null;
  return {
    headlineRead: row.headlineRead,
    shareMovement: row.shareMovement,
    operatorLandscape: row.operatorLandscape,
    notableSignals: row.notableSignals,
    generatedAt: row.generatedAt,
    freshlyGenerated: false,
  };
}

async function writeCache(
  data: MarketBriefData,
  prose: Omit<BriefProse, "generatedAt" | "freshlyGenerated">
): Promise<Date> {
  const digest = inputDigest(data);
  const row = await prisma.marketBrief.upsert({
    where: {
      marketSlug_methodologyVersion_dataAsOf: {
        marketSlug: data.market.marketSlug,
        methodologyVersion: data.market.methodologyVersion,
        dataAsOf: new Date(data.market.dataAsOf),
      },
    },
    create: {
      marketSlug: data.market.marketSlug,
      methodologyVersion: data.market.methodologyVersion,
      dataAsOf: new Date(data.market.dataAsOf),
      headlineRead: prose.headlineRead,
      shareMovement: prose.shareMovement,
      operatorLandscape: prose.operatorLandscape,
      notableSignals: prose.notableSignals,
      inputDigest: digest,
    },
    update: {
      headlineRead: prose.headlineRead,
      shareMovement: prose.shareMovement,
      operatorLandscape: prose.operatorLandscape,
      notableSignals: prose.notableSignals,
      inputDigest: digest,
      generatedAt: new Date(),
    },
  });
  return row.generatedAt;
}

/** Main entry point. Reads cache; on miss, calls Claude, persists, returns.
 *  Throws if ANTHROPIC_API_KEY is missing — callers should catch and fall
 *  back to a "brief not yet generated" UI state. */
export async function generateBriefProse(
  data: MarketBriefData
): Promise<BriefProse> {
  const cached = await readCache(data);
  if (cached) return cached;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY not configured — cannot generate market brief."
    );
  }

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: makeUserMessage(data),
      },
    ],
  });

  // Concatenate any text blocks (typically one) into a single string,
  // then strip optional code fences before parsing.
  const text = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  const cleaned = text
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  let parsed: {
    headlineRead?: unknown;
    shareMovement?: unknown;
    operatorLandscape?: unknown;
    notableSignals?: unknown;
  };
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error("[market-brief-prose] JSON parse failed", err, cleaned);
    throw new Error("Model returned malformed JSON. Try regenerating.");
  }

  const required = [
    "headlineRead",
    "shareMovement",
    "operatorLandscape",
    "notableSignals",
  ] as const;
  for (const key of required) {
    if (typeof parsed[key] !== "string" || (parsed[key] as string).length === 0) {
      throw new Error(
        `Model response missing or empty "${key}" field. Try regenerating.`
      );
    }
  }

  const prose = {
    headlineRead: parsed.headlineRead as string,
    shareMovement: parsed.shareMovement as string,
    operatorLandscape: parsed.operatorLandscape as string,
    notableSignals: parsed.notableSignals as string,
  };

  const generatedAt = await writeCache(data, prose);
  return { ...prose, generatedAt, freshlyGenerated: true };
}

/** Read-only accessor for the briefs index page — returns cached prose
 *  if any exists for any (version, date) tuple of this market. Used so
 *  the index can show "X markets briefed" without triggering generation
 *  on page load. Returns null if no brief has ever been cached. */
export async function readLatestCachedProse(
  marketSlug: string
): Promise<BriefProse | null> {
  const row = await prisma.marketBrief.findFirst({
    where: { marketSlug },
    orderBy: { generatedAt: "desc" },
  });
  if (!row) return null;
  return {
    headlineRead: row.headlineRead,
    shareMovement: row.shareMovement,
    operatorLandscape: row.operatorLandscape,
    notableSignals: row.notableSignals,
    generatedAt: row.generatedAt,
    freshlyGenerated: false,
  };
}
