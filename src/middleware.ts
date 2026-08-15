import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import {
  PROTECTED_ROUTE_PATTERNS,
  PUBLIC_BUYBOX_PATTERNS,
} from "@/lib/auth/protected-routes";

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
const isMarketIqPageRoute = createRouteMatcher([
  "/market-iq",
  "/market-iq/:path*",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req) && !isPublicWatchListRoute(req)) {
    // The standalone Market IQ preview shares the production Clerk instance
    // with Operator IQ, whose instance-level sign-in URL points at the
    // Operator IQ domain. Keep signed-out preview visitors on this origin so
    // the local Market IQ doorway can authenticate them and return them to the
    // Market IQ workspace. This exception is both route- and flag-scoped, so
    // it cannot alter Operator IQ, Portfolio IQ, or any production route.
    if (
      process.env.MARKET_IQ_PREVIEW_ENABLED === "1" &&
      isMarketIqPageRoute(req)
    ) {
      const returnTo = `${req.nextUrl.pathname}${req.nextUrl.search}`;
      const signInUrl = new URL("/sign-in", req.url);
      signInUrl.searchParams.set("redirect_url", returnTo);
      await auth.protect({ unauthenticatedUrl: signInUrl.toString() });
      return;
    }
    await auth.protect();
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
