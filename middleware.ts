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
//      saved buy boxes — the workspace landing, the editor, the
//      results view, and the CRUD API endpoints — additionally
//      require a signed-in Clerk user. The template picker, the
//      template-preloaded editor, and the in-memory preview API
//      stay public so anonymous visitors can still browse + tweak
//      + preview a buy box without an auth gate. The gate fires
//      only when they try to SAVE (the editor handles that flow
//      client-side by checking useUser() and redirecting to
//      /sign-in?redirect_url=... before issuing the POST).
//
// Order matters: the password gate runs first, so anonymous
// visitors who don't even have the research-preview access code
// never see Clerk's sign-in page. Once they're past the password
// gate, Clerk takes over for the routes that need per-user identity.

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
const isPublicBuyBoxRoute = createRouteMatcher([...PUBLIC_BUYBOX_PATTERNS]);

export default clerkMiddleware(async (auth, req) => {
  const gateResponse = await passwordGate(req);
  if (gateResponse) return gateResponse;

  if (isProtectedRoute(req) && !isPublicBuyBoxRoute(req)) {
    await auth.protect();
  }
});

// Match everything EXCEPT:
//   - /password (the access-code page itself; would loop otherwise)
//   - /api/password (the validation endpoint; must accept POSTs from
//     unauthenticated visitors so they can submit the password)
//   - /_next/static/* (Next.js JS/CSS chunks — must load on /password)
//   - /_next/image/* (Next.js Image optimization — must load the logo)
//   - /favicon.ico (browser tab icon)
//   - Any file path ending in a static asset extension so anything
//     served from /public works on /password.
//
// robots.txt and sitemap.xml are NOT excluded — they sit behind the
// research-preview gate too so we don't get indexed pre-launch.
export const config = {
  matcher: [
    "/((?!password|api/password|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|woff|woff2|ttf|otf)).*)",
  ],
};
