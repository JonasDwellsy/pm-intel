# Management-Model Signal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an inferred per-operator management-model flag — *Third-party (likely hireable) / Owner-operator (likely) / Unknown* with an orthogonal confidence chip and a one-line basis — surfaced on the scorecard, as a watch-list filter, and in CSV.

**Architecture:** A deterministic keyword classifier (Python) fetches operator websites and writes a companyId-keyed verdict cache. A pure TS resolver combines that website verdict with listing structure (quadrant + asset-mix from `propertyDetail`). The flag is resolved **at seed time** in `prisma/seed.ts` and baked onto the stored `scorecardData` blob — no `pipeline.py` change, no 35-market re-run. A `SEED_SHAPE_VERSION` bump forces a reseed on deploy.

**Tech Stack:** Python 3 (`unittest`, `urllib`, `html.parser`, `ThreadPoolExecutor`), TypeScript, `node:test`, Next.js 16 / React 19, Prisma + Neon, XLSX.

## Global Constraints

- **3-state, hire-framed:** values `third_party` / `owner_operator` / `unknown`. Display labels exactly: `"Third-party manager"`, `"Owner-operator (likely)"`, `"Unknown"`.
- **Confidence is orthogonal:** `high` / `medium` / `low`, and **null iff `model === "unknown"`**.
- **Honesty copy (verbatim intent):** Unknown always tells the reader to **"verify directly"**; owner-operator is **always "(likely)"**; never assert a hard "not hireable".
- **Facts-not-judgments voice**; neutral chip styling — third-party is "hireable," not "good" (no green/red value coding).
- **Deterministic, no-LLM classifier** so reseeds stay reproducible (acceptance-gate diffable).
- **Field-pick trap:** any new blob field is silently dropped unless added to `buildScorecard`'s returned object in `prisma/seed.ts` (this bit `propertyDetail`/tenancy before).
- **Operator IQ** product branding in any user copy.
- TDD: `node:test` for TS (`npx tsx --test <file>`), `unittest` for Python (`python3 <test_file>.py` from `scripts/data-pipeline/`).

---

## File Structure

**Create:**
- `scripts/data-pipeline/classify_management_website.py` — website fetch + keyword classifier + cache writer.
- `scripts/data-pipeline/test_classify_management_website.py` — `unittest` for `classify_text`.
- `src/data/management_model_website.json` — committed verdict cache; starts `{}`.
- `src/lib/management-model/resolve.ts` — pure resolver (signal extract, listing verdict, combine, labels, constants, types).
- `src/lib/management-model/resolve.test.ts` — `node:test`.

**Modify:**
- `src/lib/types.ts` — add `managementModel?` to `ScorecardData`.
- `prisma/seed.ts` — import cache, compute + bake in `buildScorecard`, fold cache into hash, bump `SEED_SHAPE_VERSION`.
- `src/lib/scorecard/view-model.ts` (+ `.test.ts`) — carry `managementModel` on `HeaderView`.
- `src/components/scorecard/redesign/ScorecardHeader.tsx` — badge-row chip + tooltip.
- `src/components/scorecard/OperatorProfilePDF.tsx` — PDF chip.
- `src/lib/watch-list/fields.ts` — `managementModel` enum field.
- `src/lib/watch-list/adaptive-columns.ts` — add `managementModel` to always-on set.
- `src/lib/watch-list/export.ts` — CSV columns (operators + markets sheets).
- `src/app/methodology/page.tsx` — glossary entry.

---

## Task 1: Website keyword classifier (Python)

**Files:**
- Create: `scripts/data-pipeline/classify_management_website.py`
- Test: `scripts/data-pipeline/test_classify_management_website.py`

**Interfaces:**
- Produces: `classify_text(text: str) -> (verdict, confidence, matched)` where `verdict ∈ {"third_party","owner_operator","inconclusive"}`, `confidence ∈ {"high","medium",None}`, `matched: list[str]`.
- Produces: `src/data/management_model_website.json` = `{ companyId: {verdict, confidence, matched, url, checkedAt, error?} }`.
- Consumes: `src/data/company_enrichment.json` (`companyId → {website}`).

- [ ] **Step 1: Write the failing test** — `scripts/data-pipeline/test_classify_management_website.py`

