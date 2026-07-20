# Management-Model Signal — Design Spec

**Date:** 2026-07-20
**Status:** Approved for planning
**Goal:** Give each operator an inferred **management-model** flag — *Third-party (likely hireable) / Owner-operator (likely) / Unknown*, with a confidence chip and a one-line basis — so the "can I actually hire this PM?" question is answerable at a glance.

---

## 1. Problem & context

The prospective client raised this twice as a **hard gate**: "do they only manage their own stuff, or third party?" It's the line between "interesting data" and "a PM I can actually hire." We can't read it cleanly from listings, but a coarse *inferred + confidence + Unknown* flag materially sharpens the hire-a-PM use case, which is the reason she'd pay.

**Approved framing (this session):**
- **3-state, hire-framed:** `Third-party` / `Owner-operator` / `Unknown`.
- **Confidence is orthogonal** to state: `High / Medium / Low`. State = best read; confidence = how sure; `Unknown` = genuinely no lean (no confidence chip).
- **Website content is in v1** (not deferred) — it's the only lever that lifts the hard MF/BTR middle.
- **Keyword classifier** for website content (not LLM) — fits the deterministic, no-secrets, reproducible pipeline; LLM is a deferred fast-follow if accuracy disappoints.

## 2. Signal inventory & honest limits

**What we have (100% coverage, on the scorecard blob):**
- `quadrant7Cell` — SFR/MF-BTR × Independent/Institutional × size (7 cells).
- `institutional`, `hybrid` flags.
- `propertyDetail.properties[]` — per-property records with `kind` (`community` | `sfr-submarket`), `label`, `submarket`, `units`, `homes`.

**What we DON'T have (kills the original lead idea):** MF `community` labels are **street addresses** ("3001 Dayton Blvd"), not brand names ("Camden Downtown"). The "does the operator's own brand appear in its property names / portfolio-name heterogeneity" test is **not implementable** — we have no property brand names, only addresses. The design must not lean on it.

**Better structural tell we DO have — asset-mix:** an operator with both apartment `community` records **and** scattered `sfr-submarket` homes is running a mixed book (owners rarely hold a 103-unit building *and* a scattered single house as one portfolio). Computable from `propertyDetail`.

**The real lever — website content:** operator website URLs exist for ~39% (1,575 of 3,997 companies) in `company_enrichment.json`, but only the URL, not page text. A homepage that markets "property management services / list your property / owner portal / free rental analysis" is a near-definitive third-party tell. Requires a new fetch-and-classify step; only reaches the ~39% with a known site.

## 3. Architecture decision — resolve at SEED time, no pipeline re-run

The listing rubric's inputs (`quadrant7Cell`, `institutional`, `propertyDetail`) are already on the scorecard blob that `prisma/seed.ts` reads, and seed already joins `company_enrichment.json` by `companyId` (`websiteForCompany`). Therefore:

- **No `pipeline.py` change, no 35-market re-run, no `scorecard_data.json` regeneration.**
- A new **committed cache** `src/data/management_model_website.json` (companyId → website verdict), produced by a standalone enrichment script.
- A pure **TS resolver** computes the final `managementModel` at seed time from `(blob listing signals) + (website cache)` and bakes it into the stored `scorecardData` blob — so scorecard view-model, watch-list evaluator, and CSV all read one baked field.
- **`SEED_SHAPE_VERSION` bump** forces a reseed on deploy (shape change); the website cache is folded into the `SEED_CONTENT_VERSION` hash so a re-classify also re-triggers.

Reproducible: pure functions over a committed cache + committed blob → identical output. No acceptance-gate diff on `scorecard_data.json` (pipeline output unchanged).

## 4. Data model

Baked onto the stored `ScorecardData` blob:

```ts
managementModel?: {
  model: "third_party" | "owner_operator" | "unknown";
  confidence: "high" | "medium" | "low" | null;   // null iff model === "unknown"
  basis: string;                                    // one-line human explanation
  source: "listing" | "website" | "listing+website";
};
```

## 5. Website keyword classifier (Python)

**New script:** `scripts/data-pipeline/classify_management_website.py`, modeled on `enrich_company_websites.py` (reuse urllib + ThreadPoolExecutor + SSL context + UA + timeout + incremental cache pattern).

**Input:** `src/data/company_enrichment.json` (companyId → website URL).
**Output (committed cache):** `src/data/management_model_website.json`:
```json
{ "115621": { "verdict": "third_party", "confidence": "high",
              "matched": ["owner portal","free rental analysis"],
              "url": "https://...", "checkedAt": "2026-07-20T..." },
  "999999": { "verdict": "inconclusive", "confidence": null, "matched": [],
              "url": "https://...", "checkedAt": "...", "error": "timeout" } }
```

