import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import {
  citySlug,
  QUADRANT_SEGMENTS,
  stateCodeToSlug,
} from "@/lib/slugify";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const markets = await prisma.market.findMany({
    include: { pms: { select: { slug: true } } },
  });

  const now = new Date();

  const entries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/methodology`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/property-managers`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/buy-boxes`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    // /get-matched dropped in PR #46 — superseded by /buy-boxes/new
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
