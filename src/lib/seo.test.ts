import test from "node:test";
import { strict as assert } from "node:assert";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { INDEXING_ENABLED, resolveSiteUrl, siteRobotsMetadata } from "./seo";
import robots from "../app/robots";

// Dwellsy IQ Markets is deliberately absent from search engines until it goes public.
// These tests exist because it was previously absent by ACCIDENT — robots.txt
// advertised http://localhost:3000/sitemap.xml and the sitemap served 4,794
// localhost URLs — and an accident reverses the moment someone sets an env
// var. They pin the intent and, more importantly, the one combination that
// would quietly break it.

test("the site is currently opted out of indexing", () => {
  assert.equal(INDEXING_ENABLED, false, "flip this test when going public");
});

test("robots.txt ALLOWS crawling while we are unindexed", () => {
  // The trap this guards. `noindex` is what removes us from the index, and
  // Google only sees it by fetching the URL. Disallowing the crawl would hide
  // the noindex and leave us listed as bare snippet-less URLs that we then
  // have no way to remove. Allow + noindex is the working combination.
  const r = robots();
  const rules = Array.isArray(r.rules) ? r.rules[0] : r.rules;
  assert.equal(rules?.allow, "/");
  const disallow = [rules?.disallow ?? []].flat();
  assert.ok(
    !disallow.includes("/"),
    "Disallow: / would hide the noindex — see src/lib/seo.ts"
  );
});

test("robots.txt advertises no sitemap while we are unindexed", () => {
  // A sitemap is an invitation to index. It is also where the localhost URL
  // leaked from.
  const r = robots();
  assert.equal(r.sitemap, undefined);
});

test("nothing we emit publicly references localhost", () => {
  // The original bug, asserted directly. In production resolveSiteUrl() falls
  // through to a Vercel hostname; the localhost default is dev-only.
  const r = JSON.stringify(robots());
  assert.ok(!/localhost/.test(r), `robots.txt still leaks localhost: ${r}`);
});

test("page robots metadata follows the site-wide switch", () => {
  const m = siteRobotsMetadata();
  assert.deepEqual(m, { index: false, follow: false });
});

test("resolveSiteUrl strips trailing slashes so joined paths can't double up", () => {
  const prev = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test/";
  assert.equal(resolveSiteUrl(), "https://example.test");
  if (prev === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = prev;
});

test("resolveSiteUrl prefers the Vercel production host over a preview URL", () => {
  const saved = {
    site: process.env.NEXT_PUBLIC_SITE_URL,
    prod: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    dep: process.env.VERCEL_URL,
  };
  delete process.env.NEXT_PUBLIC_SITE_URL;
  process.env.VERCEL_PROJECT_PRODUCTION_URL = "intel.iq.dwellsy.com";
  process.env.VERCEL_URL = "pm-intel-abc123.vercel.app";
  assert.equal(resolveSiteUrl(), "https://intel.iq.dwellsy.com");
  for (const [k, v] of [
    ["NEXT_PUBLIC_SITE_URL", saved.site],
    ["VERCEL_PROJECT_PRODUCTION_URL", saved.prod],
    ["VERCEL_URL", saved.dep],
  ] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

// --- source-level guards: the header is the mechanism that actually works ---

const cfg = () => readFileSync(join(process.cwd(), "next.config.ts"), "utf8");

test("a blanket X-Robots-Tag noindex is served from next.config", () => {
  const s = cfg();
  assert.match(s, /X-Robots-Tag/);
  assert.match(s, /noindex, nofollow, noarchive/);
  // Must cover every path, not a subset — API routes and PDFs included.
  assert.match(s, /source: "\/:path\*"/);
});

test("no page hardcodes robots index:true, which would override the header", () => {
  // The market-brief page really did. A page-level `index: true` alongside a
  // noindex header relies on Google resolving the conflict in our favour —
  // not something to depend on.
  // Match the metadata KEY, not the bare words, so a comment explaining the
  // old value doesn't trip it. (It did on the first run.)
  const hits = execSync(
    "grep -rn 'robots: *{ *index: true' src/app --include=*.tsx --include=*.ts || true",
    { encoding: "utf8" }
  ).trim();
  assert.equal(hits, "", `page-level index:true found:\n${hits}`);
});
