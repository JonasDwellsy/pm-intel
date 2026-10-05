import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  PROTECTED_ROUTE_PATTERNS,
  PUBLIC_BUYBOX_PATTERNS,
} from "@/lib/auth/protected-routes";
import { iqLoginReturn } from "@/lib/auth/iq-login-return";
import { IQ_LOGIN_RETURN_COOKIE, IQ_LOGIN_RETURN_MAX_AGE_SECONDS } from "@/lib/auth/iq-session-tasks";

// v0.21 — Clerk-only middleware.
//
// The site-wide research-preview password gate ("/password" wall used
// to share the pre-launch app with named prospects) was retired here
// in PR #4 of the first-paying-customer launch sequence. With Clerk
// gating every premium surface (operator scorecards, operator profiles,
// /ask, data APIs, watch lists, admin) per PR #101, the outer password
// wall added friction for legitimate customer users without buying
// any extra security.
//
// What stays:
//
//   - Clerk per-user auth on the routes listed in PROTECTED_ROUTE_PATTERNS,
//     minus the carve-outs in PUBLIC_BUYBOX_PATTERNS. Both lists live in
//     src/lib/auth/protected-routes.ts so they're independently testable.
//
//   - A BROAD config.matcher (every non-static route) so SiteHeader's
//     auth() server call always has clerkMiddleware context — same
//     constraint we had before; only the pre-Clerk gate logic is gone.

const isProtectedRoute = createRouteMatcher([...PROTECTED_ROUTE_PATTERNS]);
const isPublicWatchListRoute = createRouteMatcher([...PUBLIC_BUYBOX_PATTERNS]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req) && !isPublicWatchListRoute(req)) {
    await auth.protect();
  }

  if (/^\/iq\/sign-(in|up)(\/|$)/.test(req.nextUrl.pathname)) {
    const response = NextResponse.next();
    const destination = iqLoginReturn({
      sign_in_force_redirect_url: req.nextUrl.searchParams.get("sign_in_force_redirect_url") ?? undefined,
      sign_up_force_redirect_url: req.nextUrl.searchParams.get("sign_up_force_redirect_url") ?? undefined,
      redirect_url: req.nextUrl.searchParams.get("redirect_url") ?? undefined,
    });
    if (destination) {
      response.cookies.set({
        name: IQ_LOGIN_RETURN_COOKIE,
        value: destination,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/iq",
        maxAge: IQ_LOGIN_RETURN_MAX_AGE_SECONDS,
      });
    }
    return response;
  }
});

// Match every route EXCEPT static assets and Next.js internals. Even
// public routes need to be inside clerkMiddleware so SiteHeader's
// server-side auth() call has the right context.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|woff|woff2|ttf|otf)).*)",
  ],
};
