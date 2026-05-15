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
