# Dormant Operator Tier — Spec

**Status:** Draft for Jonas's sign-off. No code until approved.
**Prompted by:** a client question about Riparian Management in Pittsburgh (71 T12 listings, unranked). Surface bug fixed in PR #302; this spec addresses the underlying rule.

---

## 1. The problem

An operator is dropped from the ranked set entirely if it has no listing event in the last **60 days** (`RECENCY_GATE_DAYS`, `tenancy_survival.py`). "Dropped" means: no scorecard, no ranking, no cross-market entity, no trace beyond a tracked-tier search row. It simply vanishes.

That conflates two different questions and answers both with one binary:

1. **Is this operator's data still meaningful?** (their T12 record is real and rich)
2. **Are they currently active and winnable?** (a selection question)

### Measured impact (all 43 markets, Aug 2026 data)

| | Operators | T12 listings |
|---|---|---|
| Clear the ≥30 listing bar | 5,095 | — |
| …of those, fail the ≥3 address rule | 723 | — |
| …of those, **excluded purely by the 60-day recency gate** | **254** | **51,794** |

The recency-excluded set includes some of the largest operators in the country:

| Listings | Operator | Market | Days since last listing |
|---|---|---|---|
| 4,126 | Bridge Property Management | Dallas–Fort Worth | 113 |
| 3,346 | Bridge Property Management | Phoenix | 113 |
| 3,015 | Bridge Property Management | Denver | 113 |
| 2,696 | Thrive Companies | Columbus | 118 |
| 2,515 | Security Properties Residential | Seattle | 69 |
| 1,891 | Quantum Leap Management | San Antonio | 66 |

An owner asking "who operates at scale in Phoenix?" gets a list with Bridge silently missing.

---

## 2. The finding that shapes the design

**Simultaneous multi-market dormancy is a data-source artifact, not operator behavior.**

Bridge Property Management went quiet in **13 markets inside a 7-day window** (ages 106–113 days). That is one company changing listing syndication, not thirteen market exits. Across the dormant set, **7 of 12** multi-market operators went quiet simultaneously in *all* their markets.

This is decisive for the product: telling an owner *"your operator has gone dormant"* when the truth is *"they stopped syndicating to Dwellsy"* is a false statement about the operator. It breaks two locked rules from [[homepage-reposition]]: market-observed claims only, and never adversarial toward PMs.

**Therefore the system must distinguish:**
- **Market-level quiet** (one market, or staggered across markets) → a real signal about that operator in that market.
- **Source-level quiet** (all of an operator's markets stop within ~14 days) → a coverage fact about our data, surfaced neutrally and **never alerted as operator performance**.

### Dormancy bands (operators ≥30 listings, ≥3 addresses)

| Band | Operators | Median listings | Mean | Read |
|---|---|---|---|---|
| 61–90d | 73 | 58 | 170 | Small operators, lumpy cadence — noise |
| 91–120d | 40 | 186 | 617 | Where the large channel-changers sit |
| 121–180d | 49 | 59 | 97 | Genuine dormancy |
| >180d | 92 | 56 | 108 | Long tail |

The 61–90d band is dominated by small operators with naturally uneven listing cadence. Note the perverse incentive in today's rule: **high retention means fewer listings**, so a 30-unit operator with 85% 18-month retention may list ~10 units/year and disappear over a normal winter — punished by the recency gate for the very behavior the retention metric rewards.

---

## 3. Recommendation

### 3.1 Raise the active boundary 60 → 90 days
Absorbs the 73-operator noise band (median 58 listings) whose gaps are cadence, not dormancy. Cheap, low-risk, no new concepts.

**Do not** raise it to 120. That would return Bridge and Thrive to *active* rankings on data 4 months stale, competing against currently-active peers — exactly the misleading outcome the gate exists to prevent. The boundary is not the main fix; the label is.

### 3.2 Add a `dormant` status (>90 days, still inside the T12 window)
Dormant operators **keep their scorecard and metrics** and gain an explicit status.

**Wording (market-observed, non-accusatory):**
> **No listings observed on Dwellsy since May 27, 2026** — metrics reflect the 12 months through that date.

Never "inactive", "departed", "left the market", or anything asserting a business fact we cannot see.

**Where dormant operators appear**

| Surface | Dormant included? |
|---|---|
| Search results | ✅ with status chip |
| Direct scorecard URL | ✅ full scorecard + status banner |
| Cross-market operator profile | ✅ keeps the entity intact |
| Watch lists | ✅ with status (and drives the alert below) |
| Market rankings / "top operators" | ❌ **excluded by default**, opt-in toggle (mirrors the existing broker toggle) |
| Cohort medians + percentile baselines | ❌ **never** — active peers only |

**Cohort decision:** dormant operators are scored *against* the active cohort but never *contribute to* it. This keeps active-vs-active comparisons clean and stops one operator's dormancy from shifting everyone else's percentiles month to month. Their scorecard must say plainly that their window is compared with peers currently active.

### 3.3 Archive at T12 lapse (>365 days)
No T12 activity means no data to show. Drop as today.

### 3.4 Dormancy as a monitoring signal — the actual product win
Today a watch-listed operator going quiet produces **silence**, which is the worst possible outcome for a monitoring product. Under this model it produces a monthly signal:

> **Riparian Management — Pittsburgh.** No new listings observed since May 27, 2026 (71 days). Their Pittsburgh scorecard reflects the 12 months through that date.

**Guardrail:** fire this only for market-level quiet. When an operator's markets all go quiet within ~14 days, suppress the per-market alerts and surface a single neutral coverage note instead — never as a performance change. Riparian qualifies (Pittsburgh quiet, Baltimore still active). Bridge does not.

---

## 4. Phasing

| Phase | Work | Risk |
|---|---|---|
| **0** ✅ | Stop stating the wrong exclusion reason (PR #302) | shipped |
| **1** | Pipeline: emit `operatorStatus` (`active`/`dormant`) + `lastListingDate` instead of dropping; raise gate to 90d; keep dormant out of cohort math | Medium — seed grows by ~181 operators (~5%); needs a full refresh run |
| **2** | UI: status chip + scorecard banner; exclude from rankings with opt-in toggle; search + watch-list status | Low |
| **3** | Dormancy change-alert in the monthly digest, with the simultaneity guardrail | Low |
| **4** | Methodology page: document the three states and the source-vs-market distinction | Low |

**Acceptance gate for Phase 1:** currently-ranked operators must be unchanged (same stars, same percentiles) — dormant operators are *added*, and because they're excluded from cohort baselines, no active operator's numbers may move. Verify per-PM against `pms[]` (not `markets[]` — see the correction noted in this session).

---

## 5. Open questions for Jonas

1. **90 days** as the active boundary — agree, or keep 60 and let everything past it be dormant?
2. **Dormant in watch-list *results*** — currently proposed as included-with-status. Should a dormant operator be allowed to match a watch list at all, or only appear if already pinned?
3. **Source-level quiet** — surface it to clients as a coverage note, or keep it internal (admin-only) and simply stay silent about those operators?
4. Should dormant operators be **excluded from the "30,000+ operators measured" marketing claim**, or counted?
