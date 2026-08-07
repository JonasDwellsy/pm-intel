# Operator Size — Banding and De-emphasis

**Status:** Draft for Jonas's sign-off. No code until approved.
**Prompted by:** three CEO conversations where our size estimate was materially below what the operator reports, and a concern that a prominent point estimate costs us credibility in the first minute of a meeting.

---

## 1. What the calibration study found

Full-book study over 4,219 active operators, plus two ground-truth points.

**The bias is not one bias — it splits hard by archetype.**

| Archetype | n | Units per "community" | Declared ÷ our estimate |
|---|---|---|---|
| SFR-heavy (≤20% apt) | 934 | **1.4** | 0.42 |
| Mixed | 1,519 | 4.8 | 1.23 |
| Apartment-heavy (≥80% apt) | 1,766 | **37.4** | 1.53 |

1.4 vs 37.4 units per community is the whole story. For a scattered-SFR operator a "community" is one house, so declared units ≈ observed units and carry no extra information. For an apartment operator it's a whole building. **Declared community units is a meaningful size signal only for apartment-heavy operators** — which is exactly where our estimate is weakest.

**Ground truth, both apartment-heavy:**

| | Actual | Observed T12 | Lifetime | Declared | Our estimate |
|---|---|---|---|---|---|
| Fischer (78% apt) | 1,400 | 287 (4.9×) | 502 (2.8×) | **898 (1.6×)** | 790 (1.8×) |
| IPS (100% apt) | 3,000 | 309 (9.7×) | 1,334 (2.3×) | **1,500 (2.0×)** | 803 (3.7×) |

Declared community units is the most *consistent* signal (1.6×, 2.0×) — and consistency matters more than closeness, because a stable multiple is correctable and a variable one isn't.

**The decisive finding: even the best signal is ~2× low on both.** That residual is coverage — units that never list with Dwellsy at all. No multiplier and no bucket recovers those.

**Therefore:** banding is not a route to accuracy. It is a way to stop making a precision claim the data cannot support. That distinction drives every decision below.

---

## 2. Decisions

### 2.1 Lead with observed units, not the estimate
`urusT12` — distinct units seen on-market in the trailing 12 months — is a hard, defensible fact (309 for IPS, 287 for Fischer). It is uniquely ours and no operator can dispute it. It becomes the primary size figure.

The modelled estimate becomes a secondary, banded attribute.

### 2.2 Non-overlapping, log-scaled bands
Jonas proposed overlapping bands (`<500`, `300–1,000`, `750–1,500`…). Recommend against:
- ambiguous membership (an 800-unit operator sits in two bands at once)
- breaks sorting, filtering and watch-list criteria
- reads as hedging rather than rigour to a sophisticated buyer

Recommend these edges, chosen from the actual distribution (median 170, p75 331) rather than intuition:

| Band | Share of operators |
|---|---|
| <50 | 2.7% |
| 50–100 | 20.5% |
| 100–200 | 33.8% |
| 200–400 | 22.4% |
| 400–800 | 12.3% |
| 800–1,600 | 5.0% |
| 1,600+ | 3.3% |

Jonas's draft edges (`<100 / 100–250 / 250–500 / 500–1k / 1k–2.5k / 2.5k+`) put **66% of operators in the bottom two bands** — poor discrimination exactly where most operators live.

### 2.3 State the coverage limit out loud
Every surface showing a size band carries, or links to, the line:

> Based on listings observed on Dwellsy. Operators may not list their entire portfolio with us, so this is a floor, not a census.

This converts the known weakness into a credibility signal, and it is the honest cap on what any estimate can claim.

### 2.4 Do NOT apply a blanket correction yet
Two ground-truth points, both apartment-heavy, both possibly coverage-limited. We have **no validated ground truth for the 934 SFR-heavy operators**, where the 3.3× turnover multiplier is entirely unvalidated by this study. Recalibrating on n=2 would bake today's guess into a new format.

Revisit at ~15 ground-truth points. Every CEO conversation is one; worth capturing them somewhere structured.

---

## 3. Surface-by-surface changes

### 3.1 Homepage operator card (`SampleScorecards.tsx`) — the main de-emphasis
**Today:** "Estimated Portfolio Size" is a full-width band above the metric grid, 24px bold — the most prominent number on the card.

**Change:** demote to a single quiet line in the card's identity block, alongside type and market:

> `309 units observed · est. 200–400 managed`

Removes the full-width band entirely. The metric grid (lease-up, retention, rent, marketing) becomes the card's visual centre — which is what the product is actually about.

### 3.2 Scorecard Scale & Fit section
**Today:** portfolio point + range is the headline of the section.

**Change:** headline becomes observed units; the band sits beneath it as supporting context, with the coverage caveat in the metric info tip.

### 3.3 Operator comparison table (`ScaleFitSection.tsx`, "Est. size" column)
Show the band label (`200–400`) rather than a point. Sorting uses the band's lower edge, so ordering stays stable and non-arbitrary.

### 3.4 PDF (`OperatorProfilePDF.tsx`, "Est. size" tile + comparison column)
Mirror the web treatment: observed units as the figure, band as the qualifier. The PDF is the artefact that ends up in a deal room, so the caveat line must be present, not just linked.

### 3.5 Watch-list criteria + CSV
Portfolio-band filters already exist and key off bands, so criteria semantics are unchanged. CSV gains an `unitsObserved` column and reports the band label in place of the point estimate.

### 3.6 Methodology page
Document the band edges, the archetype split (1.4 vs 37.4 units per community), why declared community units only informs apartment-heavy operators, and the coverage limit. This is the moat — the honesty is the product.

---

## 4. What stays unchanged
- The underlying estimator (`operator-size.ts`, k_house 3.3 / k_apt 2.6) and its admin knobs. This is a presentation change, not a methodology change.
- Peer cohorting and the 7-cell classification, which use scale internally and are unaffected by display banding.
- `portfolioEstimate` in the seed blob — bands derive at read time, so no re-run or reseed is required.

---

## 5. Open questions for Jonas
1. Band edges as proposed (`<50 … 1,600+`), or a different granularity?
2. On the card, is `309 units observed · est. 200–400 managed` the right line, or should the estimate drop off the card entirely and live only on the scorecard?
3. Should the size band remain a watch-list *filter* at all, given the accuracy caveat — or become display-only?
4. Do we want a structured place to record ground-truth unit counts from CEO conversations, so the recalibration at ~15 points is mechanical rather than archaeological?
