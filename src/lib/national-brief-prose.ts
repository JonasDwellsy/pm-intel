// LLM prose generator for the national / cross-market brief (Briefs V2 Phase 2).
// Mirrors market-brief-prose.ts: deterministic NationalBriefData in → Claude →
// 5 prose sections, cached in the MarketBrief table under the NATIONAL_SLUG
// sentinel (cache key marketSlug/methodologyVersion/dataAsOf + inputDigest).
// The five columns are reused with national semantics:
//   sinceLastPeriod  → "what moved nationally" (leads)
//   headlineRead     → national headline
//   shareMovement    → standout markets
//   operatorLandscape→ national operator mix
//   notableSignals   → standout operators

import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { NATIONAL_SLUG, type NationalBriefData } from "@/lib/national-brief";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2000;
const PROMPT_VERSION = "nat-v1-2026-07";

export interface NationalBriefProse {
  sinceLastPeriod: string;
  headlineRead: string;
  shareMovement: string; // standout markets
  operatorLandscape: string;
  notableSignals: string; // standout operators
  generatedAt: Date;
  freshlyGenerated: boolean;
}

const SYSTEM_PROMPT = `You are Operator IQ's research analyst writing the NATIONAL market brief — a "state of the union" across every U.S. metro Operator IQ covers, using the v0.6.4 methodology (7-cell operator taxonomy, gold/silver per-metric stars, share-of-market trajectory, canonical operator identity for multi-market entities).

Tone: institutional. Calm, declarative, structural — Brookings/Urban Institute, not press release. No superlatives, no hype. When data is thin, say so.

Rules:
1. Use ONLY the data in the user message. Do not invent markets, operators, or statistics, and do not assert national patterns the data doesn't support. The user message lists the covered markets implicitly via the standouts — do not claim a specific total metro count beyond what's given.
2. Methodology caveats: share/size are context, not a ranking. The "what moved" figures compare each operator's two most recent snapshots (roughly a month apart, cadence varies by market) — describe them as recent movement, not precise deltas.
3. Output valid JSON exactly matching:
{
  "sinceLastPeriod": "LEAD. 1 paragraph on what moved across markets since the prior snapshot — count of new entrants, notable rating gains/losses, cohort reclassifications, and the biggest estimated-size swings. Name 2-3 operators with markdown links [Name](scorecardUrl). If no change data is provided, return an empty string.",
  "headlineRead": "2-3 sentences. The structural national takeaway right now.",
  "shareMovement": "1 paragraph on standout markets — where rents are running hottest and coldest, and where concessions are most prevalent. Name markets.",
  "operatorLandscape": "1 paragraph on the national operator mix using the 7-cell counts (SFR-dominant nationally? MF/BTR concentration?), and the largest multi-market operators by estimated size. Link operators with [Name](profileUrl).",
  "notableSignals": "1 paragraph naming 2-4 specific operators worth knowing nationally — biggest movers or largest footprints. Use markdown links."
}
4. Word budget: headlineRead ≤ 60 words; each other section ≤ 140 words. Be tight.
5. No raw JSON field names or unitless numbers in prose. Render rents as "+2.1%", shares as "%".
6. Output ONLY the JSON object — no fences, no preamble.`;

function pct(dec: number): string {
  return `${dec >= 0 ? "+" : ""}${(dec * 100).toFixed(1)}%`;
}

function makeUserMessage(data: NationalBriefData): string {
  const lines: string[] = [];
  lines.push(`# National brief input — ${data.marketCount} covered markets`);
  lines.push(`- Methodology ${data.methodologyVersion}, data as of ${data.dataAsOf}`);
  if (data.nationalRentGrowthT12 != null)
    lines.push(`- National rent growth T12: ${pct(data.nationalRentGrowthT12)}`);
  lines.push("");

  lines.push("## Hottest rent markets");
  for (const m of data.hotMarkets) lines.push(`- ${m.marketName} [${m.briefUrl}] — ${pct(m.value)}`);
  lines.push("## Coldest rent markets");
  for (const m of data.coldMarkets) lines.push(`- ${m.marketName} [${m.briefUrl}] — ${pct(m.value)}`);
  lines.push("## Highest concession prevalence (share of eligible cohort)");
  for (const m of data.topConcessionMarkets)
    lines.push(`- ${m.marketName} [${m.briefUrl}] — ${(m.value * 100).toFixed(0)}% of operators`);
  lines.push("");

  lines.push("## National 7-cell operator mix (summed across markets)");
  for (const q of data.quadrantMix) lines.push(`- ${q.cell}: ${q.count} operators (${q.sharePct}%)`);
  lines.push("");

  lines.push("## Largest multi-market operators");
  for (const o of data.largestOperators)
    lines.push(
      `- ${o.name} [/operators/${o.canonicalSlug}] — ${o.marketCount} markets${o.estimatedUnits != null ? `, ~${o.estimatedUnits.toLocaleString()} est. units` : ""}`,
    );
  lines.push("");

  lines.push("## What moved since last snapshot (across all markets)");
  const c = data.sinceLastPeriod;
  if (!c || c.isQuiet) {
    lines.push("(no prior-snapshot change data — return empty sinceLastPeriod)");
  } else {
    if (c.newEntrants.length)
      lines.push(`- New entrants (${c.newEntrants.length}): ${c.newEntrants.map((o) => `${o.name} [${o.scorecardUrl}]`).join(", ")}`);
    if (c.ratingUp.length)
      lines.push(`- Rating gains: ${c.ratingUp.map((o) => `${o.name} [${o.scorecardUrl}] (${o.goldBefore}→${o.goldAfter} gold)`).join(", ")}`);
    if (c.ratingDown.length)
      lines.push(`- Rating losses: ${c.ratingDown.map((o) => `${o.name} [${o.scorecardUrl}] (${o.goldBefore}→${o.goldAfter} gold)`).join(", ")}`);
    if (c.sizeSwings.length)
      lines.push(`- Est. size swings: ${c.sizeSwings.map((o) => `${o.name} [${o.scorecardUrl}] (${o.pctChange >= 0 ? "+" : ""}${Math.round(o.pctChange * 100)}%)`).join(", ")}`);
    if (c.cohortMoves.length)
      lines.push(`- Cohort reclassifications: ${c.cohortMoves.map((o) => `${o.name} [${o.scorecardUrl}] (${o.before} → ${o.after})`).join(", ")}`);
  }
  lines.push("");
  lines.push("---");
  lines.push("Produce the national brief JSON now. Output ONLY the JSON.");
  return lines.join("\n");
}

