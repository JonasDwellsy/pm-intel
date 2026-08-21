# Market IQ Daily Edition

**Product specification. Proposed. 21 August 2026.**
Reference market: Cleveland–Elyria–Mentor, OH MSA.

Turning a monthly market report into a daily regional intelligence brief, using
data the application can already reach and a newspaper's discipline about what
counts as news.

---

## Summary: the press is installed, one file is the gap

Market IQ is currently a monthly product, but not because the underlying data is
monthly. `src/lib/dwellsy-source/listing-events.server.ts` already queries
`event_type: "new_listing" | "price_change"` along with
`confirmed_price_changes_24h`, `asking_rent`, `previous_rent` and `observed_at`.
Daily-moving events are already reachable in application code.

The constraint sits one layer up. `src/lib/market-iq/alerts.ts`, which generates
every headline a customer reads, consumes only `MarketIqTrendPoint[]`, which is a
monthly series. It can therefore produce exactly three sentences: asking rents
are rising, asking rents are softening, and rents moved higher or lower this
month.

That is the whole reason the dashboard rewards one visit a month. It is a wiring
problem in the intelligence layer, not a data acquisition problem, which makes it
a small piece of work with a large product consequence.

---

## Measured: what the reference market produces in a day

All figures below were measured directly against the live Dwellsy dataset on
21 August 2026 for the Cleveland–Elyria–Mentor, OH MSA. They are the basis for
every cadence decision in this document.

| Signal                            | Value             | Basis                    |
| --------------------------------- | ----------------- | ------------------------ |
| Active listings                   | 1,340             | Standing inventory       |
| New listings                      | ~11 / day         | 77 over 7 days           |
| Delistings                        | ~12 / day         | 81 over 7 days           |
| Median time to resolution         | 21 days           | 53,660 closed listings   |
| Median asking rent, active        | $1,245            | All bedroom counts       |

Inflow and outflow are close to balanced at roughly 11 in and 12 out per day.
That yields about 23 flow events daily, before price changes, which could not be
measured through the analytics interface because they live in the `dwellsy_prod`
table the application reads directly. A reasonable working estimate is **25 to 35
events per day.**

**Verdict: daily is viable, but not on flow alone.** A daily edition built only
from new listings would look thin on a slow Tuesday. The resolution is that
newspapers do not fill themselves from new events; they fill themselves from
standing sections. The most dependable of those is the calendar (see The Aging
Watch, below).

---

## Lead finding: days-on-market is a closing metric, and the strongest asset here

`days_on_market` is stamped at deactivation, never while a listing is live.

| Listing status | Records | DOM populated | Median DOM |
| -------------- | ------- | ------------- | ---------- |
| active         | 1,340   | **0**         | none       |
| inactive       | 53,660  | 53,660        | 21 days    |

The field is populated on 100% of closed listings and 0% of live ones. It is not
a listing-age field. It is a **time-to-resolution** field, and Dwellsy holds it
on 53,660 Cleveland records.

This is the most commercially valuable number in the dataset and it is not
currently in the product. "How long will it take to fill this unit" is the
question a property manager asks every week and the question an owner asks at
every vacancy. No competitor publishes a defensible answer. Market IQ can, broken
out by market, bedroom count and rent band, and trended over time.

Two engineering consequences follow:

1. Any live listing-age display must compute age from `creation_time`, because
   the DOM column will be null for every active row.
2. The time-to-resolution feature needs its own query path, since existing
   readers filter to active listings and would return an empty set.

**Required label: time to resolution, not time to lease.** An inactive listing
may have leased or may have been withdrawn. Dwellsy observes disappearance, not a
signed lease. The product must say so in the interface rather than letting a
customer discover it. This is the same standard that justified removing the
seeded Cleveland fallback: describe what was observed, never what was inferred
and presented as observed.

---

## Blocker: inventory does not reconcile

Observed active inventory runs four to six times higher than flow and tenure
predict.

| Input                             | Value        | Source                    |
| --------------------------------- | ------------ | ------------------------- |
| Daily inflow                      | ~11 / day    | Measured, 7-day window    |
| Median time to resolution         | 21 days      | Measured, 53,660 records  |
| Implied steady-state inventory    | 230 to 330   | Derived                   |
| Observed active inventory         | **1,340**    | Measured                  |

Two explanations fit. Either the active pool carries stale listings that leased
or were withdrawn without receiving a deactivation event, or current inflow is
seasonally depressed against a normally sized standing pool. Which one is true
cannot be determined from outside the pipeline.

