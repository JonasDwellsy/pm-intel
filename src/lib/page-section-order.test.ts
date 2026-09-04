import test from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

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

test("no component rendered before SelectEvaluateMonitor carries a price or imports PRODUCTS", () => {
  const s = src(PAGE);
  const cutoff = s.indexOf("<SelectEvaluateMonitor");
  assert.ok(cutoff !== -1, `expected <SelectEvaluateMonitor /> to be rendered on ${PAGE}`);
  const before = s.slice(0, cutoff);

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
  const offenders: string[] = [];

  for (const tag of tagNames) {
    const specifier = importMap.get(tag);
    if (!specifier) continue; // not an imported component — nothing to scan
    const file = resolveModuleFile(specifier);
    if (!file) continue;
    const content = readFileSync(join(process.cwd(), file), "utf8");
    const hasPrice = PRICE_LITERAL_RE.test(content);
    const hasProducts = PRODUCTS_TOKEN_RE.test(content);
    if (hasPrice || hasProducts) {
      const reasons = [
        hasPrice ? "contains a $-prefixed price literal" : null,
        hasProducts ? "references PRODUCTS" : null,
      ].filter(Boolean);
      offenders.push(`${file} (rendered as <${tag}> before SelectEvaluateMonitor) — ${reasons.join("; ")}`);
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
