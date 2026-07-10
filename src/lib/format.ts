export function fmtNumber(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtInt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/** Round an estimated portfolio-size figure for display: to the nearest 5
 *  below 100, and the nearest 10 at/above 100. Portfolio size is an estimate,
 *  not an exact count — rounding keeps small operators legible while signalling
 *  that larger figures aren't precise. Pass-through for null/undefined and
 *  non-finite input. Apply at every surface that shows a portfolio-size figure
 *  so the number is consistent site-wide. */
export function roundPortfolioUnits(
  n: number | null | undefined
): number | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const step = Math.abs(n) < 100 ? 5 : 10;
  return Math.round(n / step) * step;
}

export function fmtPct(n: number | null | undefined, digits = 1, signed = false): string {
  if (n === null || n === undefined) return "—";
  const v = n.toFixed(digits);
  const sign = signed && n > 0 ? "+" : "";
  return `${sign}${v}%`;
}

export function fmtDays(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${fmtNumber(n, 1)} d`;
}

/** Title-case a hyphenated slug for display: "north-carolina" → "North
 *  Carolina", "rock-hill-nc" → "Rock Hill Nc". Hyphens become spaces and every
 *  word boundary is capitalized. Consolidates the identical state-slug → title
 *  transform previously inlined across the market / scorecard / compare
 *  surfaces (behavior-preserving — same regex those sites used). */
export function titleCaseSlug(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  // Methodology dates are calendar dates, not local-clock dates. Format in UTC
  // so a "2026-03-05" data-as-of renders as Mar 5 in every timezone.
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
