export interface MarketIqTrendPoint {
  month: Date;
  propertyType: string;
  bedrooms: number;
  observations: number;
  askingRent: number;
  yearOverYearPct: number | null;
}

export interface MarketIqTrendPulse {
  trendSource: {
    name: string;
    availableThrough: string;
    geographyType: string;
    geographyValue: string;
    displayLabel: string;
  };
  segments: Array<{
    label: string;
    rent: number;
    yoy: number;
    observations: number;
  }>;
  signal: {
    heading: string;
    narrative: string;
  };
  alerts: Array<{
    id: string;
    severity: string;
    headline: string;
    narrative: string;
  }>;
}

const PILOT_SEGMENTS = [
  { propertyType: "apartment", bedrooms: 0, label: "Studio apartment" },
  { propertyType: "apartment", bedrooms: 1, label: "1-bed apartment" },
  { propertyType: "apartment", bedrooms: 2, label: "2-bed apartment" },
  { propertyType: "house", bedrooms: 2, label: "2-bed house" },
  { propertyType: "house", bedrooms: 3, label: "3-bed house" },
  { propertyType: "house", bedrooms: 4, label: "4-bed house" },
] as const;

export function buildMarketIqTrendPulse(input: {
  sourceName: string;
  geographyType: string;
  geographyValue: string;
  displayLabel?: string;
  points: MarketIqTrendPoint[];
  alerts?: MarketIqTrendPulse["alerts"];
}): MarketIqTrendPulse {
  if (!input.points.length) throw new Error("Market IQ trend snapshot has no observations.");
  const latestMonth = input.points.reduce(
    (latest, point) => point.month > latest ? point.month : latest,
    input.points[0].month
  );
  const segments = PILOT_SEGMENTS.flatMap((segment) => {
    const point = input.points.find(
      (candidate) =>
        candidate.month.getTime() === latestMonth.getTime() &&
        candidate.propertyType === segment.propertyType &&
        candidate.bedrooms === segment.bedrooms
    );
    if (!point || point.yearOverYearPct === null || point.observations < 3) return [];
    return [{
      label: segment.label,
      rent: point.askingRent,
      yoy: point.yearOverYearPct,
      observations: point.observations,
    }];
  });
  if (!segments.length) throw new Error("Market IQ trend snapshot has no reportable pilot segments.");
  const strongest = [...segments].sort((a, b) => b.yoy - a.yoy)[0];
  const direction = strongest.yoy >= 0 ? "tightening" : "softening";
  return {
    trendSource: {
      name: input.sourceName,
      availableThrough: latestMonth.toISOString().slice(0, 10),
      geographyType: input.geographyType,
      geographyValue: input.geographyValue,
      displayLabel: input.displayLabel ?? input.geographyValue,
    },
    segments,
    signal: {
      heading: `${strongest.label[0].toUpperCase()}${strongest.label.slice(1)}s are ${direction}`,
      narrative: `Asking rent reached $${strongest.rent.toLocaleString("en-US")}, ${strongest.yoy >= 0 ? "up" : "down"} ${Math.abs(strongest.yoy).toFixed(1)}% year over year. That is the strongest growth among the reportable pilot segments and is supported by ${strongest.observations.toLocaleString("en-US")} monthly observations.`,
    },
    alerts: input.alerts ?? [],
  };
}
