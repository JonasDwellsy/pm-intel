// Source of truth for which paths require a signed-in Clerk user.
//
// The middleware (middleware.ts) imports these arrays + builds
// createRouteMatcher() instances over them. They live in src/lib so
// the patterns are also testable in isolation — see protected-routes.test.ts.
//
// Two lists:
//
//   PROTECTED_ROUTE_PATTERNS — every UI + API path that operates on
//     a user's saved watch lists. A signed-in session is required to
//     reach any of these.
//
//   PUBLIC_BUYBOX_PATTERNS — explicit carve-outs from the protected
//     list. /watch-lists/new (template picker + template-preloaded
//     editor) and /api/watch-lists/preview (in-memory draft eval)
//     must stay anonymous-friendly so the PR #45 discovery path
//     keeps working. Without this list, a naive matcher against
//     `/watch-lists/:path*` would also gate the public template flow.
//
// Both patterns use path-to-regexp syntax (the same dialect Clerk's
// createRouteMatcher consumes).

export const PROTECTED_ROUTE_PATTERNS = [
  "/watch-lists",
  "/watch-lists/:id/edit",
  "/watch-lists/:id/results",
  "/api/watch-lists",
  "/api/watch-lists/:id",
  "/api/watch-lists/:id/apply",
] as const;

export const PUBLIC_BUYBOX_PATTERNS = [
  "/watch-lists/new",
  "/api/watch-lists/preview",
] as const;
