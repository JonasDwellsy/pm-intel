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

import { wrapEmail, emailSectionLabel, emailButton, EMAIL } from "@/lib/email/layout";

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
  const subject = `Dwellsy IQ Markets market briefs — ${input.monthLabel}`;

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
      (m, i) =>
        `<tr><td style="padding:10px 0;${i > 0 ? `border-top:1px solid ${EMAIL.hairline};` : ""}">
          <a href="${esc(m.briefUrl)}" style="font-size:14px;font-weight:600;color:${EMAIL.teal};text-decoration:none">${esc(m.marketName)}</a>
          <div style="font-size:12.5px;color:${EMAIL.slate};margin-top:2px">${esc(countPhrase(m))}</div>
        </td></tr>`,
    )
    .join("");

  const content = `
    <p style="font-size:15px;color:${EMAIL.body};margin:0 0 2px">${esc(greeting)}</p>
    <p style="font-size:15px;color:${EMAIL.body};margin:0 0 20px">Your <strong style="color:${EMAIL.ink}">${esc(input.monthLabel)}</strong> market briefs.</p>

    ${emailSectionLabel("National")}
    ${input.nationalHeadline ? `<p style="font-size:15px;line-height:1.55;color:${EMAIL.ink};margin:0 0 8px">${esc(input.nationalHeadline)}</p>` : ""}
    ${hasAny(input.national) ? `<p style="font-size:13px;color:${EMAIL.slate};margin:0 0 12px">This period: ${esc(countPhrase(input.national!))}.</p>` : ""}
    <p style="margin:0 0 4px">${emailButton("Read the national brief →", esc(input.nationalUrl))}</p>

    ${
      input.markets.length
        ? `<div style="margin-top:26px">${emailSectionLabel("Your markets")}
           <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${marketRows}</table></div>`
        : ""
    }`;

  const html = wrapEmail({
    preheader: `Your ${input.monthLabel} Dwellsy IQ Markets market briefs`,
    contentHtml: content,
    footerNote: "You're receiving this because your organization has Dwellsy IQ Markets access.",
    unsubscribeUrl: esc(input.unsubscribeUrl),
    unsubscribeLabel: "Unsubscribe from brief emails",
  });

  return { subject, html, text };
}