```python
import unittest
from classify_management_website import classify_text


class ClassifyText(unittest.TestCase):
    def test_strong_single_tell_is_third_party_high(self):
        for phrase in ["free rental analysis", "owner portal", "list your property"]:
            v, c, _ = classify_text(f"Welcome to us. {phrase} today.")
            self.assertEqual((v, c), ("third_party", "high"), phrase)

    def test_two_weak_tells_high(self):
        # "our services", "tenant placement", "landlord" -> >=2 weak
        v, c, _ = classify_text("Our services include tenant placement for every landlord.")
        self.assertEqual((v, c), ("third_party", "high"))

    def test_one_weak_tell_medium(self):
        v, c, _ = classify_text("We manage buildings across the city.")  # only "we manage"
        self.assertEqual((v, c), ("third_party", "medium"))

    def test_owner_framing_only_is_owner_operator_medium(self):
        v, c, _ = classify_text("Explore our communities and our portfolio of living.")
        self.assertEqual((v, c), ("owner_operator", "medium"))

    def test_neutral_is_inconclusive(self):
        v, c, m = classify_text("Luxury apartments. Now leasing. Call today.")
        self.assertEqual((v, c, m), ("inconclusive", None, []))

    def test_strong_beats_owner_framing(self):
        v, _, _ = classify_text("Our communities are great. Owner portal login here.")
        self.assertEqual(v, "third_party")

    def test_resident_portal_is_oo_only_without_owner_portal(self):
        v, _, _ = classify_text("Resident portal login. Pay rent online.")
        self.assertEqual(v, "owner_operator")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts/data-pipeline && python3 test_classify_management_website.py`
Expected: FAIL — `ModuleNotFoundError: No module named 'classify_management_website'`.

- [ ] **Step 3: Write the classifier module** — `scripts/data-pipeline/classify_management_website.py`

```python
#!/usr/bin/env python3
"""v0.26 — Management-model website classifier.

Fetch each operator's own website (URL from company_enrichment.json) and
keyword-classify whether it markets third-party property-management services
(hireable) or presents an owned portfolio. Writes a companyId-keyed verdict
cache consumed at seed time by src/lib/management-model/resolve.ts.

Deterministic keyword classifier (no LLM) so reseeds stay reproducible.

Usage (from scripts/data-pipeline/):
  python3 classify_management_website.py            # classify new/uncached
  python3 classify_management_website.py --recover  # also retry prior errors
  python3 classify_management_website.py --sample 20
"""
import argparse
import json
import os
import re
import ssl
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
ENRICH_PATH = os.path.join(ROOT, "src", "data", "company_enrichment.json")
CACHE_PATH = os.path.join(ROOT, "src", "data", "management_model_website.json")

UA = "Mozilla/5.0 (compatible; OperatorIQ/1.0; +https://dwellsy.com)"
TIMEOUT = 10
MAX_PAGES = 3
INTERNAL_LINK_RE = re.compile(
    r"(owner|service|manage|property[- ]management|landlord|list[- ]your|rent[- ]your)", re.I
)

# ── keyword classifier (pure, unit-tested) ──────────────────────────
STRONG_TP = [
    "owner portal", "owner login", "owners login", "free rental analysis",
    "list your property", "list your rental", "property management services",
    "for property owners", "rent your home for you",
]
WEAK_TP = [
    "management services", "we manage", "let us manage",
    "professional property management", "management fee", "leasing fee",
    "our services", "become a client", "landlord", "property owners",
    "add your property", "tenant placement",
]
OO_TELLS = [
    "our communities", "our portfolio", "our properties",
    "properties we own", "we own and operate", "acquisitions",
    "our developments",
]


def classify_text(text):
    """Return (verdict, confidence, matched). Pure; unit-tested."""
    t = (text or "").lower()
    strong = [p for p in STRONG_TP if p in t]
    weak = [p for p in WEAK_TP if p in t]
    oo = [p for p in OO_TELLS if p in t]
    if "resident portal" in t and "owner portal" not in t and "owner login" not in t:
        oo = oo + ["resident portal"]
    if strong:
        return ("third_party", "high", strong + weak)
    if len(weak) >= 2:
        return ("third_party", "high", weak)
    if len(weak) == 1:
        return ("third_party", "medium", weak)
    if oo:
        return ("owner_operator", "medium", oo)
    return ("inconclusive", None, [])


# ── fetch machinery (mirrors enrich_company_websites.py) ─────────────
class _Extract(HTMLParser):
    def __init__(self):
        super().__init__()
        self.texts = []
        self.links = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self._skip += 1
        if tag == "a":
            for k, v in attrs:
                if k == "href" and v:
                    self.links.append(v)

    def handle_endtag(self, tag):
        if tag in ("script", "style") and self._skip:
            self._skip -= 1

    def handle_data(self, data):
        if not self._skip:
            s = data.strip()
            if s:
                self.texts.append(s)


def _make_ssl_context():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:  # noqa: BLE001
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        return ctx


SSL_CTX = _make_ssl_context()


def _get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=TIMEOUT, context=SSL_CTX) as r:
        raw = r.read(2_000_000)  # cap 2 MB
        charset = r.headers.get_content_charset() or "utf-8"
    return raw.decode(charset, errors="replace")


def _extract(html):
    ex = _Extract()
    try:
        ex.feed(html)
    except Exception:  # noqa: BLE001
        pass
    return ex


def fetch_and_classify(url):
    """Fetch homepage + up to MAX_PAGES-1 relevant internal links, classify."""
    try:
        home = _extract(_get(url))
    except Exception as e:  # noqa: BLE001
        return {"verdict": "inconclusive", "confidence": None, "matched": [], "error": str(e)[:120]}
    texts = list(home.texts)
    base = urlparse(url)
    seen, followups = set(), []
    for href in home.links:
        if not INTERNAL_LINK_RE.search(href):
            continue
        full = urljoin(url, href)
        u = urlparse(full)
        if u.scheme in ("http", "https") and u.netloc == base.netloc and full != url and full not in seen:
            seen.add(full)
            followups.append(full)
        if len(followups) >= MAX_PAGES - 1:
            break
    for f in followups:
        try:
            texts.extend(_extract(_get(f)).texts)
        except Exception:  # noqa: BLE001
            pass
    verdict, confidence, matched = classify_text(" ".join(texts))
    return {"verdict": verdict, "confidence": confidence, "matched": matched}


def _load(path, default):
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return default


def select_todo(enrich, cache, recover):
    todo = []
    for cid, rec in enrich.items():
        url = (rec or {}).get("website")
        if not url:
            continue
        cur = cache.get(cid)
        if cur is None or (recover and cur.get("error")):
            todo.append((cid, url))
    return todo


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--recover", action="store_true", help="also retry prior errors")
    ap.add_argument("--sample", type=int, default=0)
    ap.add_argument("--workers", type=int, default=8)
    args = ap.parse_args()

    enrich = _load(ENRICH_PATH, {})
    cache = _load(CACHE_PATH, {})
    todo = select_todo(enrich, cache, args.recover)
    if args.sample:
        todo = todo[: args.sample]
    with_site = sum(1 for r in enrich.values() if (r or {}).get("website"))
    print(f"companies with website: {with_site} | to classify: {len(todo)}")

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    done = 0
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(fetch_and_classify, url): (cid, url) for cid, url in todo}
        for fut in as_completed(futs):
            cid, url = futs[fut]
            res = fut.result()
            res["url"] = url
            res["checkedAt"] = now
            cache[cid] = res
            done += 1
            if done % 50 == 0:
                print(f"  {done}/{len(todo)}")

    with open(CACHE_PATH, "w") as f:
        json.dump(cache, f, indent=1, sort_keys=True)
    tp = sum(1 for v in cache.values() if v.get("verdict") == "third_party")
    oo = sum(1 for v in cache.values() if v.get("verdict") == "owner_operator")
    inc = sum(1 for v in cache.values() if v.get("verdict") == "inconclusive")
    print(f"DONE. cache={len(cache)} third_party={tp} owner_operator={oo} inconclusive={inc}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts/data-pipeline && python3 test_classify_management_website.py`
