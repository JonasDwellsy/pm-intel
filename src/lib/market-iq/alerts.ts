import type { MarketIqTrendPoint } from "@/lib/market-iq/trends";

export interface MarketIqAlertCandidate {
  propertyType: string;
  bedrooms: number;
  signalType: "yoy_growth" | "yoy_softening" | "monthly_move";
  severity: "watch" | "material";
  headline: string;
  narrative: string;
  observedMonth: Date;
}

function segmentLabel(propertyType: string, bedrooms: number) {
  return `${bedrooms}-bed ${propertyType}`;
}

export function buildTrendAlertCandidates(points: MarketIqTrendPoint[]): MarketIqAlertCandidate[] {
  if (!points.length) return [];
  const latestMonth = points.reduce((latest, point) => point.month > latest ? point.month : latest, points[0].month);
  const priorMonth = new Date(Date.UTC(latestMonth.getUTCFullYear(), latestMonth.getUTCMonth() - 1, 1));
  const alerts: MarketIqAlertCandidate[] = [];
  for (const point of points.filter((candidate) => candidate.month.getTime() === latestMonth.getTime() && candidate.observations >= 3)) {
    const label = segmentLabel(point.propertyType, point.bedrooms);
    if (point.yearOverYearPct !== null && point.yearOverYearPct >= 5) {
      alerts.push({
        propertyType: point.propertyType,
        bedrooms: point.bedrooms,
        signalType: "yoy_growth",
        severity: point.yearOverYearPct >= 8 ? "material" : "watch",
        headline: `${label} asking rents are rising`,
        narrative: `Asking rent is up ${point.yearOverYearPct.toFixed(1)}% year over year to $${point.askingRent.toLocaleString("en-US")}, based on ${point.observations.toLocaleString("en-US")} observations.`,
        observedMonth: point.month,
      });
    } else if (point.yearOverYearPct !== null && point.yearOverYearPct <= -3) {
      alerts.push({
        propertyType: point.propertyType,
        bedrooms: point.bedrooms,
        signalType: "yoy_softening",
        severity: point.yearOverYearPct <= -6 ? "material" : "watch",
        headline: `${label} asking rents are softening`,
        narrative: `Asking rent is down ${Math.abs(point.yearOverYearPct).toFixed(1)}% year over year to $${point.askingRent.toLocaleString("en-US")}, based on ${point.observations.toLocaleString("en-US")} observations.`,
        observedMonth: point.month,
      });
    }
    const prior = points.find((candidate) =>
      candidate.month.getTime() === priorMonth.getTime() &&
      candidate.propertyType === point.propertyType &&
      candidate.bedrooms === point.bedrooms &&
      candidate.observations >= 3
    );
    if (prior && prior.askingRent > 0) {
      const change = ((point.askingRent - prior.askingRent) / prior.askingRent) * 100;
      if (Math.abs(change) >= 3) {
        alerts.push({
          propertyType: point.propertyType,
          bedrooms: point.bedrooms,
          signalType: "monthly_move",
          severity: Math.abs(change) >= 6 ? "material" : "watch",
          headline: `${label} moved ${change >= 0 ? "higher" : "lower"} this month`,
          narrative: `Asking rent changed ${change >= 0 ? "+" : ""}${change.toFixed(1)}% from the prior month to $${point.askingRent.toLocaleString("en-US")}.`,
          observedMonth: point.month,
        });
      }
    }
  }
  return alerts;
}
