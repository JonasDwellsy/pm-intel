import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import {
  PROTECTED_ROUTE_PATTERNS,
  PUBLIC_BUYBOX_PATTERNS,
} from "@/lib/auth/protected-routes";

// Two-layer middleware:
//
//   1. Research-preview password gate (outer). Every request is
//      blocked behind a /password page that validates against a
//      shared access code (process.env.AUTH_PASSWORD). This is the
//      site-wide wall used to share the pre-launch preview with
//      named prospects without exposing it to the open internet.
//
//   2. Clerk per-user auth (inner). Routes that operate on a user's
//      saved watch lists — the workspace landing, the editor, the
//      results view, and the CRUD API endpoints — additionally
//      require a signed-in Clerk user. The template picker, the
//      template-preloaded editor, and the in-memory preview API
//      stay public so anonymous visitors can still browse + tweak
//      + preview a watch list without an auth gate. The gate fires
//      only when they try to SAVE (the editor handles that flow
//      client-side by checking useAuth() and redirecting to
//      /sign-in?redirect_url=... before issuing the POST).
//
// Order matters: the password gate runs first, so anonymous
// visitors who don't even have the research-preview access code
// never see Clerk's sign-in page. Once they're past the password
// gate, Clerk takes over for the routes that need per-user identity.
//
// IMPORTANT: there's a subtle distinction between MATCHING (which
// routes the middleware runs on at all) and PROTECTING (which routes
// require an authenticated Clerk session):
//
//   - The `config.matcher` below is BROAD on purpose. It needs to
//     include EVERY route that renders the shared root layout —
//     including /password — because SiteHeader's <Show when=…> calls
//     auth() server-side, and auth() requires clerkMiddleware to
//     have run on the request. If the matcher excludes /password,
//     hitting the access gate crashes with "Clerk: auth() was called
//     but Clerk can't detect usage of clerkMiddleware()".
//
//   - Protection (auth.protect()) stays NARROW — only the saved-
//     watch-list surfaces from PROTECTED_ROUTE_PATTERNS. /password
//     itself must NOT be protected; it's the entry point to the
//     research-preview gate, and requiring a Clerk session there
//     would create an infinite redirect loop with the password gate
//     redirect below.
//
//   - The password gate itself is skipped explicitly for /password
//     + /api/password inside the handler — otherwise the gate would
//     redirect /password → /password (loop) and would 302-rewrite
//     the validation POST before it could check the cookie.

const AUTH_COOKIE = "dq_auth";

async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Constant-time string equality. Avoids leaking timing information via
// early-exit on the first mismatched character.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function passwordGate(req: NextRequest): Promise<NextResponse | null> {
  const password = process.env.AUTH_PASSWORD;
  if (!password) {
    // Fail closed if the env var is missing. Returning 500 surfaces the
    // misconfiguration instead of letting requests slip through unauthed.
    return new NextResponse("Access gate is misconfigured.", { status: 500 });
  }

  const expected = await sha256Hex(password);
  const cookie = req.cookies.get(AUTH_COOKIE)?.value ?? "";

  if (cookie && safeEqual(cookie, expected)) {
    return null;
  }

  // Preserve where the visitor was trying to go so we can return them
  // there after the password submission succeeds.
  const url = req.nextUrl.clone();
  const from = req.nextUrl.pathname + req.nextUrl.search;
  url.pathname = "/password";
  url.search = `?from=${encodeURIComponent(from)}`;
  return NextResponse.redirect(url);
}

// Routes that require a signed-in Clerk user, with the public
// carve-outs that the patterns above would otherwise capture. Both
// lists live in src/lib/auth/protected-routes.ts so they're testable
// independently of the middleware wiring.
const isProtectedRoute = createRouteMatcher([...PROTECTED_ROUTE_PATTERNS]);
const isPublicWatchListRoute = createRouteMatcher([...PUBLIC_BUYBOX_PATTERNS]);

/** Paths that bypass the research-preview password gate. These are
 *  the gate page itself + its validation endpoint — running the gate
 *  on them would either loop forever or break the form POST. They
 *  still go through clerkMiddleware so auth() context is set up for
 *  the shared layout's <Show when=…> components.
 *
 *  v0.17 — /api/clerk/webhook is also bypassed because Clerk's
 *  servers POST to it directly (no browser session cookie); signature
 *  verification via svix is what authenticates the inbound payload.
 *  /api/sentry-test + /api/posthog-test bypass too so the
 *  observability smoke tests don't require a logged-in session. */
function isPasswordGateBypass(pathname: string): boolean {
  return (
    pathname === "/password" ||
    pathname.startsWith("/api/password") ||
    pathname.startsWith("/api/clerk/webhook") ||
    pathname.startsWith("/api/sentry-test") ||
    pathname.startsWith("/api/posthog-test")
  );
}

export default clerkMiddleware(async (auth, req) => {
  if (!isPasswordGateBypass(req.nextUrl.pathname)) {
    const gateResponse = await passwordGate(req);
    if (gateResponse) return gateResponse;
  }

  if (isProtectedRoute(req) && !isPublicWatchListRoute(req)) {
    await auth.protect();
  }
});

// Match every route EXCEPT static assets and Next.js internals.
//
// /password and /api/password are INCLUDED on purpose now — the
// shared root layout calls auth() (via SiteHeader's <Show when=…>),
// which requires clerkMiddleware to have run on the request. The
// gate logic for those two paths is skipped inside the handler via
// isPasswordGateBypass(), so the access page still renders and the
// validation POST still accepts unauthenticated requests.
//
// robots.txt and sitemap.xml are NOT excluded — they sit behind the
// research-preview gate so search engines don't index pre-launch
// content.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|woff|woff2|ttf|otf)).*)",
  ],
};