**Fetch strategy:** GET the homepage; extract up to 2 additional internal links whose `href` or anchor text matches `/(owner|service|manage|property[- ]management|landlord|list[- ]your|rent[- ]your)/i`; fetch those too. Concatenate, strip tags → lowercased text. Total budget ≤ 3 requests per site; per-request timeout 10s; failures/dead sites → `verdict: "inconclusive"` with `error`.

**Keyword scoring (pure, unit-tested):** `classify_text(text) -> (verdict, confidence, matched)`

- `STRONG_TP` (any one match → `third_party` / `high`):
  `owner portal`, `owner login`, `owners login`, `free rental analysis`, `list your property`, `list your rental`, `property management services`, `for property owners`, `rent your home for you`.
- `WEAK_TP` (owner-acquisition/service language):
  `management services`, `we manage`, `let us manage`, `professional property management`, `management fee`, `leasing fee`, `our services`, `become a client`, `landlord`, `property owners`, `add your property`, `tenant placement`.
- `OO_TELLS` (ownership framing):
  `our communities`, `our portfolio`, `our properties`, `properties we own`, `we own and operate`, `acquisitions`, `our developments`, `resident portal` (only when no owner portal present).

Scoring (dedupe matches per phrase; count distinct phrases):
1. any `STRONG_TP` → **third_party / high**
2. else `WEAK_TP` count ≥ 2 → **third_party / high**
3. else `WEAK_TP` count == 1 → **third_party / medium**
4. else `OO_TELLS` count ≥ 1 → **owner_operator / medium**
5. else → **inconclusive / null**

**Incremental / re-run:** default fetches only companyIds with a URL and no cache entry; `--recover` re-fetches prior errors; `--sample N` for spot checks — mirrors `enrich_company_websites.py`'s flags.

## 6. Listing rubric + combiner (TS, pure)

**New module:** `src/lib/management-model/resolve.ts`. All pure, unit-tested with `node:test`.

**Tunable constants (defaults; single source at top of module):**
```ts
const SCATTERED_MIN = 3;       // ≥3 scattered homes + ≥1 community ⇒ mixed book
const BREADTH_COMMUNITIES = 8; // "broad" MF footprint
const BREADTH_SUBMARKETS = 4;
const CONCENTRATED_COMMUNITIES = 3;
const CONCENTRATED_SUBMARKETS = 2;
```

**`listingVerdict(scorecard) -> Verdict`** (Verdict = `{model, confidence, basis}`; always returns something):
- `SFR Independent` → third_party / **high** — *"Independent scattered single-family operator — management-for-owners by nature."*
- `SFR Institutional` → owner_operator / **medium** — *"Institutional single-family operator; typically owns its homes (may also manage third-party)."*
- MF/BTR, **mixed book** (`≥1 community` AND `sum(homes over sfr-submarket) ≥ SCATTERED_MIN`) → third_party / **medium** — *"Manages both apartment communities and scattered homes — a pattern typical of third-party management."*
- MF/BTR, **broad** (`communities ≥ BREADTH_COMMUNITIES` across `≥ BREADTH_SUBMARKETS` submarkets) → third_party / **low** — *"Broad, multi-submarket apartment portfolio; listings can't confirm ownership vs. management."*
- MF/BTR **Institutional** (any size, not already matched) → unknown — *"Institutional apartment operator — could be an owning REIT or a large third-party manager; both common at this scale. Verify directly."*
- MF/BTR, **concentrated** (`communities ≤ CONCENTRATED_COMMUNITIES` in `≤ CONCENTRATED_SUBMARKETS` submarkets) → owner_operator / **low** — *"Small, concentrated apartment footprint; may be an owner. Listings can't confirm."*
- `Hybrid` → third_party / **low** — *"Operates across property types — a pattern common to third-party managers, but unconfirmed."*
- else → unknown — *"Listing data can't distinguish third-party management from ownership. Verify directly."*

**`combine(listing, website?) -> ManagementModel`** — precedence by confidence rank (`high=3, medium=2, low=1, unknown/null=0`):
- If no website verdict (or `inconclusive`): use `listing`; `source: "listing"`.
- Else if website and listing **agree on model**: `source: "listing+website"`, `confidence = max`, basis = listing basis + *" Corroborated by the operator's website."*
- Else (disagree): take the higher-ranked verdict; tie → **website wins** (more direct evidence); `source` = winner's origin.
- `Unknown` never carries a confidence chip.

## 7. Plumbing (exact touch points)

1. `src/lib/types.ts` — add `managementModel?` to `ScorecardData` (interface at line 62; place near `propertyDetail` at line 276).
2. `prisma/seed.ts`:
   - `import managementModelWebsite from "../src/data/management_model_website.json"` (companyId → website verdict).
   - Compute `managementModel` inside `buildScorecard` via `resolve.ts` and include it in the returned object **(field-pick trap: it will be silently dropped unless added to the return — same failure that hit `propertyDetail`/tenancy).**
   - Fold the cache into the `SEED_CONTENT_VERSION` hash (add a `.update(JSON.stringify(managementModelWebsite))` alongside the existing `companyEnrichment` update at ~line 794).
   - Bump `SEED_SHAPE_VERSION` (line 789) → `"v2-managementModel"`.
