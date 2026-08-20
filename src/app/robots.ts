import type { MetadataRoute } from "next";
import { INDEXING_ENABLED, resolveSiteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  // Crawling stays ALLOWED even while we are deliberately unindexed. That
  // looks backwards and isn't: `noindex` is what keeps us out of the index,
  // and Google only sees it by fetching the page. A `Disallow: /` here would
  // hide the noindex and leave us worse off — Google would still list bare
  // URLs it found linked elsewhere, with no snippet and no way to drop them.
  // See src/lib/seo.ts for the full reasoning. The blanket X-Robots-Tag in
  // next.config.ts is the thing doing the work.
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/"],
    },
    // A sitemap is an invitation to index, so it is only advertised once we
    // actually want that. Previously this line pointed at
    // http://localhost:3000/sitemap.xml in production — unreachable, and a
    // clear tell that the base URL was never resolved here.
    ...(INDEXING_ENABLED ? { sitemap: `${resolveSiteUrl()}/sitemap.xml` } : {}),
  };
}
