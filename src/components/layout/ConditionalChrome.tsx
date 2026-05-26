"use client";

// v0.20 — Conditional app chrome.
//
// The root layout (src/app/layout.tsx) renders SiteHeader + SiteFooter
// around every route. Auth routes (/sign-in, /sign-up) want a stripped
// "doorway" layout instead — no nav, no footer, no competing CTAs —
// so the user stays focused on the single task of authenticating. This
// is the standard SaaS pattern (Stripe, Linear, Vercel): auth pages are
// a transactional flow, not part of the browsable app.
//
// Why a client component with header/footer passed as SLOTS:
//   - The root layout is a server component. usePathname() is a client
//     hook, so the pathname-dependent branch has to run client-side.
//   - SiteHeader / SiteFooter are themselves server components. Next.js
//     lets server components be passed as props ("slots") into a client
//     component and still render server-side — so we keep their RSC
//     benefits while letting this thin client wrapper decide whether to
//     mount them. Importing + rendering them directly inside a client
//     component would force them client-side; the slot pattern avoids
//     that.
//
// Adding a route to BARE_ROUTES strips the chrome for that route and
// all its sub-paths (startsWith match — covers Clerk's catch-all
// sub-routes like /sign-in/factor-one).

import { usePathname } from "next/navigation";

const BARE_ROUTES = ["/sign-in", "/sign-up"];

export function ConditionalChrome({
  header,
  footer,
  children,
}: {
  header: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isBare = BARE_ROUTES.some(
    (route) => pathname === route || pathname?.startsWith(`${route}/`)
  );

  if (isBare) {
    // No header / footer — the auth page owns its full-viewport layout.
    return <div className="flex-1">{children}</div>;
  }

  return (
    <>
      {header}
      <div className="flex-1">{children}</div>
      {footer}
    </>
  );
}
