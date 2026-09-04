import test from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

// Drift guard for the homepage section order.
//
// SingleReportOffer's $149/$299 consumer price sits deliberately AFTER
// SelectEvaluateMonitor (the enterprise pitch) and BEFORE FinalCta. A price
// visible before the enterprise pitch would anchor a five-figure enterprise
// conversation against a $149 number — the whole point of the 2026-08
// reposition (see SingleReportOffer.tsx's v0.34 comment). Nothing about the
// component itself enforces this; only its position in src/app/page.tsx
// does, and that position is trivial to disturb in an unrelated homepage
// edit (moving a section up "just to see how it reads," reordering during a
// merge conflict, etc.) with no type error, lint warning, or component test
// to catch it. This is exactly the kind of failure a source-level guard
// exists for.

function src(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const PAGE = "src/app/page.tsx";

test("SingleReportOffer sits after the enterprise pitch and before the final CTA", () => {
  const s = src(PAGE);

  const enterprisePitchIdx = s.indexOf("<SelectEvaluateMonitor");
  const offerIdx = s.indexOf("<SingleReportOffer");
  const finalCtaIdx = s.indexOf("<FinalCta");

  assert.ok(
    enterprisePitchIdx !== -1,
    `expected <SelectEvaluateMonitor /> to be rendered on ${PAGE}`
  );
  assert.ok(
    offerIdx !== -1,
    `expected <SingleReportOffer /> to be rendered on ${PAGE}`
  );
  assert.ok(
    finalCtaIdx !== -1,
    `expected <FinalCta /> to be rendered on ${PAGE}`
  );

  assert.ok(
    enterprisePitchIdx < offerIdx,
    "SingleReportOffer (the $149/$299 consumer price) must render AFTER " +
      "SelectEvaluateMonitor (the enterprise pitch) — a price shown before " +
      "the enterprise pitch would anchor a five-figure enterprise " +
      "conversation against $149. If this moved intentionally, it undoes " +
      "the 2026-08 homepage reposition; see SingleReportOffer.tsx's v0.34 " +
      "comment before changing the order."
  );
  assert.ok(
    offerIdx < finalCtaIdx,
    "SingleReportOffer must render BEFORE FinalCta so the consumer offer " +
      "isn't stranded after the page's closing band."
  );
});

// The test above only pins POSITION — it proves SingleReportOffer itself
// sits after the enterprise pitch, but it would pass green even if some
// OTHER component above SelectEvaluateMonitor grew a "$149" of its own (e.g.
// someone hard-coding a teaser price into Hero.tsx "just to preview it").
// The actual invariant is about PRICE, not about this one component's
// position, so widen the guard to every component the page renders before
// the enterprise pitch.

const PRICE_LITERAL_RE = /\$\d/; // "$149" — deliberately not "${" (template exprs)
const PRODUCTS_TOKEN_RE = /\bPRODUCTS\b/;

/** Resolve a "@/..." import specifier to the source file it names on disk
 *  (.tsx then .ts), mirroring this repo's tsconfig `@/*` -> `./src/*` path
 *  alias. Returns null for non-"@/" specifiers (npm packages) or a
 *  specifier that resolves to neither extension. */
function resolveModuleFile(specifier: string): string | null {
  if (!specifier.startsWith("@/")) return null;
  const rel = specifier.replace(/^@\//, "src/");
  for (const ext of [".tsx", ".ts"]) {
    if (existsSync(join(process.cwd(), `${rel}${ext}`))) return `${rel}${ext}`;
  }
  return null;
}

/** Like resolveModuleFile, but also handles a relative specifier ("./Foo",
 *  "../Foo") resolved against the directory of the file that imported it —
 *  needed for the depth-2 follow below, since a homepage child's own
 *  imports are just as often relative as alias-based (e.g. Hero.tsx does
 *  `import { ScorecardCard } from "./SampleScorecards"`). */
function resolveModuleFileFrom(specifier: string, fromFile: string): string | null {
  if (specifier.startsWith("@/")) return resolveModuleFile(specifier);
  if (specifier.startsWith(".")) {
    const rel = join(dirname(fromFile), specifier);
    for (const ext of [".tsx", ".ts"]) {
      if (existsSync(join(process.cwd(), `${rel}${ext}`))) return `${rel}${ext}`;
    }
    return null;
  }
  return null; // npm package — nothing on disk to scan
}

/** Map every top-level named/default import binding in `source` to the
 *  module specifier it came from, e.g. "Hero" -> "@/components/homepage/Hero".
 *  Good enough for this file's import style (no re-exports, no `import * as`
 *  namespace imports); `import type { X }` entries resolve too but are
 *  harmless since a type is never a JSX tag name. */
function buildImportMap(source: string): Map<string, string> {
  const map = new Map<string, string>();
  const importRe =
    /import\s+(?:\{([^}]*)\}|([A-Za-z0-9_$]+))\s+from\s+["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(source))) {
    const [, named, defaultName, specifier] = m;
    if (named) {
      for (const raw of named.split(",")) {
        const name = raw.replace(/^\s*type\s+/, "").trim();
        if (!name) continue;
        const local = name.includes(" as ") ? name.split(" as ")[1].trim() : name;
        map.set(local, specifier);
      }
    } else if (defaultName) {
      map.set(defaultName, specifier);
    }
  }
  return map;
}

test("the import-map scan actually resolves real homepage files (positive control)", () => {
  // Anchor to something that MUST resolve — if this fails, the price scan
  // below is silently searching nothing and every one of its assertions is
  // vacuous.
  const importMap = buildImportMap(src(PAGE));
  assert.equal(importMap.get("Hero"), "@/components/homepage/Hero");
  assert.equal(resolveModuleFile("@/components/homepage/Hero"), "src/components/homepage/Hero.tsx");
});

test("the depth-2 follow actually resolves a homepage child's own import (positive control)", () => {
  // Anchor for the one-level-deeper follow below: Hero.tsx renders
  // ReportSearch (imported via the "@/components/report/ReportSearch"
  // alias) and SampleScorecards' ScorecardCard (imported via the relative
  // "./SampleScorecards" specifier) — both forms must resolve, or the
  // depth-2 scan is silently searching nothing.
  const heroFile = "src/components/homepage/Hero.tsx";
  const heroSource = src(heroFile);
  const heroImports = buildImportMap(heroSource);
  assert.equal(heroImports.get("ReportSearch"), "@/components/report/ReportSearch");
  assert.equal(
    resolveModuleFileFrom("@/components/report/ReportSearch", heroFile),
    "src/components/report/ReportSearch.tsx"
  );
  assert.equal(heroImports.get("ScorecardCard"), "./SampleScorecards");
  assert.equal(
    resolveModuleFileFrom("./SampleScorecards", heroFile),
    "src/components/homepage/SampleScorecards.tsx"
  );
});

test("no component rendered before SelectEvaluateMonitor carries a price or imports PRODUCTS", () => {
  const s = src(PAGE);
  const cutoff = s.indexOf("<SelectEvaluateMonitor");
  assert.ok(cutoff !== -1, `expected <SelectEvaluateMonitor /> to be rendered on ${PAGE}`);
  const before = s.slice(0, cutoff);

  const offenders: string[] = [];

  // Depth 0: page.tsx's OWN "before" JSX. A price hard-coded directly into
  // the homepage between two components (e.g. a stray
  // `<p>Full report just $149</p>`) never appears in any imported
  // component file, so the import-following scan below would never see
  // it — this has to be checked against page.tsx's own source directly.
  {
    const hasPrice = PRICE_LITERAL_RE.test(before);
    const hasProducts = PRODUCTS_TOKEN_RE.test(before);
    if (hasPrice || hasProducts) {
      const reasons = [
        hasPrice ? "contains a $-prefixed price literal" : null,
        hasProducts ? "references PRODUCTS" : null,
      ].filter(Boolean);
      offenders.push(`${PAGE} (inline JSX before <SelectEvaluateMonitor>) — ${reasons.join("; ")}`);
    }
  }

  const tagNames = new Set<string>();
  const tagRe = /<([A-Z][A-Za-z0-9]*)\b/g;
  let tm: RegExpExecArray | null;
  while ((tm = tagRe.exec(before))) tagNames.add(tm[1]);

  assert.ok(
    tagNames.size > 0,
    `found no JSX component tags before <SelectEvaluateMonitor> in ${PAGE} — ` +
      "the price/PRODUCTS scan below would be vacuous"
  );

  const importMap = buildImportMap(s);
  const scanned = new Set<string>();

  // Scans one file's content for the price/PRODUCTS patterns, records an
  // offender if found, and returns the content so the caller can follow
  // ITS imports one level deeper. `scanned` dedupes across both depths
  // (e.g. SampleScorecards.tsx is both a direct page.tsx import and
  // something Hero.tsx re-imports for ScorecardCard).
  function scanFile(file: string, describedAs: string): string | null {
    if (scanned.has(file)) return null;
    scanned.add(file);
    const content = readFileSync(join(process.cwd(), file), "utf8");
    const hasPrice = PRICE_LITERAL_RE.test(content);
    const hasProducts = PRODUCTS_TOKEN_RE.test(content);
    if (hasPrice || hasProducts) {
      const reasons = [
        hasPrice ? "contains a $-prefixed price literal" : null,
        hasProducts ? "references PRODUCTS" : null,
      ].filter(Boolean);
      offenders.push(`${file} (${describedAs}) — ${reasons.join("; ")}`);
    }
    return content;
  }

  // Depth 1: every component page.tsx itself imports and renders before
  // SelectEvaluateMonitor. Depth 2: each of THOSE components' own imports
  // (e.g. Hero -> ReportSearch) — a price there is just as invisible above
  // the fold as one in Hero.tsx itself, and depth-1-only scanning missed
  // exactly this case. Stops at depth 2 rather than recursing indefinitely
  // into the whole component graph: it's enough to catch a child rendering
  // a price-carrying grandchild, which is the shape this guard exists for.
  for (const tag of tagNames) {
    const specifier = importMap.get(tag);
    if (!specifier) continue; // not an imported component — nothing to scan
    const file = resolveModuleFile(specifier);
    if (!file) continue;
    const content = scanFile(file, `rendered as <${tag}> before SelectEvaluateMonitor`);
    if (!content) continue;

    const childImportMap = buildImportMap(content);
    for (const childSpecifier of childImportMap.values()) {
      const childFile = resolveModuleFileFrom(childSpecifier, file);
      if (!childFile) continue;
      scanFile(childFile, `imported by ${file}, which renders before SelectEvaluateMonitor`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "A component rendered above SelectEvaluateMonitor on the homepage now " +
      "shows a price or reads the PRODUCTS catalog. The whole point of the " +
      "2026-08 reposition (see SingleReportOffer.tsx's v0.34 comment) is " +
      "that NO number appears before the enterprise pitch — a price there " +
      "anchors a five-figure enterprise conversation against it, regardless " +
      "of whether SingleReportOffer itself ever moved. Offending files:\n" +
      offenders.join("\n")
  );
});

// This scan is depth-2 (page.tsx's direct homepage-child imports, plus one
// level of THOSE files' own imports) — not unlimited-depth. A price nested
// three components deep (a grandchild imported by a component that Hero,
// say, imports, rather than by Hero itself) would NOT be caught here. Two
// levels covers every case observed in this component graph as of the
// 2026-08 reposition (Hero -> ReportSearch); if the homepage's component
// tree grows a deeper chain, widen this rather than trust it silently.
