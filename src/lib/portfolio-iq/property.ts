export interface SubjectListingObservation {
  askingRent: number | null;
  squareFeet: number | null;
  bedrooms: number | null;
  activatedAt: Date | null;
  deactivatedAt: Date | null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentChange(current: number | null, prior: number | null): number | null {
  if (current === null || prior === null || prior === 0) return null;
  return ((current - prior) / prior) * 100;
}

export function buildSubjectPerformance(input: {
  observations: SubjectListingObservation[];
  availableThrough: Date;
  compAskingRents: number[];
  compRentPerSqFt: number[];
}) {
  const cutoff = input.availableThrough.getTime();
  const day = 86_400_000;
  const yearStart = cutoff - 365 * day;
  const currentStart = cutoff - 90 * day;
  const priorStart = cutoff - 180 * day;
  const trailing = input.observations.filter((row) => row.activatedAt && row.activatedAt.getTime() >= yearStart);
  const current = trailing.filter((row) => row.activatedAt && row.activatedAt.getTime() >= currentStart);
  const prior = trailing.filter((row) => {
    const time = row.activatedAt?.getTime();
    return time !== undefined && time >= priorStart && time < currentStart;
  });
  const askingRent = median(trailing.flatMap((row) => row.askingRent && row.askingRent > 0 ? [row.askingRent] : []));
  const rentPerSqFt = median(trailing.flatMap((row) =>
    row.askingRent && row.squareFeet && row.squareFeet > 0 ? [row.askingRent / row.squareFeet] : []
  ));
  const medianBedrooms = median(trailing.flatMap((row) => row.bedrooms !== null ? [row.bedrooms] : []));
  const medianDom = median(trailing.flatMap((row) => {
    if (!row.activatedAt) return [];
    const end = Math.min(row.deactivatedAt?.getTime() ?? cutoff, cutoff);
    const days = (end - row.activatedAt.getTime()) / day;
    return days >= 0 ? [days] : [];
  }));
  const currentRent = median(current.flatMap((row) => row.askingRent && row.askingRent > 0 ? [row.askingRent] : []));
  const priorRent = median(prior.flatMap((row) => row.askingRent && row.askingRent > 0 ? [row.askingRent] : []));
  const compAskingRent = median(input.compAskingRents.filter((value) => value > 0));
  const compRentPerSqFt = median(input.compRentPerSqFt.filter((value) => value > 0));

  return {
    observationCount: trailing.length,
    askingRent,
    rentPerSqFt,
    medianBedrooms,
    medianDom,
    recentListingCount: current.length,
    priorListingCount: prior.length,
    askingRentChange90d: percentChange(currentRent, priorRent),
    askingRentVsComps: percentChange(askingRent, compAskingRent),
    rentPerSqFtVsComps: percentChange(rentPerSqFt, compRentPerSqFt),
    compAskingRent,
    compRentPerSqFt,
  };
}

export function propertyDecisionRead(input: {
  propertyName: string;
  observationCount: number;
  askingRentVsComps: number | null;
  askingRentChange90d: number | null;
  alertHeadline?: string;
}): string {
  if (input.observationCount === 0) {
    return `${input.propertyName} does not yet have enough matched subject listing observations for a defensible rent comparison. Dwellsy is preserving the gap rather than substituting market data.`;
  }
  const parts: string[] = [];
  if (input.askingRentVsComps !== null) {
    parts.push(`observed asking rent is ${Math.abs(input.askingRentVsComps).toFixed(1)}% ${input.askingRentVsComps >= 0 ? "above" : "below"} the proposed comp median`);
  }
  if (input.askingRentChange90d !== null) {
    parts.push(`recent asking rent is ${input.askingRentChange90d >= 0 ? "up" : "down"} ${Math.abs(input.askingRentChange90d).toFixed(1)}% versus the prior 90-day window`);
  }
  if (input.alertHeadline) parts.push(input.alertHeadline.toLowerCase());
  return parts.length > 0
    ? `${input.propertyName}: ${parts.join(", while ")}.`
    : `${input.propertyName} has ${input.observationCount} matched asking-listing observations. More history is needed before calling a material change.`;
}
