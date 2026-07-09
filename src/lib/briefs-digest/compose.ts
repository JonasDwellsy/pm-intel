// Market-brief digest email — pure composer (Briefs V2 Phase 3). Given the
// distilled national + per-market change counts (computed in run.ts from the
// same snapshot data as the briefs), produce {subject, html, text} or null when
// there's nothing worth sending. No I/O, no server-only imports — unit-tested.
//
// The email is a DIGEST: compact change counts + links to the full web briefs
// (which carry the LLM prose). No LLM call in the cron path.

export interface BriefDigestChangeCounts {
  newEntrants: number;
  ratingGains: number;
  ratingLosses: number;
  cohortMoves: number;
}

export interface BriefDigestMarketLine extends BriefDigestChangeCounts {
  marketName: string;
  briefUrl: string; // absolute
}

export interface BriefDigestInput {
  recipientFirstName: string | null;
  monthLabel: string;
  nationalUrl: string; // absolute /briefs/national
  nationalHeadline: string | null;
  national: BriefDigestChangeCounts | null;
  /** The recipient's entitled markets that had at least one change this period. */
  markets: BriefDigestMarketLine[];
  unsubscribeUrl: string;
}

export interface BriefDigestEmail {
  subject: string;
  html: string;
  text: string;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hasAny(c: BriefDigestChangeCounts | null): boolean {
  return !!c && c.newEntrants + c.ratingGains + c.ratingLosses + c.cohortMoves > 0;
}

/** "2 new entrants · 1 rating gain · 1 reclassification" (omits zero terms). */
function countPhrase(c: BriefDigestChangeCounts): string {
  const parts: string[] = [];
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (c.newEntrants) parts.push(plural(c.newEntrants, "new entrant", "new entrants"));
  if (c.ratingGains) parts.push(plural(c.ratingGains, "rating gain", "rating gains"));
  if (c.ratingLosses) parts.push(plural(c.ratingLosses, "rating loss", "rating losses"));
  if (c.cohortMoves) parts.push(plural(c.cohortMoves, "reclassification", "reclassifications"));
  return parts.length ? parts.join(" · ") : "no material change";
}

export function buildBriefDigestEmail(input: BriefDigestInput): BriefDigestEmail | null {
  // Nothing to say → no email (per-recipient gate should already filter, but be safe).
  if (!input.nationalHeadline && !hasAny(input.national) && input.markets.length === 0) {
    return null;
  }

  const greeting = input.recipientFirstName ? `Hi ${input.recipientFirstName},` : "Hi,";
  const subject = `Dwellsy IQ market briefs — ${input.monthLabel}`;

  // ---- text ----
  const t: string[] = [greeting, "", `Your ${input.monthLabel} market briefs.`, ""];
  t.push("NATIONAL");
  if (input.nationalHeadline) t.push(input.nationalHeadline);
  if (hasAny(input.national)) t.push(`This period: ${countPhrase(input.national!)}.`);
  t.push(`Read the national brief: ${input.nationalUrl}`);
  t.push("");
  if (input.markets.length) {
    t.push("YOUR MARKETS");
    for (const m of input.markets) {
      t.push(`- ${m.marketName}: ${countPhrase(m)} — ${m.briefUrl}`);
    }
    t.push("");
  }
  t.push(`Unsubscribe: ${input.unsubscribeUrl}`);
  const text = t.join("\n");

  // ---- html ----
  const marketRows = input.markets
    .map(
      (m) =>
        `<li style="margin:0 0 8px"><a href="${esc(m.briefUrl)}" style="color:#155772;font-weight:600;text-decoration:none">${esc(m.marketName)}</a> — <span style="color:#5b6577">${esc(countPhrase(m))}</span></li>`,
    )
    .join("");
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#0f1f3f">
  <p style="font-size:14px;color:#2a3547">${esc(greeting)}</p>
  <p style="font-size:14px;color:#2a3547">Your <strong>${esc(input.monthLabel)}</strong> market briefs.</p>
  <h2 style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8894ac;margin:20px 0 6px">National</h2>
  ${input.nationalHeadline ? `<p style="font-size:15px;line-height:1.5;color:#0f1f3f;margin:0 0 6px">${esc(input.nationalHeadline)}</p>` : ""}
  ${hasAny(input.national) ? `<p style="font-size:13px;color:#5b6577;margin:0 0 8px">This period: ${esc(countPhrase(input.national!))}.</p>` : ""}
  <p style="margin:0 0 4px"><a href="${esc(input.nationalUrl)}" style="color:#155772;font-weight:600;text-decoration:none">Read the national brief →</a></p>
  ${
    input.markets.length
      ? `<h2 style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8894ac;margin:22px 0 6px">Your markets</h2><ul style="list-style:none;padding:0;margin:0;font-size:14px">${marketRows}</ul>`
      : ""
  }
  <p style="font-size:11px;color:#8894ac;margin:28px 0 0;border-top:1px solid #eef1f6;padding-top:12px">You're receiving this because your organization has Dwellsy IQ access. <a href="${esc(input.unsubscribeUrl)}" style="color:#8894ac">Unsubscribe from brief emails</a>.</p>
</div>`;

  return { subject, html, text };
}
