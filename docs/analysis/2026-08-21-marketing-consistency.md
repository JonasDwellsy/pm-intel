# Marketing Discipline: what it is for, and what the consistency prototype showed

**Date:** 2026-08-21 · **Data:** shipped seed at `dataAsOf 2026-08-20`, plus
full pipeline re-runs of Chattanooga (40 ranked PMs) and Dallas–Fort Worth
(209).

## What this metric is for — decided 2026-08-21

**Marketing Discipline is an indicator of quality and professionalism, not a
predictor of listing success.** A complete listing — a good array of photos of
the unit and the community, a thorough description, itemised amenities, clearly
stated rules — is better for renters. That is known independently of anything
in our data, and the institutional operators have plainly figured it out. The
metric exists to surface who does this well.

This matters because it sets the bar the metric is judged against. Correlation
with days-on-market is **supporting evidence, not the validity test**. An
earlier analysis treated weak outcome prediction as grounds for demoting the
metric; that was the wrong frame. Face validity plus fair, discriminating
measurement is the bar.

## The consistency prototype — tested and rejected

The idea: the composite aggregates listings with **means**, which hide
dispersion. An operator with 100 uniformly-decent listings and one with 20
excellent listings and 80 blanks can score identically, and only one of them is
disciplined.

Per-listing quality was computed on the **same** signals and weights the
composite uses, so the test isolated *aggregation* rather than introducing a new
signal set. Then per operator: p10, p25, sd, IQR, CV, and the share of listings
below fixed bars — correlated against DOM over 279 operators.

Raw correlations looked mildly promising, but dispersion is mechanically
entangled with the mean: a low-scoring operator has more room to vary. Partial
correlations, market-centred:

| measure | raw r vs DOM | partial r (controlling for mean) |
|---|---:|---:|
| qualityP10 | −0.275 | −0.100 |
| **qualitySd** | +0.196 | **+0.107** |
| qualityCv | +0.253 | +0.080 |
| **pctListingsBelow40** | +0.197 | **−0.126** |

Nothing clears |0.10| convincingly, and the two closest **disagree in sign** —
`qualitySd` says more dispersion means slower lease-up, `pctListingsBelow40`
says more weak listings means faster. Two measures of one idea pointing
opposite ways after controlling for the mean is noise, not signal.

**Rejected.** The mean already captures it. Prototype code reverted.

Note this conclusion is independent of the purpose reframe above: dispersion
adds nothing whether the metric is judged on prediction or on face validity,
because it is largely a restatement of the mean either way.

## A correction to the earlier analysis

Marketing Discipline was reported as correlating with essentially nothing
(r = −0.055 vs DOM). That number was wrong, for two compounding reasons:

1. It pooled all 44 markets. Median DOM ranges 18 days (San Jose) to 41 (San
   Antonio), so between-market differences swamped the within-market
   relationship.
2. It included dormant operators and brokers, excluded from cohort math
   everywhere else.

Measured correctly — ranked PMs only, within market:

```
pooled across all markets      r = -0.160
within-market median           r = -0.201
within-market mean             r = -0.189
markets with expected sign     34 / 39
```

**Rule this establishes:** validity checks on a per-market metric must be
computed within market and on the ranked-PM population, or a real relationship
will be understated.

## The live question: should the star be absolute rather than cohort-relative?

The purpose decision above creates a tension with how the star is computed.

Today the star is a **quartile within a cohort**. Under a professionalism
framing that is backwards: a Small MF/BTR Independent scoring 60 can earn gold
for topping a weak cohort, while a Large MF/BTR Institutional scoring 82 earns
silver for sitting mid-pack in a strong one. If gold is meant to say "these
listings are genuinely complete," the cohort hides exactly the difference the
metric exists to show.

Marketing Discipline is also the only one of the five metrics where an absolute
bar is coherent. Days-on-market, rent performance and retention all depend on
market conditions, so they must be market-relative. Listing completeness does
not — a complete listing is complete in Bozeman and in Los Angeles.

What an absolute bar would look like on current data:

| bar | operators clearing | share |
|---:|---:|---:|
| ≥ 85 | 480 | 11.9% |
| ≥ 80 | 840 | 20.9% |
| ≥ 75 | 1,282 | 31.9% |
| ≥ 70 | 1,699 | 42.2% |

An ≥80 bar separates cleanly along exactly the professionalism axis:

| cell | clears 80 |
|---|---:|
| Large MF/BTR Institutional | 78.9% |
| Large MF/BTR Independent | 49.3% |
| Small MF/BTR Institutional | 46.9% |
| SFR Institutional | 37.8% |
| Hybrid | 19.8% |
| SFR Independent | 16.7% |
| Small MF/BTR Independent | 14.3% |

An absolute bar is also **actionable** in a way a quartile is not: an operator
can be told "you are at 62 — itemise your amenities and you clear 75." A
quartile only tells them to outrun their peers.

**Open decision.** Moving to absolute thresholds would make Marketing
Discipline inconsistent with the other four metrics, and would mean most small
independents never earn a star on it. That is arguably the honest answer, but
it is a product call. Note that PR #420 (national fallback cohort) already
moved this metric a step toward an absolute standard.

## Dead ends — do not re-investigate

- **Price posting.** Proposed as a signal twice. Checked: rent is present on
  21,358 of 21,358 Chattanooga listings. There is no variation to score.
- **Photo quality.** The source `photos` field carries bare URLs
  (`https://media.dwellsy.com/…​.webp`) with no dimensions or metadata. Photo
  *quality* — as distinct from count — cannot be assessed without fetching and
  analysing the images themselves.
- **Within-operator consistency.** See above.

## Still untested, in rough order of expected value

- **Rules and policies as a first-class signal.** Pet policy, lease terms and
  fees are currently worth one-sixth each of the description richness
  sub-score. Under a "clearly stated rules" definition of completeness they
  arguably deserve their own weight.
- **Unit vs community photos.** The stated definition of a good listing
  distinguishes them; the metric counts photos without knowing which is which.
- **Repricing behaviour** — does a listing sitting 45 days get adjusted?
- **Time-to-list** — the gap between a unit going vacant and its listing
  appearing.
- **Listing churn** — repeated re-listing of one unit versus one clean listing.
