import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import {
  citySlug,
  QUADRANT_SEGMENTS,
  stateCodeToSlug,
} from "@/lib/slugify";

import { INDEXING_ENABLED, resolveSiteUrl } from "@/lib/seo";

const SITE_URL = resolveSiteUrl();

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Deliberately empty while the site is unindexed. /sitemap.xml is a
  // well-known path crawlers probe directly, and an empty valid sitemap is a
  // far better answer than the 4,794 http://localhost:3000 URLs this used to
  // serve in production. Every generator below is left intact and gated, so
  // flipping INDEXING_ENABLED restores the real sitemap in one edit.
  if (!INDEXING_ENABLED) return [];

  const markets = await prisma.market.findMany({
    include: { pms: { select: { slug: true } } },
  });

  const now = new Date();

  const entries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/methodology`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/property-managers`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/watch-lists`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    // /get-matched dropped in PR #46 — superseded by /watch-lists/new
    // and 301-redirected via next.config.ts.
  ];

  for (const m of markets) {
    const state = stateCodeToSlug(m.state);
    const city = citySlug(m.city);
    const marketUrl = `${SITE_URL}/property-managers/${state}/${city}`;

    entries.push({
      url: marketUrl,
      lastModified: m.updatedAt,
      changeFrequency: "weekly",
      priority: 0.9,
    });

    for (const seg of QUADRANT_SEGMENTS) {
      entries.push({
        url: `${marketUrl}/${seg}`,
        lastModified: m.updatedAt,
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }

    for (const pm of m.pms) {
      entries.push({
        url: `${marketUrl}/${pm.slug}`,
        lastModified: m.updatedAt,
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }
  }

  return entries;
}
