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
      // PR #46 — /get-matched (renter / owner-to-PM matching) is
      // structurally replaced by the buy-box workflow. The :path*
      // matcher catches both /get-matched and /get-matched/confirmation,
      // and forwards the query string so stale links from emails
      // (which carry ?leadId=…) still land somewhere usable. We send
      // every variant at the template picker — the home of the new
      // acquirer entry point.
      {
        source: "/get-matched/:path*",
        destination: "/buy-boxes/new",
        permanent: true,
      },
      {
        source: "/get-matched",
        destination: "/buy-boxes/new",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