function inputDigest(data: NationalBriefData): string {
  return crypto
    .createHash("sha256")
    .update(`${PROMPT_VERSION}\n${JSON.stringify(data)}`)
    .digest("hex");
}

async function readCache(data: NationalBriefData): Promise<NationalBriefProse | null> {
  const row = await prisma.marketBrief.findUnique({
    where: {
      marketSlug_methodologyVersion_dataAsOf: {
        marketSlug: NATIONAL_SLUG,
        methodologyVersion: data.methodologyVersion,
        dataAsOf: new Date(data.dataAsOf),
      },
    },
  });
  if (!row || row.inputDigest !== inputDigest(data)) return null;
  return {
    sinceLastPeriod: row.sinceLastPeriod ?? "",
    headlineRead: row.headlineRead,
    shareMovement: row.shareMovement,
    operatorLandscape: row.operatorLandscape,
    notableSignals: row.notableSignals,
    generatedAt: row.generatedAt,
    freshlyGenerated: false,
  };
}

async function writeCache(
  data: NationalBriefData,
  prose: Omit<NationalBriefProse, "generatedAt" | "freshlyGenerated">,
): Promise<Date> {
  const digest = inputDigest(data);
  const fields = {
    sinceLastPeriod: prose.sinceLastPeriod,
    headlineRead: prose.headlineRead,
    shareMovement: prose.shareMovement,
    operatorLandscape: prose.operatorLandscape,
    notableSignals: prose.notableSignals,
    inputDigest: digest,
  };
  const row = await prisma.marketBrief.upsert({
    where: {
      marketSlug_methodologyVersion_dataAsOf: {
        marketSlug: NATIONAL_SLUG,
        methodologyVersion: data.methodologyVersion,
        dataAsOf: new Date(data.dataAsOf),
      },
    },
    create: {
      marketSlug: NATIONAL_SLUG,
      methodologyVersion: data.methodologyVersion,
      dataAsOf: new Date(data.dataAsOf),
      ...fields,
    },
    update: { ...fields, generatedAt: new Date() },
  });
  return row.generatedAt;
}

/** Reads cache; on miss, calls Claude, persists, returns. Throws if
 *  ANTHROPIC_API_KEY is missing (caller falls back to a not-yet-generated UI). */
export async function generateNationalBriefProse(
  data: NationalBriefData,
): Promise<NationalBriefProse> {
  const cached = await readCache(data);
  if (cached) return cached;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured — cannot generate national brief.");

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: makeUserMessage(data) }],
  });
  const text = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  const cleaned = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

  let parsed: {
    sinceLastPeriod?: unknown;
    headlineRead?: unknown;
    shareMovement?: unknown;
    operatorLandscape?: unknown;
    notableSignals?: unknown;
  };
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error("[national-brief-prose] JSON parse failed", err, cleaned);
    throw new Error("Model returned malformed JSON. Try regenerating.");
  }
  for (const key of ["headlineRead", "shareMovement", "operatorLandscape", "notableSignals"] as const) {
    if (typeof parsed[key] !== "string" || (parsed[key] as string).length === 0) {
      throw new Error(`Model response missing or empty "${key}" field. Try regenerating.`);
    }
  }
  const prose = {
    sinceLastPeriod: typeof parsed.sinceLastPeriod === "string" ? parsed.sinceLastPeriod : "",
    headlineRead: parsed.headlineRead as string,
    shareMovement: parsed.shareMovement as string,
    operatorLandscape: parsed.operatorLandscape as string,
    notableSignals: parsed.notableSignals as string,
  };
  const generatedAt = await writeCache(data, prose);
  return { ...prose, generatedAt, freshlyGenerated: true };
}

/** Read-only accessor for the /briefs teaser — cached national prose if any. */
export async function readCachedNationalHeadline(): Promise<string | null> {
  const row = await prisma.marketBrief.findFirst({
    where: { marketSlug: NATIONAL_SLUG },
    orderBy: { generatedAt: "desc" },
    select: { headlineRead: true },
  });
  return row?.headlineRead ?? null;
}
