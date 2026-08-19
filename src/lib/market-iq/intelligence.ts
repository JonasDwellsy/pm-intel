import type { MarketIqMarketCell, MarketIqReportSnapshot } from "@/lib/market-iq/report/report";

export type MarketIqPosture = {
  key: string;
  label: string;
  rent: number;
  yearOverYearPct: number | null;
  recentPct: number | null;
  month: string | null;
  localAgreement: { direction: "rising" | "softening" | "mixed"; matching: number; total: number } | null;
};

export type MarketIqDecisionFinding = {
  id: string;
  rank: number;
  tone: "rising" | "softening" | "mixed" | "supply";
  eyebrow: string;
  headline: string;
  detail: string;
  evidence: string;
  score: number;
};

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function recentChange(cell: MarketIqMarketCell) {
  if (cell.series.length < 2) return null;
  const latest = cell.series.at(-1);
  const comparison = cell.series[Math.max(0, cell.series.length - 4)];
  if (!latest || !comparison || comparison.rent <= 0 || latest.month === comparison.month) return null;
  return ((latest.rent - comparison.rent) / comparison.rent) * 100;
}

function direction(value: number | null, threshold = 1): "rising" | "softening" | "mixed" {
  if (value === null || Math.abs(value) < threshold) return "mixed";
  return value > 0 ? "rising" : "softening";
}

function localAgreement(cell: MarketIqMarketCell, cells: MarketIqMarketCell[]): MarketIqPosture["localAgreement"] {
  const local = cells.filter((candidate) =>
    candidate.status === "reportable" &&
    candidate.geographyType !== "msa" &&
    candidate.propertyType === cell.propertyType &&
    candidate.bedrooms === cell.bedrooms &&
    candidate.yearOverYearPct !== null,
  );
  if (local.length < 3) return null;
  const rising = local.filter((candidate) => (candidate.yearOverYearPct ?? 0) >= 1).length;
  const softening = local.filter((candidate) => (candidate.yearOverYearPct ?? 0) <= -1).length;
  const matching = Math.max(rising, softening);
  const localDirection = rising === softening ? "mixed" : rising > softening ? "rising" : "softening";
  return { direction: localDirection, matching, total: local.length };
}

export function buildMarketIqPostures(cells: MarketIqMarketCell[]): MarketIqPosture[] {
  return cells
    .filter((cell) => cell.status === "reportable" && cell.geographyType === "msa" && cell.rent !== null && cell.bedrooms !== 999)
    .map((cell) => ({
      key: cell.key,
      label: cell.label,
      rent: cell.rent ?? 0,
      yearOverYearPct: cell.yearOverYearPct,
      recentPct: recentChange(cell),
      month: cell.month,
      localAgreement: localAgreement(cell, cells),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function pct(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function strongestPostureFinding(posture: MarketIqPosture, marketName: string): MarketIqDecisionFinding {
  const postureDirection = direction(posture.yearOverYearPct);
  const recentDirection = direction(posture.recentPct);
  const corroborated = posture.localAgreement?.direction === postureDirection && posture.localAgreement.matching / posture.localAgreement.total >= 0.6;
  const headlineDirection = postureDirection === "mixed" ? "holding near last year" : postureDirection === "rising" ? "rising" : "softening";
  const localDetail = posture.localAgreement
    ? ` ${posture.localAgreement.matching} of ${posture.localAgreement.total} current local reads point ${posture.localAgreement.direction === "mixed" ? "in different directions" : posture.localAgreement.direction}.`
    : "";
  return {
    id: `posture:${posture.key}`,
    rank: 0,
    tone: postureDirection,
    eyebrow: posture.label,
    headline: `${posture.label} are ${headlineDirection} in ${marketName}`,
    detail: `The MSA benchmark is ${pct(posture.yearOverYearPct ?? 0)} year over year${recentDirection !== "mixed" ? ` and ${recentDirection} over the latest three-month window` : ""}.${localDetail}`,
    evidence: `${posture.localAgreement ? `${posture.localAgreement.matching}/${posture.localAgreement.total} local agreement` : "MSA trajectory"} · ${posture.month?.slice(0, 7) ?? "latest month"}`,
    score: Math.min(20, Math.abs(posture.yearOverYearPct ?? 0)) + (recentDirection === postureDirection ? 7 : 0) + (corroborated ? 9 : 0),
  };
}

export function buildMarketIqDecisionFindings(report: MarketIqReportSnapshot, marketName: string): MarketIqDecisionFinding[] {
  const postures = buildMarketIqPostures(report.marketRead.cells);
  const strongestByProduct = (["apartment", "house"] as const).flatMap((propertyType) => {
    const candidates = postures.filter((posture) => posture.key.includes(`:${propertyType}:`));
    const strongest = candidates.map((posture) => strongestPostureFinding(posture, marketName)).sort((a, b) => b.score - a.score)[0];
    return strongest ? [strongest] : [];
  });
  const findings: MarketIqDecisionFinding[] = [...strongestByProduct];

  const apartmentMedian = median(postures.filter((posture) => posture.key.includes(":apartment:")).flatMap((posture) => posture.yearOverYearPct === null ? [] : [posture.yearOverYearPct]));
  const houseMedian = median(postures.filter((posture) => posture.key.includes(":house:")).flatMap((posture) => posture.yearOverYearPct === null ? [] : [posture.yearOverYearPct]));
  if (apartmentMedian !== null && houseMedian !== null && Math.abs(houseMedian - apartmentMedian) >= 3) {
    const stronger = houseMedian > apartmentMedian ? "Houses" : "Apartments";
    findings.push({
      id: "product-divergence",
      rank: 0,
      tone: "mixed",
      eyebrow: "Product split",
      headline: `${stronger} are holding up better than the other major rental category`,
      detail: `The median MSA trajectory is ${pct(apartmentMedian)} for apartment benchmarks and ${pct(houseMedian)} for house benchmarks. Treating the market as a single rent story would hide that gap.`,
      evidence: `${postures.length} consistent MSA product benchmarks`,
      score: 18 + Math.min(12, Math.abs(houseMedian - apartmentMedian)),
    });
  }

  const historical = report.marketConditions.historical;
  if (historical) {
    const supplyDirection = historical.newListingsChange >= 5 ? "expanded" : historical.newListingsChange <= -5 ? "contracted" : "held broadly steady";
    findings.push({
      id: "listing-pressure",
      rank: 0,
      tone: "supply",
      eyebrow: "Listing pressure",
      headline: `New listing supply ${supplyDirection} in the latest measured period`,
      detail: `${historical.newListings30d.toLocaleString("en-US")} listings entered the market over 30 days, ${pct(historical.newListingsChange)} versus the prior 30-day period. Median advertised time on market was ${Math.round(historical.medianDom)} days.`,
      evidence: `${historical.activeAtCutoff.toLocaleString("en-US")} active at the source cutoff`,
      score: 16 + Math.min(12, Math.abs(historical.newListingsChange)),
    });
  }

  return findings
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((finding, index) => ({ ...finding, rank: index + 1 }));
}
