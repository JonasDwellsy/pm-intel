# Operator IQ Homepage Reposition — Spec (2026-08-07)

**Status:** Draft for Jonas's sign-off. No code until approved.

## Positioning (locked)
- **Product:** Independent operator performance intelligence for property owners / asset managers who **select and manage** third-party property managers.
- **Spine:** *The best operators drive the best yield — Operator IQ shows you which ones do, and holds the rest to a real standard.* Positive throughout; the downside is implied, never accusatory. Never "replace your PM" — it's **select, evaluate, manage**.
- **Precision (non-negotiable copy discipline):** we measure **market-observed** performance from Dwellsy's listing record (lease-up speed, rent realization, marketing discipline, a survival-based retention signal, portfolio scale/trajectory). We do **not** claim to see the owner's P&L (occupancy, collections, NOI). Language stays on "independent, market-observed signals," and methodology carries the trust.
- **ICP:** owners / asset managers hiring third-party PMs. Not PMs, not renters.
- **Category language:** "operator performance intelligence" (use consistently; Morningstar analogy is an internal north star, not on the page).
- **Scale:** 20,000+ operators across 43 metros — framed as *what makes independent benchmarking possible*, never as database breadth.
- **Banned phrases:** data-driven, actionable insights, powerful/seamless/game-changing, unlock, empower, optimize your portfolio, one platform, take it to the next level.

## Section architecture (7) — disposition vs. today
| # | Section | Component | Disposition |
|---|---|---|---|
| 1 | Hero | `Hero` | REWRITE copy + CTAs; keep live scorecard card (right column) |
| 2 | The blind spot | **new** `BlindSpot` | ADD — owner/operator information asymmetry, 3-column |
| 3 | Questions → answered on a real scorecard | `SampleScorecards` + new intro | MERGE #4+#7; move product proof up |
| 4 | Select → Evaluate → Monitor | `SelectScreenMonitor` (rewrite) + **new** `AlertMock` | REWRITE + REORDER; embed alert mock in Monitor |
| 5 | Why this couldn't be done before | `CoveredMarkets` (reframed) + new intro | REFRAME scale/coverage as the moat (#8+#13) |
| 6 | Observed, not self-reported | `MethodologyPillars` (condensed) | CONDENSE + move down; deep links |
| 7 | Final CTA + footer | new CTA block + `MethodologyFooter` | ADD CTA; keep footer as-is |

Net: 1 rewritten hero, 2 new components (`BlindSpot`, `AlertMock`), 3 reused-and-reframed, 1 condensed, footer unchanged. No product/auth/entitlement changes.

---

## Section 1 — Hero  (REWRITE)
**Eyebrow:** INDEPENDENT OPERATOR PERFORMANCE INTELLIGENCE

**H1:** Know how well your property managers actually perform.

**Subhead:** Your operators report on your assets. Operator IQ independently benchmarks your operators — measuring how property managers across the country perform in the market — so you can pick the right one, get more from the ones you have, and protect your yield.

**Primary CTA:** See a sample scorecard → `/sample`
**Secondary CTA:** Request access → `mailto:sales@dwellsy.com`
**Right column:** keep the live Doorby scorecard card (real product, above the fold).

*Communicates in ~10s: this evaluates the operator (not the property), it's independent of the operator, it's peer-benchmarked, it's for owners, and there's real product to see.*

## Section 2 — The blind spot  (NEW `BlindSpot`)
**H2:** You hand your assets to operators who know more than you do about how they're doing.

**Body:** Your operator sees performance across its whole portfolio. You see your properties and the reports your operator prepares. That gap isn't anyone hiding the ball — operators simply have more context. Operator IQ gives you the independent outside view.

**Three columns:**
- **What your operator sees** — performance across its portfolio · lease-up across properties · retention patterns · rent performance · operating trends
- **What you usually see** — your properties · reports the operator prepares · the operator's explanations · contracted KPIs
- **What Operator IQ adds** — independent benchmarks · peer comparisons · performance trends · early signals · a view across operators

## Section 3 — Questions, answered on a real scorecard  (MERGE — reuse `SampleScorecards`)
**H2:** Questions every owner should be able to answer.

**List:** Which operators are leasing fastest in my markets? · Is my operator keeping pace with its peers? · Are we capturing market rent growth? · Is retention where it should be? · Is my operator getting better or slipping?

**Bridge line:** Operator IQ answers these from observed market activity. Here's what one operator's scorecard shows — every figure produced by the live methodology.

Then the existing real-scorecard trio (Nomad · Trinity · Birgo), lightly annotated. *(Keep vetting operators shown against the "no Dwellsy data-clients on public surfaces" guardrail.)*

## Section 4 — Select → Evaluate → Monitor  (REWRITE `SelectScreenMonitor` + NEW `AlertMock`)
Three jobs, one independent standard — ordered to match how owners work (select, then evaluate, then manage). Monitor carries the recurring hook.

- **Select — Choose the operator that will earn the best yield.** Shortlist operators with the right geography, scale, and demonstrated performance for the assignment.
- **Evaluate — Know whether performance is actually good.** Benchmark an operator against peers facing the same market conditions, not against isolated KPIs.
- **Monitor — Know the moment performance moves.** Track lease-up, retention, rent, and marketing over time, and get a monthly signal when something shifts — early, while there's still time to have the conversation.

**`AlertMock` (inside Monitor) — constructive, not alarmist:**
> **Monthly signal — ABC Property Management, Phoenix**
> Lease-up has eased from the 71st to the 38th percentile over the last 90 days. Median days-on-market 34 vs. a peer median of 24 (was 25 last quarter). *Worth a conversation with your operator.*
> View performance →

## Section 5 — Why this couldn't be done before  (REFRAME `CoveredMarkets`)
**H2:** Why hasn't this existed?

**Body:** To benchmark operators independently you need rental activity across many of them, consistent operator identity over time, historical observations, market-level normalization, and enough scale to build real peer groups. Dwellsy observes rental activity across **20,000+ operators in [live market count] metros** — enough to compare any operator against true peers. The scale is the point: it's what makes independent benchmarking possible.

Then the existing covered-markets list as proof.

## Section 6 — Observed, not self-reported  (CONDENSE `MethodologyPillars`)
**H2:** Observed, not self-reported.

**Body:** Every score is built from what operators actually did in the market — listings, days on market, rent, retention signals — not from anything they told us. The full methodology is public: identification, inclusion thresholds, rentable-unit counts, DOM, retention, rent performance, portfolio estimates, and the confounders we account for.

**Links:** How Operator IQ works → · Read the methodology → (`/methodology`)

## Section 7 — Final CTA + footer  (NEW CTA; keep `MethodologyFooter`)
**H2:** See how your operators compare.
**Body:** Independent, market-observed performance on the operators running your assets.
**CTAs:** See a sample scorecard → `/sample` · Request access → sales
Keep `MethodologyFooter` (version · design · data-as-of) unchanged.

---

## Visual direction
Institutional research, not proptech SaaS: serious typography, real product UI, percentile/peer comparisons, high whitespace around insights; minimal gradients / stock / decorative illustration. Reuse the existing navy/teal web system. No new brand.

## Open items for Jonas
- Sign off on the H1 (or pick an alternative — a couple staged in the visual mock).
- Confirm the alert-mock operator/market is a safe, non-client example (currently a generic "ABC Property Management").
- Anything to cut further for length.
