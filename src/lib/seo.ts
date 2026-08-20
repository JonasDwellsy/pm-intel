// Single source of truth for whether this site may appear in search engines,
// and for the canonical base URL used in anything we emit publicly.
//
// WHY THIS EXISTS. Operator IQ is not ready to be a public, indexed site — the
// sales motion is direct, and the surfaces that are reachable without auth
// (the homepage, /methodology, /sample) exist to be shown to named prospects,
// not to be found cold. Until that changes we want to be deliberately absent
// from the index.
//
// Until now we were absent by accident instead: robots.txt advertised
// `Sitemap: http://localhost:3000/sitemap.xml` and /sitemap.xml served 4,794
// URLs all pointing at localhost, because NEXT_PUBLIC_SITE_URL is unset in
// production and both routes fell straight back to the dev default. That kept
// us out of the index, but for a reason that would silently reverse the moment
// someone set the env var. Being unlisted should be a setting, not a bug.
//
// HOW STAYING OUT OF THE INDEX ACTUALLY WORKS. The two mechanisms do different
// jobs and are easy to get backwards:
//
//   robots.txt Disallow  — stops CRAWLING. It does NOT stop indexing: Google
//                          can still list a URL it discovered from a link
//                          elsewhere, showing it with no snippet.
//   noindex              — stops INDEXING. But Google only learns about it by
//                          fetching the page, so it requires crawling to be
//                          ALLOWED.
//
// So `Disallow: /` plus a noindex is self-defeating — the block hides the very
// instruction that does the work. The correct combination, and the one below,
// is: allow crawling, and serve `noindex` on everything. (This is exactly what
// Clerk does on clerk.intel.iq.dwellsy.com, which is why that host stays out
// of the index despite being referenced from our own homepage.)
//
// TO GO PUBLIC: flip INDEXING_ENABLED to true and set NEXT_PUBLIC_SITE_URL (or
// rely on the Vercel fallbacks below). That single flag restores the
// X-Robots-Tag headers, the sitemap contents, the robots.txt sitemap line, and
// the per-page robots metadata together, so the surfaces can't disagree.

/** Master switch. false = deliberately absent from search engines. */
export const INDEXING_ENABLED = false;

/**
 * Canonical public base URL, no trailing slash.
 *
 * Resolution order mirrors the one layout.tsx has used since PR #79 (added to
 * fix LinkedIn unfurls, which broke for exactly this reason). robots.ts and
 * sitemap.ts never got it and kept the naked localhost fallback — that is the
 * bug described above.
 *
 *   1. NEXT_PUBLIC_SITE_URL          explicit override
 *   2. VERCEL_PROJECT_PRODUCTION_URL Vercel's canonical production hostname
 *   3. VERCEL_URL                    per-deployment URL (preview deploys)
 *   4. localhost                     `next dev`
 */
export function resolveSiteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000");
  return raw.replace(/\/+$/, "");
}

/**
 * The `robots` value for a page's Next.js `metadata`.
 *
 * Pages that were already hardcoding `{ index: false }` for their own reasons
 * (admin, sign-up, watch lists) should keep doing that — those must stay
 * unindexed even after we go public. Use this only for pages whose
 * indexability is meant to follow the site-wide switch.
 */
export function siteRobotsMetadata(): { index: boolean; follow: boolean } {
  return { index: INDEXING_ENABLED, follow: INDEXING_ENABLED };
}
