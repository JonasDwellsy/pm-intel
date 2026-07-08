// Pure digest composer. No I/O. Turns per-list operator changes into a
// {subject, html, text} email, or null when there is nothing to report.
// The diff engine (change-detection.ts) is slug-keyed and carries no display
// strings, so the caller supplies name/market/scorecardUrl per operator.
import type { OperatorChange, ChangeType } from "./change-detection";

export interface DigestOperatorInput {
  pmSlug: string;
  name: string;
  marketLabel: string;
  scorecardUrl: string;
  changes: OperatorChange[];
}
export interface DigestListInput {
  watchListName: string;
  operators: DigestOperatorInput[];
}
export interface DigestInput {
  recipientFirstName: string | null;
  monthLabel: string;
  lists: DigestListInput[];
  unsubscribeUrl: string;
  scorecardBaseUrl: string;
}
export interface DigestEmail {
  subject: string;
  html: string;
  text: string;
}

// Lead with the high-signal changes; group the noisier ones after.
const SALIENCE: Record<ChangeType, number> = {
  star: 0,
  eligibility_flip: 1,
  market_added: 2,
  market_dropped: 2,
  portfolio_band: 3,
  portfolio_size: 4,
  concession_transition: 5,
  concession_shift: 5,
  submarket_added: 6,
  submarket_dropped: 6,
};

const METRIC_LABEL: Record<string, string> = {
  leaseUp: "Lease-up",
  tenancy: "Tenant retention",
  rentPerformance: "Rent performance",
  marketingDiscipline: "Marketing discipline",
  inventoryTransparency: "Inventory transparency",
};

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
function star(s: "gold" | "silver" | null): string {
  return s === null ? "no star" : s;
}

export function describeChange(c: OperatorChange): string {
  switch (c.type) {
    case "star":
      return `${METRIC_LABEL[c.metric] ?? c.metric}: ${star(c.before)} → ${star(c.after)}`;
    case "eligibility_flip":
      return c.direction === "entered"
        ? "Entered the ranked cohort"
        : "Dropped below the ranking threshold";
    case "market_added":
      return `Entered a new market (${c.marketId})`;
    case "market_dropped":
      return `Left a market (${c.marketId})`;
    case "portfolio_band":
      return `Portfolio confidence band: ${c.before ?? "—"} → ${c.after ?? "—"}`;
    case "portfolio_size": {
      const dir = c.pctChange >= 0 ? "up" : "down";
      return `Estimated portfolio ${dir} ${pct(Math.abs(c.pctChange))} (${c.before ?? "—"} → ${c.after ?? "—"})`;
    }
    case "concession_transition":
      return c.direction === "appeared"
        ? `Started advertising concessions (${c.after != null ? pct(c.after) : "—"})`
        : "Stopped advertising concessions";
    case "concession_shift": {
      const dir = c.after >= c.before ? "up" : "down";
      return `Concessions ${dir} ${Math.abs(Math.round(c.deltaPp))}pp (${pct(c.before)} → ${pct(c.after)})`;
    }
    case "submarket_added":
      return `Active in a new submarket (${c.submarketSlug})`;
    case "submarket_dropped":
      return `Left a submarket (${c.submarketSlug})`;
  }
}

function sortChanges(changes: OperatorChange[]): OperatorChange[] {
  return [...changes].sort((a, b) => SALIENCE[a.type] - SALIENCE[b.type]);
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildDigest(input: DigestInput): DigestEmail | null {
  const lists = input.lists
    .map((l) => ({ ...l, operators: l.operators.filter((o) => o.changes.length > 0) }))
    .filter((l) => l.operators.length > 0);
  if (lists.length === 0) return null;

  const opCount = lists.reduce((n, l) => n + l.operators.length, 0);
  const subject = `Your Dwellsy IQ watch-list update — ${input.monthLabel}`;
  const greeting = input.recipientFirstName ? `Hi ${input.recipientFirstName},` : "Hi,";
  const lede = `${opCount} watched operator${opCount === 1 ? "" : "s"} changed in the latest data (${input.monthLabel}).`;

  // ---- text ----
  const textParts: string[] = [greeting, "", lede, ""];
  for (const l of lists) {
    textParts.push(`## ${l.watchListName}`);
    for (const o of l.operators) {
      textParts.push(`- ${o.name} (${o.marketLabel}) — ${o.scorecardUrl}`);
      for (const c of sortChanges(o.changes)) textParts.push(`    • ${describeChange(c)}`);
    }
    textParts.push("");
  }
  textParts.push(`Unsubscribe: ${input.unsubscribeUrl}`);
  const text = textParts.join("\n");

  // ---- html ----
  const sections = lists
    .map((l) => {
      const rows = l.operators
        .map((o) => {
          const items = sortChanges(o.changes)
            .map((c) => `<li style="margin:2px 0;color:#2a3547;font-size:13px;">${esc(describeChange(c))}</li>`)
            .join("");
          return `
            <tr><td style="padding:10px 0;border-top:1px solid #eef1f6;">
              <a href="${esc(o.scorecardUrl)}" style="font-weight:600;color:#0f1f3f;text-decoration:none;font-size:14px;">${esc(o.name)}</a>
              <span style="color:#6b7688;font-size:12px;"> · ${esc(o.marketLabel)}</span>
              <ul style="margin:6px 0 0;padding-left:18px;">${items}</ul>
            </td></tr>`;
        })
        .join("");
      return `
        <h2 style="font-size:15px;color:#0f1f3f;margin:20px 0 4px;">${esc(l.watchListName)}</h2>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`;
    })
    .join("");

  const html = `<!-- Dwellsy IQ watch-list digest -->
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;color:#2a3547;">
  <p style="font-size:14px;">${esc(greeting)}</p>
  <p style="font-size:14px;">${esc(lede)}</p>
  ${sections}
  <hr style="border:none;border-top:1px solid #eef1f6;margin:24px 0 12px;">
  <p style="font-size:11px;color:#8894ac;">
    You receive this because your organization has a Dwellsy IQ watch list.
    <a href="${esc(input.unsubscribeUrl)}" style="color:#8894ac;">Unsubscribe</a>.<br>
    Dwellsy, Inc.
  </p>
</div>`;

  return { subject, html, text };
}
