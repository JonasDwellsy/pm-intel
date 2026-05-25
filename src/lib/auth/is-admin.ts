// v0.20 — Stage 1.5 admin dashboard auth helper.
//
// Admin surfaces (`/admin/*`) are gated by an env-var allowlist of
// Clerk user IDs. Single source of truth, no DB schema change, no
// Clerk role wiring required for v1.
//
// Usage in a server component:
//
//   const { userId } = await auth();
//   if (!userId || !isAdminUser(userId)) notFound();
//
// We return notFound() (404) rather than redirect-to-sign-in or 403
// because:
//   1. The route is already behind the Clerk gate (middleware blocks
//      anonymous), so any signed-in user reaching this check is
//      already authenticated.
//   2. notFound() doesn't advertise the route's existence to non-
//      admin signed-in users. A 403 confirms "/admin exists, you're
//      just not in"; a 404 says "no such page" — better for an
//      internal-only surface that nobody outside the admin set should
//      know about.
//
// To add an admin: set ADMIN_USER_IDS in env (Vercel project envs +
// .env.local for dev) to a comma-separated list of Clerk user IDs.
// Example: ADMIN_USER_IDS=user_abc123,user_def456
//
// Env var missing or empty = nobody is admin (fail closed). This is
// intentional — better to lock out the dashboard than to accidentally
// open it to every signed-in user if the env var didn't propagate.

import "server-only";

let _cachedAdminSet: Set<string> | null = null;

function loadAdminSet(): Set<string> {
  // Cache the parsed allowlist per process — env vars are immutable
  // at runtime and the parsing is a hot path for every admin page
  // render. Process restart picks up new values.
  if (_cachedAdminSet !== null) return _cachedAdminSet;
  const raw = process.env.ADMIN_USER_IDS ?? "";
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  _cachedAdminSet = new Set(ids);
  return _cachedAdminSet;
}

/** Returns true iff userId is in the ADMIN_USER_IDS env-var allowlist.
 *  Returns false for null/undefined userIds (defensive — callers
 *  should auth() check first, but this lets the check chain cleanly). */
export function isAdminUser(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return loadAdminSet().has(userId);
}

/** Convenience for testing — clears the cached allowlist so a test
 *  can mutate process.env.ADMIN_USER_IDS and re-check. */
export function _resetAdminCacheForTesting(): void {
  _cachedAdminSet = null;
}
