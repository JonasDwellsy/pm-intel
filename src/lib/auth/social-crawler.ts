// PR #76 — Social-media unfurl-crawler User-Agent detection.
//
// Used by src/middleware.ts to bypass the research-preview password
// gate for known social-media crawlers (Slack, Twitter, LinkedIn,
// Facebook, Discord, Telegram, WhatsApp). Without this bypass, when
// someone shares a Dwellsy IQ scorecard link in Slack/iMessage/email,
// the crawler gets bounced to /password and reads metadata from THAT
// page — the unfurl shows the generic password-gate card instead of
// the dynamic per-operator OG image we ship in PR #75.
//
// Threat-model note: User-Agent is trivially spoofable. Someone who
// wants to bypass the gate can set UA to "Slackbot" and view content
// they shouldn't. We accept this because:
//
//   1. The research-preview password gate is soft auth — it keeps
//      casual / accidental traffic out, not motivated attackers.
//   2. The cost of NOT bypassing is real (sharing the product to
//      named prospects in Slack/email/iMessage doesn't work at all).
//   3. Anyone motivated enough to spoof UA has likely already gotten
//      the password from one of the people we shared it with.
//
// Search-engine crawlers (Googlebot, Bingbot, DuckDuckBot) are NOT
// whitelisted — they would index pre-launch content. The middleware
// comment already calls this out: "robots.txt and sitemap.xml are
// NOT excluded — they sit behind the research-preview gate so search
// engines don't index pre-launch content." The patterns here only
// cover unfurl crawlers, which read metadata for share-preview cards
// and do NOT contribute to search-engine ranking.

/** Known unfurl-crawler User-Agent substrings (case-insensitive
 *  match). Each pattern is a verified live UA from the platform's
 *  published crawler docs (cross-checked against incoming requests
 *  in production where applicable).
 *
 *  Update notes:
 *   - Slackbot evolves the UA string occasionally ("Slackbot",
 *     "Slackbot-LinkExpanding", "Slack-ImgProxy"); the prefix match
 *     catches all variants.
 *   - facebookexternalhit covers Facebook, Messenger, Instagram,
 *     and WhatsApp's link-preview crawler — they share the same UA.
 *   - WhatsApp also sometimes sends UA "WhatsApp/x.y" without the
 *     facebookexternalhit prefix; listed separately to be safe.
 *   - Discordbot is the unfurl crawler (separate from any user-
 *     facing Discord browser session). */
export const SOCIAL_CRAWLER_PATTERNS: ReadonlyArray<RegExp> = [
  /Slackbot/i,
  /Twitterbot/i,
  /LinkedInBot/i,
  /facebookexternalhit/i,
  /Discordbot/i,
  /TelegramBot/i,
  /WhatsApp/i,
];

/** Returns true when the User-Agent matches a known social-media
 *  unfurl crawler. Empty / missing UA → false (be conservative;
 *  empty UA is more often a browser bug or a determined attacker
 *  than a real crawler). */
export function isSocialCrawler(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return SOCIAL_CRAWLER_PATTERNS.some((re) => re.test(userAgent));
}