A monthly product survives a soft inventory count because no reader checks it
against their own leasing board. A daily product does not. The first Cleveland
property manager who reads *1,340 active listings* while knowing the real figure
is nearer 400 will stop trusting every other number on the page, and that trust
does not come back.

This is a prerequisite to daily publication rather than an improvement to it. If
it cannot be settled before launch, the honest interim is to publish flow counts,
which are directly observed, and withhold the standing inventory count until it
reconciles. Investigation is scoped as a read-only diagnostic item in the build
sequence below.

---

## Editorial doctrine: the monthly trend is the Sunday feature, never Monday's front page

**No section may present a monthly series as a daily observation.**

The Gaussian rent trend is genuinely authoritative and is the hardest thing here
to replicate. It is also monthly. Re-dating it, re-slicing it, or narrating it as
movement that happened today manufactures news, which is the precise failure mode
that four prior pull requests were spent removing from the report composer. Every
daily headline must carry the `observed_at` of a real underlying event, and no
headline may be synthesized from interpolation between monthly points.

The practical test for any proposed section is one question: did something
actually change, and can the product name what and when. Sections that pass split
into three honest categories:

- **Event driven.** New listings, price changes with both previous and current
  asking rent, delistings. Genuinely daily, because the events are.
- **Calendar driven.** Listings crossing 30, 60 and 90 days on market. News
  generated by time passing rather than new data arriving, which keeps a slow day
  from looking empty.
- **Standing.** Active inventory, live median asking rent, time-to-resolution
  distribution. These move slowly, and that is acceptable. A newspaper prints the
  weather daily and no reader objects that it is the same section.

---

## Section map

| Section          | What it reports                                                  | Source                              | Cadence         | Required label                          |
| ---------------- | --------------------------------------------------------------- | ----------------------------------- | --------------- | --------------------------------------- |
| New to market    | Listings first observed since the last edition, rent + beds     | `listing-events.server.ts`          | Daily           | Observation date, not listing date      |
| Rent changes     | Confirmed price changes, previous and current asking rent       | `confirmed_price_changes_24h`       | Daily           | Asking rent, not achieved rent          |
| Off the market   | Listings that disappeared, with the age they reached            | `deactivation_time`                 | Daily           | Leased or withdrawn, undetermined       |
| The aging watch  | Listings crossing 30, 60 and 90 days still live                 | computed from `creation_time`       | Daily           | Live age; DOM column null while active  |
| Time to fill     | Median + distribution of time to resolution, by beds/rent band  | `days_on_market` on inactive rows   | Weekly refresh  | Time to resolution, not time to lease   |
| Concessions      | Free-month and incentive language in new listing text           | `description`, existing parsing      | Daily           | Advertised, not verified                |
| Box scores       | Active inventory, live median asking rent, inflow/outflow       | `active-listings.server.ts`         | Daily           | Held back until inventory reconciles    |
| Rent trend       | Gaussian YoY and MoM trend                                      | `MarketIqTrendPoint[]`              | Monthly         | Labeled as the monthly analysis         |

**Time to fill is the lead feature.** **Concessions is the leading indicator** — a
PM discounts with a free month before cutting the headline rent, so softening
appears in listing text weeks before it appears in the monthly trend. That means
the daily edition can legitimately break news ahead of the monthly report, which
is the cleanest available answer to why anyone would open this daily. Concession
references already exist in `report/email.ts` and `report.ts`.

---

## Reader model: two products, two readers, no engagement mechanics

The codebase suggests Market IQ is less a market-data subscription than a
white-label reporting product. There is a brand profile, logo upload, client
reporting, distribution campaigns, and published public tokens. The property
manager is not the end reader. The property manager's owner is.

That resolves the retention question without any engineered nudging. The daily
edition is the manager's working notebook, checked the way a trader checks a
screen, because it reports what competitors did yesterday. The monthly branded
report is their deliverable, the artifact carrying their logo that makes their
firm look like it runs an institutional research desk.

Because the daily edition earns its visit on utility, it should ship **without
streaks, badges, or a notification cadence.** A manager who can see that the
building across the street cut asking rent by $75 does not need reminding to look.

One causal discipline applies throughout. This is asking-rent and listing-event
data. It supports statements about what was advertised and when it changed. It
does not support claims about why, about achieved rents, or about occupancy.
Section copy should describe movement and let the reader supply causation.

> **Note (flagged for Jonas):** the reader model is inferred from the codebase
> surface, not confirmed from the go-to-market plan. It is load-bearing for the
> "two products, two readers" argument and the recommendation against engagement
> mechanics. Confirm against how the product is actually sold before treating it
> as settled.

---