3. `src/lib/scorecard/view-model.ts` — surface `managementModel` on the built view (typed passthrough).

## 8. Surfaces

**a) Scorecard header** (`src/components/scorecard/redesign/ScorecardHeader.tsx`, near the `operatorType`/`quadrant7Cell` chip; mirror into `OperatorProfilePDF.tsx`):
- Informational chip: icon + `"Third-party manager"` / `"Owner-operator (likely)"` / `"Management model: Unknown"`, a confidence dot (High/Med/Low), and the `basis` in a tooltip/`title`.
- **Neutral styling** — third-party is not "good," just "hireable." No green/red value coding; a single informational accent. Unknown is muted with a "verify directly" tooltip.

**b) Watch-list filter** (`src/lib/watch-list/fields.ts`): new enum field, matching the registry's actual shape (`type`, `enumOptions`, `validOperators`, `category` — same as the `quadrant7Cell` entry it sits beside):
```ts
managementModel: {
  id: "managementModel",
  label: "Management model",
  description:
    "Whether the operator likely manages third-party properties (hireable), owns its own, or is undetermined. Inferred; see methodology.",
  category: "asset",
  type: "enum",
  validOperators: ["eq", "ne", "in", "notIn"],
  getValueFromPM: (pm) => pm.scorecard.managementModel?.model ?? null,
  enumOptions: ["third_party", "owner_operator", "unknown"],  // display labels mapped in the editor
}
```
The stored values are the raw `model` strings; the editor maps them to the human labels ("Third-party manager", "Owner-operator (likely)", "Unknown"). Confidence-based filtering is **out of v1** (keep it a single-axis filter); revisit if she asks.

**c) CSV export** (`src/lib/watch-list/export.ts`): add columns `Management model` (mapped label) and `Management model confidence`.

**d) Methodology page:** new "Management model (inferred)" subsection — the two signal layers (listing structure + website content), the keyword approach, and explicit limits (MF middle is often Unknown; Unknown means verify, not "no").

## 9. Guardrails & honesty

- Confidence chip is **always shown** for a non-Unknown state.
- `Unknown` copy always says **"verify directly."**
- We **never** assert a hard "not hireable" — owner-operator is always **"(likely)"**.
- Every operator gets a `basis` string; no bare labels.
- Coverage note in methodology: the flag is **inferred**, strongest for SFR, website-boosted where a site exists, honestly Unknown across much of the MF/BTR middle.

## 10. Testing strategy

- **Python** `test_classify_management_website.py`: `classify_text` over crafted inputs — each STRONG_TP phrase → third_party/high; two WEAK_TP → high; one WEAK_TP → medium; OO-only → owner_operator/medium; empty → inconclusive; owner-acquisition + ownership language → third_party wins.
- **TS** `resolve.test.ts`: `listingVerdict` for each quadrant cell + mixed-book + broad + concentrated; `combine` precedence (website-high beats listing-low; agreement → listing+website + max confidence; disagreement tie → website; inconclusive website → listing; unknown carries null confidence).
- **TS** view-model + a display-mapping test (model → label/accent).
- Existing `fields.ts`/evaluator tests extended for the new enum field.

## 11. Rollout

1. Land code (resolver + classifier script + plumbing + surfaces + tests) behind the seed-shape bump.
2. Run `classify_management_website.py` (fetch + classify ~1,575 sites), commit `management_model_website.json`. Spot-check a sample of verdicts (`--sample`).
3. Deploy → `isDataCurrent()` fingerprint changes (shape bump + new cache) → automatic reseed bakes `managementModel` onto every operator. Pure-add; `dataAsOf` unchanged.
4. Verify: scorecard chip renders; a `Management model = third_party` watch-list filter returns a sane count; CSV columns populate.

## 12. Out of scope / deferred

- **LLM website classifier** (fast-follow if keyword accuracy disappoints; same cache contract, swap the classifier).
- **Confidence as a watch-list filter axis.**
- **Property-brand-name heterogeneity** — blocked until/unless the pipeline emits community brand names (labels are addresses today).
- **Individual-owner / property-ownership data** (not in our sources).
- **Re-fetch cadence** for website classification (manual re-run for now, like `enrich_company_websites.py`).

## 13. Risks

- **Website fetch reliability** — dead/blocking sites → `inconclusive` → listing fallback (graceful; only loses the boost).
- **Keyword false positives** — a management firm's blog quoting "list your property" could over-fire; mitigated by STRONG_TP being lead-gen/portal phrases + the confidence chip + "verify" framing.
- **SFR-Independent-as-third-party prior** — a rare independent SFR *owner* is mislabeled third-party/high; acceptable given the dominant SFR economic model and the "(likely)"/verify framing. Website evidence overrides where present.