Expected: `OK` (7 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/data-pipeline/classify_management_website.py scripts/data-pipeline/test_classify_management_website.py
git commit -m "feat(mgmt-model): website keyword classifier + cache writer"
```

---

## Task 2: Pure TS resolver

**Files:**
- Create: `src/lib/management-model/resolve.ts`
- Test: `src/lib/management-model/resolve.test.ts`

**Interfaces:**
- Consumes (structural): `{ quadrant7Cell?: string|null; properties?: {kind?,homes?,submarket?}[]|null }` and an optional `WebsiteVerdict`.
- Produces: types `ManagementModelKind`, `ManagementConfidence`, `ManagementModel`, `WebsiteVerdict`, `ListingSignal`; functions `listingSignal`, `listingVerdict`, `combine`, `resolveManagementModel`; `MANAGEMENT_MODEL_LABELS`, `managementModelLabel`. **No import of `ScorecardData`** (kept structural to avoid a type cycle with `types.ts`, which imports `ManagementModel` from here).

- [ ] **Step 1: Write the failing test** — `src/lib/management-model/resolve.test.ts`

```ts
import test from "node:test";
import { strict as assert } from "node:assert";
import {
  listingVerdict, listingSignal, combine, resolveManagementModel,
  managementModelLabel, MANAGEMENT_MODEL_LABELS,
} from "./resolve";

const sig = (o: Partial<ReturnType<typeof listingSignal>> = {}) => ({
  quadrant7Cell: "Large MF/BTR Independent", communities: 0, scatteredHomes: 0, submarkets: 0, ...o,
});

test("SFR Independent → third-party / high", () => {
  const v = listingVerdict(sig({ quadrant7Cell: "SFR Independent" }));
  assert.equal(v.model, "third_party");
  assert.equal(v.confidence, "high");
});

test("SFR Institutional → owner-operator / medium", () => {
  const v = listingVerdict(sig({ quadrant7Cell: "SFR Institutional" }));
  assert.equal(v.model, "owner_operator");
  assert.equal(v.confidence, "medium");
});

test("MF mixed book (communities + scattered homes) → third-party / medium", () => {
  const v = listingVerdict(sig({ quadrant7Cell: "Small MF/BTR Independent", communities: 2, scatteredHomes: 5 }));
  assert.equal(v.model, "third_party");
  assert.equal(v.confidence, "medium");
});

test("MF broad footprint → third-party / low", () => {
  const v = listingVerdict(sig({ quadrant7Cell: "Large MF/BTR Independent", communities: 9, submarkets: 5 }));
  assert.equal(v.model, "third_party");
  assert.equal(v.confidence, "low");
});

test("MF Institutional with no strong structure → unknown (verify)", () => {
  const v = listingVerdict(sig({ quadrant7Cell: "Large MF/BTR Institutional", communities: 3, submarkets: 1 }));
  assert.equal(v.model, "unknown");
  assert.equal(v.confidence, null);
  assert.match(v.basis, /verify directly/i);
});

test("MF concentrated → owner-operator / low", () => {
  const v = listingVerdict(sig({ quadrant7Cell: "Small MF/BTR Independent", communities: 2, submarkets: 1 }));
  assert.equal(v.model, "owner_operator");
  assert.equal(v.confidence, "low");
});

test("listingSignal extracts communities, scattered homes, submarkets", () => {
  const s = listingSignal({
    quadrant7Cell: "Small MF/BTR Independent",
    properties: [
      { kind: "community", submarket: "a" },
      { kind: "sfr-submarket", homes: 3, submarket: "b" },
      { kind: "sfr-submarket", homes: 2, submarket: "b" },
    ],
  });
  assert.equal(s.communities, 1);
  assert.equal(s.scatteredHomes, 5);
  assert.equal(s.submarkets, 2);
});

test("combine: confident website overrides a low listing lean", () => {
  const listing = listingVerdict(sig({ quadrant7Cell: "Large MF/BTR Independent", communities: 9, submarkets: 5 })); // tp/low
  const m = combine(listing, { verdict: "owner_operator", confidence: "medium" });
  assert.equal(m.model, "owner_operator");
  assert.equal(m.source, "website");
});

test("combine: agreement corroborates and takes max confidence", () => {
  const listing = listingVerdict(sig({ quadrant7Cell: "SFR Independent" })); // tp/high
  const m = combine(listing, { verdict: "third_party", confidence: "medium" });
  assert.equal(m.model, "third_party");
  assert.equal(m.confidence, "high");
  assert.equal(m.source, "listing+website");
});

test("combine: inconclusive website falls through to listing", () => {
  const listing = listingVerdict(sig({ quadrant7Cell: "SFR Independent" }));
  const m = combine(listing, { verdict: "inconclusive", confidence: null });
  assert.equal(m.source, "listing");
});

test("unknown never carries a confidence chip; labels are exact", () => {
  const m = resolveManagementModel({ quadrant7Cell: "Hybrid", properties: [] });
  assert.ok(m.model === "third_party" && m.confidence === "low"); // Hybrid → tp/low
  assert.equal(MANAGEMENT_MODEL_LABELS.unknown, "Unknown");
  assert.equal(managementModelLabel("third_party"), "Third-party manager");
  assert.equal(managementModelLabel("owner_operator"), "Owner-operator (likely)");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/management-model/resolve.test.ts`
Expected: FAIL — cannot find module `./resolve`.

- [ ] **Step 3: Write the resolver** — `src/lib/management-model/resolve.ts`

```ts
// v0.26 — Management-model resolver. Pure functions that turn an operator's
// listing structure + an optional website-content verdict into a single
// hire-framed flag: third-party (likely hireable) / owner-operator (likely) /
// unknown, with an orthogonal confidence chip and a one-line basis.
//
// Kept structural (no ScorecardData import) so types.ts can import the
// ManagementModel type from here without a cycle. Resolved at SEED time
// (prisma/seed.ts) and baked onto the scorecard blob so scorecard, watch-list,
// and CSV all read one field. Website verdicts come from
// src/data/management_model_website.json, produced by
// scripts/data-pipeline/classify_management_website.py.

export type ManagementModelKind = "third_party" | "owner_operator" | "unknown";
export type ManagementConfidence = "high" | "medium" | "low";

export interface ManagementModel {
  model: ManagementModelKind;
  confidence: ManagementConfidence | null; // null iff model === "unknown"
  basis: string;
  source: "listing" | "website" | "listing+website";
}

/** One entry of management_model_website.json. */
export interface WebsiteVerdict {
  verdict: "third_party" | "owner_operator" | "inconclusive";
  confidence: ManagementConfidence | null;
  matched?: string[];
  url?: string;
  error?: string;
}

export const MANAGEMENT_MODEL_LABELS: Record<ManagementModelKind, string> = {
  third_party: "Third-party manager",
  owner_operator: "Owner-operator (likely)",
  unknown: "Unknown",
};

export function managementModelLabel(
  model: ManagementModelKind | null | undefined
): string | null {
  return model ? MANAGEMENT_MODEL_LABELS[model] : null;
}

// Tunable knobs (single source).
const SCATTERED_MIN = 3;
const BREADTH_COMMUNITIES = 8;
const BREADTH_SUBMARKETS = 4;
const CONCENTRATED_COMMUNITIES = 3;
const CONCENTRATED_SUBMARKETS = 2;

const CONF_RANK: Record<ManagementConfidence, number> = { high: 3, medium: 2, low: 1 };
const rank = (c: ManagementConfidence | null): number => (c ? CONF_RANK[c] : 0);

export interface ListingSignal {
  quadrant7Cell: string | null;
  communities: number;
  scatteredHomes: number;
  submarkets: number;
}

interface Verdict {
  model: ManagementModelKind;
  confidence: ManagementConfidence | null;
  basis: string;
}

interface PropLike { kind?: string | null; homes?: number | null; submarket?: string | null }

export function listingSignal(input: {
  quadrant7Cell?: string | null;
  properties?: PropLike[] | null;
}): ListingSignal {
  const props = input.properties ?? [];
  const communities = props.filter((p) => p.kind === "community").length;
  const scatteredHomes = props
    .filter((p) => p.kind === "sfr-submarket")
    .reduce((s, p) => s + (p.homes ?? 0), 0);
  const submarkets = new Set(props.map((p) => p.submarket).filter(Boolean)).size;
  return { quadrant7Cell: input.quadrant7Cell ?? null, communities, scatteredHomes, submarkets };
}

export function listingVerdict(s: ListingSignal): Verdict {
  const q7 = s.quadrant7Cell ?? "";
  if (q7 === "SFR Independent")
    return { model: "third_party", confidence: "high",
      basis: "Independent scattered single-family operator — management-for-owners by nature." };
  if (q7 === "SFR Institutional")
    return { model: "owner_operator", confidence: "medium",
      basis: "Institutional single-family operator; typically owns its homes (may also manage third-party)." };

  if (q7.includes("MF/BTR")) {
    if (s.communities >= 1 && s.scatteredHomes >= SCATTERED_MIN)
      return { model: "third_party", confidence: "medium",
        basis: "Manages both apartment communities and scattered homes — a pattern typical of third-party management." };
    if (s.communities >= BREADTH_COMMUNITIES && s.submarkets >= BREADTH_SUBMARKETS)
      return { model: "third_party", confidence: "low",
        basis: "Broad, multi-submarket apartment portfolio; listings can't confirm ownership vs. management." };
    if (q7.includes("Institutional"))
      return { model: "unknown", confidence: null,
        basis: "Institutional apartment operator — could be an owning REIT or a large third-party manager; both common at this scale. Verify directly." };
    if (s.communities > 0 && s.communities <= CONCENTRATED_COMMUNITIES && s.submarkets <= CONCENTRATED_SUBMARKETS)
      return { model: "owner_operator", confidence: "low",
        basis: "Small, concentrated apartment footprint; may be an owner. Listings can't confirm." };
  }
  if (q7 === "Hybrid")
    return { model: "third_party", confidence: "low",
      basis: "Operates across property types — a pattern common to third-party managers, but unconfirmed." };

  return { model: "unknown", confidence: null,
    basis: "Listing data can't distinguish third-party management from ownership. Verify directly." };
}

export function combine(listing: Verdict, website?: WebsiteVerdict | null): ManagementModel {
  const w = website && website.verdict !== "inconclusive" ? website : null;
  if (!w) return { ...listing, source: "listing" };

  const wModel = w.verdict as ManagementModelKind; // third_party | owner_operator
  const wBasis = wModel === "third_party"
    ? "Website markets property-management services to owners."
    : "Website presents an owned/managed portfolio with no third-party management offering.";

  if (wModel === listing.model) {
    const conf = rank(w.confidence) >= rank(listing.confidence) ? w.confidence : listing.confidence;
    return { model: listing.model, confidence: conf,
      basis: `${listing.basis} Corroborated by the operator's website.`, source: "listing+website" };
  }
  if (rank(w.confidence) >= rank(listing.confidence))
    return { model: wModel, confidence: w.confidence, basis: wBasis, source: "website" };
  return { ...listing, source: "listing" };
}

export function resolveManagementModel(
  listing: { quadrant7Cell?: string | null; properties?: PropLike[] | null },
  website?: WebsiteVerdict | null
): ManagementModel {
  return combine(listingVerdict(listingSignal(listing)), website);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/management-model/resolve.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/management-model/resolve.ts src/lib/management-model/resolve.test.ts
git commit -m "feat(mgmt-model): pure listing+website resolver"
```

---

## Task 3: Type + empty cache + seed baking

**Files:**
- Create: `src/data/management_model_website.json` (content: `{}`)
- Modify: `src/lib/types.ts` (add field to `ScorecardData`, interface begins line 62; place near `propertyDetail` at line 276)
- Modify: `prisma/seed.ts` (import at top; compute in `buildScorecard`; hash fold ~line 794; `SEED_SHAPE_VERSION` line 789)

**Interfaces:**
- Consumes: `resolveManagementModel`, `WebsiteVerdict`, `ManagementModel` from Task 2.
- Produces: `ScorecardData.managementModel?: ManagementModel`; every seeded blob carries it.

- [ ] **Step 1: Create the empty cache**

`src/data/management_model_website.json`:
```json
{}
```

- [ ] **Step 2: Add the type** — `src/lib/types.ts`

At the top of the file, add:
```ts
import type { ManagementModel } from "@/lib/management-model/resolve";
```
Inside `interface ScorecardData`, immediately after the `propertyDetail?:` line (≈276):
```ts
  /** v0.26 — inferred management model (third-party vs owner-operator).
   *  Baked at seed time by resolveManagementModel(); see src/lib/management-model. */
  managementModel?: ManagementModel;
```

- [ ] **Step 3: Wire seed.ts**

Add near the other data imports (beside `companyEnrichment`, ≈line 28):
```ts
import managementModelWebsite from "../src/data/management_model_website.json";
import { resolveManagementModel } from "@/lib/management-model/resolve";
import type { WebsiteVerdict } from "@/lib/management-model/resolve";
```
Add a lookup helper beside `websiteForCompany` (≈line 177):
```ts
const websiteVerdictByCompanyId = managementModelWebsite as Record<string, WebsiteVerdict>;
function managementModelFor(
  companyId: string | undefined,
  quadrant7Cell: string | null | undefined,
  properties: ScorecardData["propertyDetail"] extends infer T ? unknown : never // see note
) {} // replaced below — see Step 3b
```

- [ ] **Step 3b: Compute + bake inside `buildScorecard`**

In `buildScorecard`, locate the returned object's `propertyDetail:` line (the passthrough added for #261). Immediately **before** the `return {` (using the same `pm`, `companyId`, and `propertyDetail` values already in scope), compute:
```ts
const propertyDetailValue =
  (getObj(pm, "propertyDetail") as unknown as ScorecardData["propertyDetail"] | null) ?? undefined;
const companyIdValue = getStr(pm, "companyId");
const managementModel = resolveManagementModel(
  {
    quadrant7Cell: (getObj(pm, "pm") as { quadrant7Cell?: string | null } | undefined)?.quadrant7Cell
      ?? getStr(pm, "quadrant7Cell") ?? null,
    properties: propertyDetailValue?.properties ?? null,
  },
  companyIdValue ? websiteVerdictByCompanyId[companyIdValue] ?? null : null
);
```
Then in the returned object, replace the existing `propertyDetail: …` with the reused local and add the flag:
```ts
    propertyDetail: propertyDetailValue,
    managementModel,
```
> **Note:** verify the exact accessor for `quadrant7Cell` and `companyId` against `buildScorecard` (the identity fields live under the blob's `pm` sub-object; `companyId` is top-level). Use the file's existing `getObj`/`getStr` helpers — do not introduce new ones. Remove the placeholder helper from Step 3 if you scaffolded it.

- [ ] **Step 4: Fold cache into the content hash + bump shape version**

At `SEED_SHAPE_VERSION` (line 789): change to
```ts
const SEED_SHAPE_VERSION = "v2-managementModel";
```
Beside the existing `.update(JSON.stringify(companyEnrichment))` (≈line 794), add:
```ts
  .update(JSON.stringify(managementModelWebsite))
```

- [ ] **Step 5: Verify typecheck + generate client if needed**

Run: `npx tsc --noEmit 2>&1 | grep -E "seed|management-model|types" || echo "clean"`
Expected: `clean`.

- [ ] **Step 6: Commit**

```bash
git add src/data/management_model_website.json src/lib/types.ts prisma/seed.ts
git commit -m "feat(mgmt-model): bake managementModel onto the seed blob (+shape bump)"
```

---

## Task 4: View-model passthrough

**Files:**
- Modify: `src/lib/scorecard/view-model.ts` (`HeaderView` ≈line 31; header construction ≈line 251)
- Test: `src/lib/scorecard/view-model.test.ts`

**Interfaces:**
- Consumes: `ScorecardData.managementModel`, `ManagementModel` type.
- Produces: `HeaderView.managementModel: ManagementModel | null`.

- [ ] **Step 1: Add the failing test** — append to `src/lib/scorecard/view-model.test.ts`

```ts
test("view-model surfaces managementModel on the header", () => {
  const vm = buildScorecardView({
    ...baseScorecard,
    managementModel: { model: "third_party", confidence: "high", basis: "x", source: "listing" },
  } as any /* fixture */);
  assert.equal(vm.header.managementModel?.model, "third_party");
});
```
> Use the test file's existing fixture/import conventions (`baseScorecard`, `buildScorecardView`, assert style). If a fixture builder exists, extend it rather than casting.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/scorecard/view-model.test.ts`
Expected: FAIL — `header.managementModel` is undefined.

- [ ] **Step 3: Implement**

Add the import (with the other type imports):
```ts
import type { ManagementModel } from "@/lib/management-model/resolve";
```
Add to the `HeaderView` interface (near `quadrant7Cell`, ≈line 31):
```ts
  managementModel: ManagementModel | null;
```
In the `const header: HeaderView = {` object (≈line 251), add:
```ts
    managementModel: scorecard.managementModel ?? null,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/scorecard/view-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scorecard/view-model.ts src/lib/scorecard/view-model.test.ts
git commit -m "feat(mgmt-model): carry managementModel on the view-model header"
```

---

## Task 5: Scorecard header chip (web + PDF)

**Files:**
- Modify: `src/components/scorecard/redesign/ScorecardHeader.tsx` (badge row ≈line 74–99)
- Modify: `src/components/scorecard/OperatorProfilePDF.tsx`

**Interfaces:**
- Consumes: `header.managementModel`, `managementModelLabel`, confidence field.

- [ ] **Step 1: Add the web chip** — `ScorecardHeader.tsx`

Add import:
```ts
import { managementModelLabel } from "@/lib/management-model/resolve";
```
In the badge row, immediately after the 7-cell quadrant badge block (the `header.quadrant7Cell != null && (…)` at ≈line 84–98), add:
```tsx
{/* Management-model chip — neutral (hireable, not "good") */}
{header.managementModel != null && (
  <span
    title={header.managementModel.basis}
    style={{
      display: "inline-flex", alignItems: "center", gap: "6px",
      fontSize: "12px", fontWeight: 600, color: "#4a5568",
      background: "#f1f4f8", border: "1px solid #e2e8f0",
      borderRadius: "6px", padding: "3px 9px",
    }}
  >
    {managementModelLabel(header.managementModel.model)}
    {header.managementModel.confidence && (
      <span style={{ fontSize: "10.5px", color: "#8a94a6", textTransform: "uppercase", letterSpacing: "0.03em" }}>
        {header.managementModel.confidence} confidence
      </span>
    )}
  </span>
)}
```
> Match the surrounding badge styling if the file uses shared style constants; the inline block above mirrors the neutral quadrant-badge treatment. For `model === "unknown"`, the label reads "Unknown" and the `basis` tooltip says "verify directly" — no confidence sub-label renders (confidence is null).

- [ ] **Step 2: Add the PDF chip** — `OperatorProfilePDF.tsx`

Read the component to find its identity/badge area (mirrors the header). Add a react-pdf `<Text>`/`<View>` chip using the same label + confidence:
```tsx
{scorecard.managementModel != null && (
  <Text style={styles.badge /* or nearest existing badge style */}>
    {managementModelLabel(scorecard.managementModel.model)}
    {scorecard.managementModel.confidence ? ` · ${scorecard.managementModel.confidence} confidence` : ""}
  </Text>
)}
```
Add the `managementModelLabel` import. Use the component's existing source object (`scorecard` or the view header, whichever it consumes) and its nearest badge style — do not invent a new StyleSheet entry unless none fits.

- [ ] **Step 3: Verify in the browser**

Start the dev server (`preview_start` name `iq-dwellsy`), open a known SFR-Independent operator scorecard, confirm the chip renders "Third-party manager · HIGH confidence" with the basis on hover; open an MF Institutional operator, confirm "Unknown". Check console for errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/scorecard/redesign/ScorecardHeader.tsx src/components/scorecard/OperatorProfilePDF.tsx
git commit -m "feat(mgmt-model): scorecard header + PDF management-model chip"
```

---

## Task 6: Watch-list filter + CSV columns

**Files:**
- Modify: `src/lib/watch-list/fields.ts` (add field beside `quadrant7Cell`, ≈line 210)
- Modify: `src/lib/watch-list/adaptive-columns.ts` (always-on set ≈line 16–27)
- Modify: `src/lib/watch-list/export.ts` (`buildOperatorsSheet` ≈line 227; `buildMarketsSheet`)

**Interfaces:**
- Consumes: `managementModelLabel`, `pm.scorecard.managementModel`.
- Produces: `managementModel` registry field; CSV columns "Management model" + "Management model confidence".

- [ ] **Step 1: Add the field** — `src/lib/watch-list/fields.ts`

Add import:
```ts
import { managementModelLabel } from "@/lib/management-model/resolve";
```
Add the entry in the "Asset" group (after `quadrant7Cell`):
```ts
  managementModel: {
    id: "managementModel",
    label: "Management model",
    description:
      "Whether the operator likely manages third-party properties (hireable), owns its own, or is undetermined. Inferred — see methodology.",
    category: "asset",
    type: "enum",
    validOperators: ["eq", "ne", "in", "notIn"],
    getValueFromPM: (pm) =>
      managementModelLabel(pm.scorecard.managementModel?.model ?? "unknown"),
    enumOptions: ["Third-party manager", "Owner-operator (likely)", "Unknown"],
  },
```
> Matches the `quadrant7Cell` pattern (enum chips compare on display strings). Stored blob keeps the machine `model`; the accessor humanizes it.

- [ ] **Step 2: Add to always-on columns** — `src/lib/watch-list/adaptive-columns.ts`

Add `"managementModel"` to the always-on field-id set (the array containing `"quadrant7Cell"`, `"marketCount"`), so the explicit CSV column below isn't duplicated as an adaptive column when the user filters on it.

- [ ] **Step 3: Add CSV columns** — `src/lib/watch-list/export.ts`

Add import:
```ts
import { managementModelLabel } from "@/lib/management-model/resolve";
```
In `buildOperatorsSheet`, add to `headers` after `"7-Cell"`:
```ts
    "Management model",
    "Management model confidence",
```
And in the `dataRows` mapping, after the `q7` value push (keep positions aligned with headers):
```ts
      managementModelLabel(r.pm.scorecard.managementModel?.model ?? "unknown"),
      r.pm.scorecard.managementModel?.confidence ?? null,
```
Apply the identical two-column addition to `buildMarketsSheet` (same header + value positions) and update `colWidthsForOperatorsSheet` / the markets equivalent if it hard-codes a base column count.

- [ ] **Step 4: Verify**

Run: `npx tsx --test src/lib/watch-list/fields.test.ts src/lib/watch-list/export.test.ts 2>&1 | tail -5` (if these test files exist; otherwise run the watch-list suite the repo uses).
Then `npx tsc --noEmit 2>&1 | grep -E "watch-list" || echo clean`.
Expected: existing tests pass; `clean`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/watch-list/fields.ts src/lib/watch-list/adaptive-columns.ts src/lib/watch-list/export.ts
git commit -m "feat(mgmt-model): watch-list filter + CSV columns"
```

---

## Task 7: Methodology entry

**Files:**
- Modify: `src/app/methodology/page.tsx` (glossary term array; "7-cell taxonomy" entry ≈line 118–124)

- [ ] **Step 1: Add the glossary term**

Immediately after the `"7-cell taxonomy"` term object, add:
```ts
  {
    term: "Management model (inferred)",
    definition:
      "A hire-framed signal for whether an operator likely manages third-party properties (a PM you can hire), only owns/operates its own, or is undetermined — with a confidence level. Inferred from two layers: listing structure (independent scattered single-family operators are third-party managers by nature; an operator running both apartment communities and scattered homes is a management book) and, where a website is available, a keyword read of whether the site markets property-management services to owners. The apartment middle is often Unknown because listings can't separate a large third-party manager from an owning REIT — Unknown means verify directly, not \"no.\" Owner-operator is always shown as \"(likely).\"",
    ref: "§03",
  },
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit 2>&1 | grep methodology || echo clean` and load `/methodology` in the dev server; confirm the entry renders.

- [ ] **Step 3: Commit**

```bash
git add src/app/methodology/page.tsx
git commit -m "docs(mgmt-model): methodology glossary entry"
```

---

## Post-implementation (operational, not a code task)

After the branch merges:
1. Run `cd scripts/data-pipeline && python3 classify_management_website.py` (fetch + classify ~1,575 sites; `--sample 30` first to spot-check verdicts). Commit the populated `src/data/management_model_website.json`.
2. Deploy → `isDataCurrent()` fingerprint changes (shape bump + populated cache) → automatic reseed bakes `managementModel` onto every operator (pure add; `dataAsOf` unchanged).
3. Verify live: scorecard chip renders; a `Management model = Third-party manager` watch-list filter returns a sane count; CSV columns populate.

## Self-Review Notes

- **Spec coverage:** rubric (§6) → Tasks 2; website classifier (§5) → Task 1; plumbing (§7) → Task 3; surfaces (§8) → Tasks 4–7; guardrails (§9) → constants + copy in Tasks 2/5/7; rollout (§11) → Post-implementation. Covered.
- **Type cycle:** avoided by keeping `resolve.ts` structural (no `ScorecardData` import); `types.ts` imports `ManagementModel` one-directionally.
- **Field-pick trap:** Task 3b explicitly adds `managementModel` to the `buildScorecard` return.
- **Naming consistency:** `resolveManagementModel`, `listingVerdict`, `combine`, `managementModelLabel`, `MANAGEMENT_MODEL_LABELS`, `managementModel` (blob field) used identically across Tasks 2–7.
