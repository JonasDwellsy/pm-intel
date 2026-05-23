// v0.18 (PR #71, Phase 3) — Email domain extraction for invitation
// analytics.
//
// The invitation webhook events from Clerk carry full email
// addresses on `data.email_address`. We MUST NOT log full emails
// to PostHog (PII guardrail, see PRIVACY.md). This helper extracts
// the domain portion only ("@dwellsy.com") for invite-source
// analytics ("how many invitations were sent to dwellsy.com vs.
// external domains").
//
// Why the leading "@" is preserved in the return value:
//   - The "@" makes it visually obvious in dashboards/queries that
//     the value is a domain, not a free-form string.
//   - It matches how the domain appears in the original email:
//     "alice@dwellsy.com" → "@dwellsy.com".
//   - Stripped form ("dwellsy.com") would be slightly leakier in
//     a screenshot/log — the "@" prefix immediately signals "this
//     came from an email" so it's obvious what's safe vs. not.
//
// Edge cases handled:
//   - Malformed input (no "@"): returns "(unknown)" so we still
//     get an analytics row, with an obviously-tagged bucket.
//   - Multiple "@" (rare but legal in some address formats):
//     returns the portion after the LAST "@" (the routing domain).
//   - Empty/null/undefined: returns "(unknown)".
//   - Whitespace: trimmed.
//   - Case: normalised to lowercase. "@DWELLSY.COM" and
//     "@dwellsy.com" should aggregate as the same domain in
//     PostHog, not two separate buckets.

const UNKNOWN_BUCKET = "(unknown)";

export function extractEmailDomain(email: string | null | undefined): string {
  if (!email || typeof email !== "string") return UNKNOWN_BUCKET;
  const trimmed = email.trim();
  if (!trimmed) return UNKNOWN_BUCKET;
  const lastAt = trimmed.lastIndexOf("@");
  if (lastAt === -1 || lastAt === trimmed.length - 1) {
    // "@" missing, or "@" is the last char (no domain after it).
    return UNKNOWN_BUCKET;
  }
  const domainPart = trimmed.slice(lastAt + 1).toLowerCase();
  if (!domainPart) return UNKNOWN_BUCKET;
  return `@${domainPart}`;
}
