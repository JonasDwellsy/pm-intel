// Source of truth for which paths require a signed-in Clerk user.
//
// The middleware (middleware.ts) imports these arrays + builds
// createRouteMatcher() instances over them. They live in src/lib so
// the patterns are also testable in isolation — see protected-routes.test.ts.
//
// Two lists:
//
//   PROTECTED_ROUTE_PATTERNS — every UI + API path that requires a
//     signed-in Clerk user. As of v0.21 (first paying customer), this
//     includes per-operator scorecards, operator profiles, the AI
//     /ask tool, and the data APIs that back them — those are now
//     premium content rather than open marketing surface.
//
//   PUBLIC_BUYBOX_PATTERNS — explicit carve-outs from the protected
//     list. Despite the name (kept for diff-stability — this is the
//     same export the middleware + tests have always imported), the
//     list now covers any public child of an otherwise-protected
//     parent. Add a pattern here when you need to keep a single sub-
//     route public while its siblings stay gated.
//
// Both patterns use path-to-regexp syntax (the same dialect Clerk's
// createRouteMatcher consumes).
//
// Public-by-default surfaces (NOT in either list, gated only by the
// research-preview password gate until that's removed):
//   - /                            home
//   - /property-managers           index
//   - /property-managers/:state    state landing
//   - /property-managers/:state/:city   market landing
//   - /property-managers/:state/:city/brief   market brief (carve-out below)
//   - /briefs                      briefs index + individual briefs
//   - /methodology/:path*          methodology docs
//   - /claim, /claim/:pmSlug       PM-owner claim flow
//   - /sign-in, /sign-up, /password   auth pages

export const PROTECTED_ROUTE_PATTERNS = [
  // Watch-list workspace (per-org saved buy-box drafts + results)
  "/watch-lists",
  "/watch-lists/:id/edit",
  "/watch-lists/:id/results",
  // v0.16 — change-detection detail view. Same scope as /results
  // (per-org × per-watch-list); both surfaces show the same diff.
  "/watch-lists/:id/changes",
  "/api/watch-lists",
  "/api/watch-lists/:id",
  "/api/watch-lists/:id/apply",

  // v0.21 — premium content. Per-operator scorecards, operator
  // profiles, and the AI /ask tool are the paid surface. State/market
  // LANDING pages stay public as a marketing wedge; the per-operator
  // deep dive is gated.
  // As of the briefs-gating change: per-market briefs
  // (/property-managers/:state/:city/brief) are ALSO gated — this
  // :slug pattern binds `brief` and catches them (the old public
  // carve-out in PUBLIC_BUYBOX_PATTERNS was removed). The national
  // brief (/briefs/national) + the /briefs index stay public as the
  // free sample + teaser.
  // Covers the scorecard itself (4 segments), /compare (5 segments),
  // /opengraph-image (Next.js auto-generated OG route for unfurls),
  // the per-market /brief, and any future subroute under the slug.
  // :path* is zero-or-more so the bare scorecard URL still matches.
  "/property-managers/:state/:city/:slug/:path*",
  "/operators/:canonicalSlug",
  "/ask",
  "/api/ask",
  "/api/ask/:path*",
  // Data APIs that back the premium UI. Direct API access requires
  // the same auth as the page that consumes it; otherwise gating
  // the UI is theatre.
  "/api/pms/:slug",
  "/api/markets/:id",
  "/api/scorecard/:slug/pdf",

  // v0.20 — Stage 1.5 admin dashboard. Requires Clerk session +
  // user-id in ADMIN_USER_IDS env var (see src/lib/auth/is-admin.ts).
  // Clerk gate stops anonymous users at the middleware boundary; the
  // userId allowlist check happens inside the page component, where
  // non-admin signed-in users see notFound() (intentional — we don't
  // want to advertise the route's existence to non-admins).
  "/admin",
  "/admin/:path*",
] as const;

export const PUBLIC_BUYBOX_PATTERNS = [
  // Watch-list discovery flow — template picker + in-memory preview.
  // Anonymous visitors can clone a starter watch list and run a
  // preview without an auth gate; the save action redirects through
  // /sign-in.
  "/watch-lists/new",
  "/api/watch-lists/preview",
  // NOTE: the per-market brief (/property-managers/:state/:city/brief) used
  // to be carved out here as public. It's now intentionally GATED — it falls
  // through to the protected :slug pattern above. Logged-out visitors get the
  // /briefs index (teaser) + the national brief (/briefs/national) as the
  // free sample; opening any market brief requires sign-in.
] as const;
