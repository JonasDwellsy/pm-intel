import type {
  MarketIqEditionComparison,
  MarketIqEditionFinding,
  MarketIqMarketCell,
  MarketIqReportSnapshot,
} from "@/lib/market-iq/report/report";

export type PriorMarketIqEdition = {
  id: string;
  periodLabel: string;
  publishedAt: string | null;
  snapshot: MarketIqReportSnapshot;
};

function percentChange(current: number, prior: number) {
  return prior === 0 ? null : ((current - prior) / prior) * 100;
}

function direction(value: number | null) {
  if (value === null) return "unavailable";
  if (value >= 1) return "rising";
  if (value <= -1) return "softening";
  return "stable";
}

function signed(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function money(value: number) {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function findingId(kind: MarketIqEditionFinding["kind"], cell: MarketIqMarketCell) {
  return `${kind}:${cell.key}`;
}

function compareCell(current: MarketIqMarketCell, prior: MarketIqMarketCell): MarketIqEditionFinding[] {
  if (current.status !== "reportable" && prior.status !== "reportable") return [];
  if (current.status !== prior.status) {
    const newlyReportable = current.status === "reportable";
    return [{
      id: findingId("coverage_change", current),
      kind: "coverage_change",
      importance: "medium",
      headline: `${current.geographyLabel} ${current.label.toLowerCase()} ${newlyReportable ? "now clear" : "no longer clear"} the reporting threshold`,
      detail: newlyReportable
        ? `The latest Trends IQ month has N=${current.observations.toLocaleString("en-US")}. This is a coverage change, not evidence that rent itself moved.`
        : `The latest Trends IQ cell is withheld. The prior edition reported N=${prior.observations.toLocaleString("en-US")}.`,
      geographyType: current.geographyType,
      geographyLabel: current.geographyLabel,
      segmentLabel: current.label,
      currentValue: current.rent,
      priorValue: prior.rent,
      currentMonth: current.month,
      priorMonth: prior.month,
      observations: current.observations,
    }];
  }
  if (current.status !== "reportable" || prior.status !== "reportable" || current.rent === null || prior.rent === null) return [];

  const findings: MarketIqEditionFinding[] = [];
  const currentDirection = direction(current.yearOverYearPct);
  const priorDirection = direction(prior.yearOverYearPct);
  const rentMove = percentChange(current.rent, prior.rent);
  if (currentDirection !== priorDirection && currentDirection !== "unavailable" && priorDirection !== "unavailable") {
    const levelContext = rentMove !== null && Math.abs(rentMove) >= 3
      ? ` The published rent level also changed from ${money(prior.rent)} to ${money(current.rent)}, a ${signed(rentMove)} move between editions.`
      : "";
    findings.push({
      id: findingId("direction_change", current),
      kind: "direction_change",
      importance: "high",
      headline: `${current.geographyLabel} ${current.label.toLowerCase()} shifted from ${priorDirection} to ${currentDirection}`,
      detail: `The Trends IQ year-over-year read moved from ${signed(prior.yearOverYearPct ?? 0)} to ${signed(current.yearOverYearPct ?? 0)}.${levelContext} Latest sample N=${current.observations.toLocaleString("en-US")}.`,
      geographyType: current.geographyType,
      geographyLabel: current.geographyLabel,
      segmentLabel: current.label,
      currentValue: current.yearOverYearPct,
      priorValue: prior.yearOverYearPct,
      currentMonth: current.month,
      priorMonth: prior.month,
      observations: current.observations,
    });
  }

  if (!findings.length && rentMove !== null && Math.abs(rentMove) >= 3) {
    findings.push({
      id: findingId("rent_move", current),
      kind: "rent_move",
      importance: Math.abs(rentMove) >= 5 ? "high" : "medium",
      headline: `${current.geographyLabel} ${current.label.toLowerCase()} rent level moved ${signed(rentMove)} since the prior edition`,
      detail: `The published Trends IQ level changed from ${money(prior.rent)} to ${money(current.rent)}. Latest sample N=${current.observations.toLocaleString("en-US")}.`,
      geographyType: current.geographyType,
      geographyLabel: current.geographyLabel,
      segmentLabel: current.label,
      currentValue: current.rent,
      priorValue: prior.rent,
      currentMonth: current.month,
      priorMonth: prior.month,
      observations: current.observations,
    });
  }
  return findings;
}

function rankFinding(finding: MarketIqEditionFinding) {
  const importance = finding.importance === "high" ? 100 : 50;
  const geography = finding.geographyType === "msa" ? 30 : finding.geographyType === "city" ? 20 : finding.geographyType === "zip" ? 10 : 0;
  const kind = finding.kind === "direction_change" ? 8 : finding.kind === "rent_move" ? 6 : 2;
  const magnitude = Math.min(20, Math.abs((finding.currentValue ?? 0) - (finding.priorValue ?? 0)));
  return importance + geography + kind + magnitude;
}

export function compareMarketIqEditions(
  current: MarketIqReportSnapshot,
  prior: PriorMarketIqEdition | null,
): MarketIqEditionComparison {
  if (!prior) {
    return {
      state: "baseline",
      heading: "This is the launch baseline",
      narrative: "There is no earlier published edition for this firm and market. The next read will identify material changes against this frozen baseline.",
      priorReportId: null,
      priorPeriodLabel: null,
      priorPublishedAt: null,
      findings: [],
    };
  }

  const priorCells = new Map(prior.snapshot.marketRead.cells.map((cell) => [cell.key, cell]));
  const findings = current.marketRead.cells.flatMap((cell) => {
    const priorCell = priorCells.get(cell.key);
    return priorCell ? compareCell(cell, priorCell) : [];
  });
  const currentListings = current.marketConditions.historical?.newListings30d;
  const priorListings = prior.snapshot.marketConditions.historical?.newListings30d;
  if (currentListings !== undefined && priorListings !== undefined) {
    const listingMove = percentChange(currentListings, priorListings);
    if (listingMove !== null && Math.abs(listingMove) >= 10) {
      findings.push({
        id: "listing_change:market",
        kind: "listing_change",
        importance: Math.abs(listingMove) >= 20 ? "high" : "medium",
        headline: `New-listing volume moved ${signed(listingMove)} since the prior edition`,
        detail: `The Total IQ 30-day count changed from ${priorListings.toLocaleString("en-US")} to ${currentListings.toLocaleString("en-US")}. This is listing activity, not a rent statistic.`,
        geographyType: "market",
        geographyLabel: current.scope.marketName,
        segmentLabel: null,
        currentValue: currentListings,
        priorValue: priorListings,
        currentMonth: current.scope.periodEnd,
        priorMonth: prior.snapshot.scope.periodEnd,
        observations: null,
      });
    }
  }

  const ranked = findings.sort((a, b) => rankFinding(b) - rankFinding(a) || a.headline.localeCompare(b.headline)).slice(0, 5);
  if (!ranked.length) {
    return {
      state: "unchanged",
      heading: "No material change since the prior edition",
      narrative: "The selected reportable Trends IQ cells did not cross a direction band or move at least 3% in rent level. Listing volume also stayed within the materiality threshold.",
      priorReportId: prior.id,
      priorPeriodLabel: prior.periodLabel,
      priorPublishedAt: prior.publishedAt,
      findings: [],
    };
  }
  return {
    state: "changed",
    heading: `${ranked.length} material ${ranked.length === 1 ? "change" : "changes"} since the prior edition`,
    narrative: "These changes passed the reporting thresholds and use the same selected geography and segment definitions as this edition.",
    priorReportId: prior.id,
    priorPeriodLabel: prior.periodLabel,
    priorPublishedAt: prior.publishedAt,
    findings: ranked,
  };
}
