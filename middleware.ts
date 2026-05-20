import { NextResponse, type NextRequest } from "next/server";

// Research-preview password gate. Every request runs through this middleware
// (subject to the matcher exclusions below). Visitors without a valid
// `dq_auth` cookie are redirected to `/password?from=<originalPath>` where
// they enter the shared access code; the validation endpoint sets the
// cookie and bounces them back via the `from` param.
//
// Threat model: keep casual visitors out so a research preview can be
// shared with prospects without exposing it to the open internet. Not
// trying to defend against a sophisticated forger — anyone who knows the
// password can mint a cookie either by submitting the form or by computing
// SHA-256(AUTH_PASSWORD) themselves. Rotating AUTH_PASSWORD invalidates
// every existing cookie because the expected digest changes.
//
// Cookie scheme: value = SHA-256(AUTH_PASSWORD) hex. Middleware recomputes
// the digest on every request (cheap — Web Crypto in edge runtime, ~µs) and
// timing-safe compares against the cookie. No COOKIE_SECRET env var needed
// because the password itself acts as the shared secret.
//
// Cookie name `dq_auth` is intentionally non-obvious so casual inspectors
// don't immediately see "auth_token" or similar and try to forge it.

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

export async function middleware(req: NextRequest) {
  const password = process.env.AUTH_PASSWORD;
  if (!password) {
    // Fail closed if the env var is missing. Returning 500 surfaces the
    // misconfiguration instead of letting requests slip through unauthed.
    // The error body is intentionally generic — no info leak about whether
    // AUTH_PASSWORD is set, just that the gate is misconfigured.
    return new NextResponse("Access gate is misconfigured.", { status: 500 });
  }

  const expected = await sha256Hex(password);
  const cookie = req.cookies.get(AUTH_COOKIE)?.value ?? "";

  if (cookie && safeEqual(cookie, expected)) {
    return NextResponse.next();
  }

  // Preserve where the visitor was trying to go so we can return them
  // there after the password submission succeeds.
  const url = req.nextUrl.clone();
  const from = req.nextUrl.pathname + req.nextUrl.search;
  url.pathname = "/password";
  url.search = `?from=${encodeURIComponent(from)}`;
  return NextResponse.redirect(url);
}

// Match everything EXCEPT:
//   - /password (the auth page itself; would loop otherwise)
//   - /api/password (the validation endpoint; must accept POSTs from
//     unauthenticated visitors so they can submit the password)
//   - /_next/static/* (Next.js JS/CSS chunks — must load on /password)
//   - /_next/image/* (Next.js Image optimization — must load the logo)
//   - /favicon.ico (browser tab icon)
//   - Any file path ending in a static asset extension (logo .png, fonts,
//     CSS, JS, etc.) so anything served from /public works on /password.
//
// robots.txt and sitemap.xml are NOT excluded here — they're behind the
// gate too, which is appropriate for a research preview (we don't want
// search engines indexing pre-launch content).
export const config = {
  matcher: [
    "/((?!password|api/password|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|woff|woff2|ttf|otf)).*)",
  ],
};
