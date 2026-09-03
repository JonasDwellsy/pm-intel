// v0.34 — Shared query-string builder for links leaving the consumer report
// funnel that must carry the guest's magic-link token forward. A guest has no
// session: the token in the URL IS their identity, so any link that drops it
// silently demotes an owner back to an unidentified visitor (teaser + a "buy
// again" CTA for a report they already own). No "server-only" tag and no
// Node-only APIs — this needs to be importable from both server components
// (account/page.tsx) and client components (RedeemCreditForm.tsx).

/** Build a "?token=...&partner=..." suffix from whichever of these params are
 *  present. Returns "" when neither is set, so signed-in / non-partner
 *  visitors keep clean URLs. Values are URL-encoded via URLSearchParams. */
export function buildReportQuery(params: {
  token?: string | null;
  partner?: string | null;
}): string {
  const qs = new URLSearchParams();
  if (params.token) qs.set("token", params.token);
  if (params.partner) qs.set("partner", params.partner);
  const s = qs.toString();
  return s ? `?${s}` : "";
}
