import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { PostHogProvider } from "@/components/analytics/PostHogProvider";
import { SearchOverlayProvider } from "@/components/search/SearchOverlay";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

// PR #80 — metadataBase resolution.
//
// Without this, Next.js can't make file-convention opengraph-image
// routes (PR #75) emit absolute URLs in the og:image meta tag.
// LinkedInBot + most crawlers REQUIRE absolute URLs in og:image;
// without metadataBase, the meta tag either gets a relative path
// or isn't emitted at all, which is why LinkedIn unfurls were
// showing no image preview post-PR-#79.
//
// Resolution order:
//   1. NEXT_PUBLIC_SITE_URL (explicit override; set locally for
//      cross-env testing if needed)
//   2. VERCEL_PROJECT_PRODUCTION_URL (Vercel's canonical production
//      hostname, set on production deployments)
//   3. VERCEL_URL (per-deployment URL — used for preview deploys)
//   4. localhost fallback for `next dev`
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Dwellsy IQ — Property Manager Intelligence",
    template: "%s · Dwellsy IQ",
  },
  description:
    "Independent, data-driven scorecards on property managers across U.S. rental markets.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // ClerkProvider wraps the entire tree so <SignedIn> / <SignedOut>,
  // <UserButton>, useUser(), useAuth(), and the server-side auth()
  // helper all have a session context to consult. It must sit OUTSIDE
  // the <html> element per Clerk's App Router setup so server-rendered
  // Clerk components participate in the initial HTML payload.
  //
  // Auth wiring follows in src/middleware.ts (route gating) and the
  // /sign-in + /sign-up routes (Clerk's prebuilt UI). Per the v0.13
  // foundation PR, only /watch-lists (saved-list) and the /api/watch-lists
  // CRUD endpoints are gated; the template picker (/watch-lists/new)
  // and template-preloaded editor stay anonymous-friendly so the
  // PR #45 discovery path is preserved.
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col bg-background text-foreground">
          <PostHogProvider>
            <SearchOverlayProvider>
              <SiteHeader />
              <div className="flex-1">{children}</div>
              <SiteFooter />
            </SearchOverlayProvider>
          </PostHogProvider>
          {/* v0.17 — Vercel Analytics (page views, core web vitals)
              and SpeedInsights (TTFB, LCP, CLS, etc). Both are
              zero-config: dropping the components in the tree wires
              up Vercel's edge endpoints. No env vars needed —
              detection is automatic when the deployment is on
              Vercel. In local dev they no-op silently. */}
          <Analytics />
          <SpeedInsights />
        </body>
      </html>
    </ClerkProvider>
  );
}
