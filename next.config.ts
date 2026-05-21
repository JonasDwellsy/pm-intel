import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permanent (301) redirect from the legacy /operator (singular)
  // path to the v0.11 /operators (plural) route. The plural was
  // introduced in PR #43 as the canonical operator-level scorecard
  // surface; this cleanup deprecates the singular path.
  //
  // The :slug* match preserves the trailing path segment AND any
  // query string ("?unlocked=true&fromBuyBox=<id>") through the
  // redirect — Next.js's built-in behaviour for redirects() is to
  // forward the query unchanged, so deep links from old emails /
  // bookmarks / external referrers land on the new URL with their
  // context intact.
  //
  // Permanent = 301; browsers + intermediaries cache the redirect
  // so subsequent visits don't re-hit the server. The runtime cost
  // is negligible, so it's worth keeping indefinitely for any
  // stale references that surface from external sources.
  async redirects() {
    return [
      {
        source: "/operator/:slug*",
        destination: "/operators/:slug*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