## Build sequence (ordered by dependency, not appeal)

> **Preview-environment posture (updated 21 Aug).** The DNS A record for the
> stable preview domain, the automation bypass secret, and a green deployment
> identity run are still outstanding with Nikolay. Codex is cleared to **author
> and open** the PRs below now and validate them with local tests. What waits for
> a trusted preview is the **merge-and-deploy**, not the authoring. Do not rely on
> the preview environment to verify any of this work; rely on unit tests and the
> guard tests specified in Acceptance Criteria.

1. **Wire daily events into the alert layer.** Extend `alerts.ts` to accept
   listing events from `listing-events.server.ts` alongside monthly trend points,
   and generate event-derived headlines from observed events only. Ships the
   first three sections (New to market, Rent changes, Off the market). One PR, no
   schema change. **Start now.**

2. **Add the aging watch.** Compute live listing age from `creation_time` and
   emit crossings at 30, 60 and 90 days. Depends on step 1 for the headline
   mechanism and guarantees daily content volume on low-flow days. One PR.

3. **Investigate the inventory discrepancy (read-only diagnostic).** Determine
   whether the 4–6× active-inventory gap is stale deactivation events or
   seasonally depressed inflow. Read-only against the pipeline, same posture as
   the earlier Operator IQ audit — no mutations, no production secrets delegated.
   Output is a written finding, not a code change. Can run in parallel with
   steps 1 and 2. Gates step 5.

4. **Build time to fill.** New query path against inactive rows, since every
   existing reader filters to active and would return nothing. Distribution by
   bedroom count and rent band. This is the lead feature and strongest
   differentiator, but it is fourth because it needs its own data access rather
   than reusing the event reader. Publishes independently of the inventory
   question, because it derives entirely from closed listings. One PR.

5. **Reconcile inventory, then publish box scores.** Act on the step-3 finding.
   Publish the standing inventory count only once it reconciles; flow counts can
   publish before then because they are directly observed.

6. **Concessions section.** Extend existing concession parsing into a daily
   section. Sequenced last among build items because it is the highest-variance
   extraction, but it carries the most product upside as a leading indicator.
   One PR.

---

## Acceptance criteria (event-wiring PR, step 1)

- Every daily headline carries the `observed_at` value of a real underlying
  event. No headline may present a synthesized or generation-time timestamp as an
  observation time.
- Monthly trend content remains labeled as monthly and cannot render inside a
  daily section, by construction rather than by convention.
- When the source read fails, the daily section states that no events were
  observed for the period. It does not fall back to trend-derived text, and it
  does not fall back to seeded or example content.
- The unavailable state may show the time a read was attempted. It must not show
  a freshness timestamp for data it does not have.
- No section computes a rent trend locally. The Gaussian trend remains the single
  source for trend figures and is never recomputed from record-level data.
- A guard test asserts that no daily-section module imports monthly trend types,
  so the boundary cannot be reintroduced by a later change.
- The PR is validated with local unit and guard tests. It must not depend on the
  preview environment for verification, and it must not be merged to a branch that
  auto-deploys until the preview environment is trusted.

---

## Open decisions (business, not build)

**Is the launch claim daily, or weekly with daily updates available?**
At 25–35 events/day, Cleveland supports either. Weekly is easier to make look
full and harder to be embarrassed by. Daily is the stronger product claim and
matches the metaphor. The deciding factor is the thinnest market in the launch
set, which is a design-partner question.
*Recommendation: decide after the partner list is fixed.*

**Does the daily edition ship inside the existing dashboard, or as its own
surface?** The reader model argues for separation: the manager's working notebook
and the owner-facing branded report have different readers and standards of
polish.
*Recommendation: separate surface, shared data layer.*

**Does time to fill publish before inventory reconciles?** It can, because it
derives entirely from closed listings and is unaffected by stale active rows.
*Recommendation: yes, publish independently.*

---

## Provenance

Volume, days-on-market and inventory figures were measured against the live
Dwellsy dataset on 21 August 2026 for the Cleveland–Elyria–Mentor, OH MSA.
Price-change volume was not measured and is estimated, because that signal
resides in a table not exposed through the analytics interface. Architectural
claims were verified against `src/lib/market-iq/alerts.ts` and
`src/lib/dwellsy-source/listing-events.server.ts` on the Market IQ integration
branch.

**Open questions requiring input:** whether the active-inventory discrepancy is
stale deactivation or seasonal inflow (scoped as build step 3); whether
concession language is extracted consistently enough across sources to carry a
daily section; the three open decisions above, each of which depends on the
design-partner list and pricing rather than on anything in the codebase.
