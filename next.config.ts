import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permanent (301) redirect from the legacy /operator (singular)
  // path to the v0.11 /operators (plural) route. The plural was
  // introduced in PR #43 as the canonical operator-level scorecard
  // surface; this cleanup deprecates the singular path.
  //
  // The :slug* match preserves the trailing path segment AND any
  // query string ("?unlocked=true&fromWatchList=<id>") through the
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
      // structurally replaced by the watch-list workflow. The :path*
      // matcher catches both /get-matched and /get-matched/confirmation,
      // and forwards the query string so stale links from emails
      // (which carry ?leadId=…) still land somewhere usable. We send
      // every variant at the template picker — the home of the new
      // acquirer entry point.
      {
        source: "/get-matched/:path*",
        destination: "/watch-lists/new",
        permanent: true,
      },
      {
        source: "/get-matched",
        destination: "/watch-lists/new",
        permanent: true,
      },
      // v0.15 (PR #54) — the v0.8 "buy box" naming was renamed
      // site-wide to "watch list". Preserve any bookmarks / shared
      // sample links / deep links to a saved row (e.g. an emailed
      // /buy-boxes/<cuid>/results URL) by 301-redirecting every old
      // path to its new counterpart. :path* matches the trailing
      // segment (including /new, /[id]/edit, /[id]/results) and
      // Next.js forwards the query string unchanged, so the
      // ?template=<slug> deep link still preserves through the
      // redirect. Two rules per surface so the bare /buy-boxes
      // (no trailing segment) and /api/buy-boxes (no [id]) also
      // get caught — :path* matches zero-or-more, but only AFTER
      // a slash, so /buy-boxes and /buy-boxes/anything need
      // separate sources.
      {
        source: "/buy-boxes",
        destination: "/watch-lists",
        permanent: true,
      },
      {
        source: "/buy-boxes/:path*",
        destination: "/watch-lists/:path*",
        permanent: true,
      },
      {
        source: "/api/buy-boxes",
        destination: "/api/watch-lists",
        permanent: true,
      },
      {
        source: "/api/buy-boxes/:path*",
        destination: "/api/watch-lists/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
