# Dwellsy DB source cutover: restatement report

Per-market before/after for the CSV export -> Dwellsy database pipeline source switch (`pipeline.py --source csv` vs `--source db`).
Both sides run at the SAME `--as-of 2026-09-08` — this isolates the source change (population, current-state photos/amenities/community counts) from the ~18-day calendar drift between the export's date and today. A separate, later run advancing `--as-of` to the current date is expected to move numbers further; that is not what this report measures.

## bozeman-mt

**Takeaway:** 21 → 24 operators scored (3 gained, 0 lost).

### Counts

| | csv | db | delta |
|---|---|---|---|
| Input rows (this MSA) | 12,935 | 18,807 | +5,872 |
| Distinct URUs (T12, market-wide) | 2,395 | 3,056 | +661 |
| Operators observed (T12 >=1) | 196 | 211 | +15 |
| Active operators (T12 >=3) | 80 | 88 | +8 |
| Operators scored (ranked+dormant, T12 >=30) | 21 | 24 | +3 |
| uru_id coverage (non-blank share of input rows) | 99.97% | 100.00% | — |

_db-side uru_id coverage is 100% by construction: `market_listings` filters on `has_uru` itself, so every row it emits already has a uru_id. See "Rows dropped only for a missing URU" in the invariant checklist below for what that filter actually costs._

### Lost operators (scored in csv, not in db)

- No operator lost scored status.

### Gained operators (scored in db, not in csv)

- 3 newly scored (present in db output, absent from csv). Top 3 by T12 volume:

| name | T12 listings | 7-cell | data tier |
|---|---|---|---|
| Alliance Property Management | 55 | SFR Independent | Full ranking |
| Quality Properties | 43 | SFR Independent | Full ranking |
| Echo Property Management LLC | 37 | SFR Independent | Full ranking |

### Metric movements (operators scored in both)

| metric | n | median ∣Δ∣ | unchanged | up1 | up2+ | down1 | down2+ | rating gained/lost |
|---|---|---|---|---|---|---|---|---|
| DOM (T12 median, days) | 21 | 1.0 | 17 | 0 | 2 | 1 | 1 | 0 |
| Rent YoY change | 21 | +1.8% | 19 | 0 | 1 | 0 | 1 | 0 |
| 18-mo retention | 21 | 2.3% | 16 | 1 | 2 | 1 | 1 | 0 |
| Marketing composite | 21 | 0.7 | 6 | 0 | 0 | 0 | 0 | 0 |

**Top movers — DOM (T12 median, days)**

| operator | csv | db |
|---|---|---|
| Platinum Property Management | 42.5 | 47.0 |
| Connect Property Management | 49.0 | 45.0 |
| Infinite Property Management | 26.0 | 29.0 |
| The Property Managers Company | 62.0 | 65.0 |
| Management Associates | 32.5 | 30.0 |

**Top movers — Rent YoY change**

| operator | csv | db |
|---|---|---|
| Rental Professionals | +5.0% | -0.9% |
| Legacy Properties | -11.1% | -16.4% |
| Management Associates | +5.5% | +10.6% |
| The Property Managers Company | +19.1% | +14.1% |
| Peak Property Management | +9.7% | +4.9% |

**Top movers — 18-mo retention**

| operator | csv | db |
|---|---|---|
| Absolute Property Management | 74.2% | 66.7% |
| CR Management | 71.6% | 64.5% |
| Aspen Properties | 73.0% | 67.9% |
| Management Associates | 73.8% | 68.7% |
| Gallatin Creeks To Peaks | 59.6% | 64.2% |

**Top movers — Marketing composite**

| operator | csv | db |
|---|---|---|
| Property Partners Of Montana | 65.1 | 58.1 |
| Montana Crestview | 58.0 | 54.7 |
| Rental Professionals | 78.3 | 75.0 |
| CS Management | 51.8 | 49.3 |
| Luna Properties | 85.0 | 82.5 |

### Marketing / photos

The reconciliation gate found the export omits some active photos for some properties (example: property 9555972 has 35 active images, all created 2026-08-01, but the export lists only 20 of them; the dropped ones carry a different source-filename pattern from the kept ones -- an export photo-selection rule the database doesn't expose). On this market, the raw median photo count runs about the same on the db side (see the table below); the shift need not be uniform across operators if it's concentrated in a few properties rather than systemic. Distribution is across every scored operator on each side (not just those scored in both), csv vs db:

| | csv median | csv p10 | csv p90 | db median | db p10 | db p90 |
|---|---|---|---|---|---|---|
| Photos sub-score (0-100, cohort-scaled) | 53.3 | 36.7 | 86.7 | 50.0 | 31.0 | 74.7 |
| Raw median photos, T12 listings (count) | 16.0 | 11.0 | 26.0 | 15.0 | 9.3 | 22.4 |
| Marketing composite (internal-only, not ranked) | 60.1 | 48.5 | 85.0 | 58.1 | 43.5 | 81.3 |

- Marketing star changed for 0 / 21 operators scored in both (0.0%).

### Invariant checklist

| invariant | result |
|---|---|
| No unexplained lost operators | PASS |
| Counts move in the expected direction (db >= csv rows) | PASS |
| Rows dropped only for a missing URU: 4 (0.02%) | PASS |

## kansas-city-mo-ks

**Takeaway:** 124 → 132 operators scored (9 gained, 1 lost, all explained).

### Counts

| | csv | db | delta |
|---|---|---|---|
| Input rows (this MSA) | 89,246 | 105,712 | +16,466 |
| Distinct URUs (T12, market-wide) | 14,273 | 16,137 | +1,864 |
| Operators observed (T12 >=1) | 848 | 888 | +40 |
| Active operators (T12 >=3) | 345 | 354 | +9 |
| Operators scored (ranked+dormant, T12 >=30) | 124 | 132 | +8 |
| uru_id coverage (non-blank share of input rows) | 100.00% | 100.00% | — |

_db-side uru_id coverage is 100% by construction: `market_listings` filters on `has_uru` itself, so every row it emits already has a uru_id. See "Rows dropped only for a missing URU" in the invariant checklist below for what that filter actually costs._

### Lost operators (scored in csv, not in db)

| slug | name | csv T12 listings | csv data tier | verdict |
|---|---|---|---|---|
| onecity-kansas-city-mo-ks | OneCity | 54 (min 30) | Full ranking | EXPLAINED — current-state property change after the export: 113 of OneCity's 175 export listings (child companies Foxdale Apartments LLP 113849 and Kingston Green Apartments 499249, parent OneCity 503083) are still in the database with the same company hierarchy, but their properties were changed after 2026-09-08 to property_category 'Waitlist' with no URU and no DPV match, so the data team's own quality filters (not_waitlist, has_uru, dpv_match) now exclude them. T12 listings fall from 54 to below the 30-listing floor. Not a reader bug; it shows that property-level edits apply retroactively to listing history. |

### Gained operators (scored in db, not in csv)

- 9 newly scored (present in db output, absent from csv). Top 9 by T12 volume:

| name | T12 listings | 7-cell | data tier |
|---|---|---|---|
| Eagle's Nest Apartments | 52 | Small MF/BTR Independent | Full ranking |
| KC Lar Management | 50 | Hybrid | Full ranking |
| Point Guard Management | 36 | Small MF/BTR Independent | Full ranking |
| Alexander Forrest Investments | 33 | Small MF/BTR Independent | Full ranking |
| Aui Realty | 33 | SFR Independent | Full ranking |
| Holiday Apartments | 33 | Small MF/BTR Independent | Full ranking |
| Greenamyre Rentals | 32 | SFR Independent | Full ranking |
| E State Management | 30 | Small MF/BTR Independent | Full ranking |
| Keyrenter Property Management Overland Park | 30 | SFR Independent | Full ranking |

### Metric movements (operators scored in both)

| metric | n | median ∣Δ∣ | unchanged | up1 | up2+ | down1 | down2+ | rating gained/lost |
|---|---|---|---|---|---|---|---|---|
| DOM (T12 median, days) | 123 | 0.5 | 112 | 4 | 4 | 1 | 2 | 0 |
| Rent YoY change | 101 | +1.0% | 78 | 3 | 6 | 8 | 6 | 0 |
| 18-mo retention | 85 | 1.0% | 72 | 4 | 4 | 1 | 4 | 0 |
| Marketing composite | 123 | 0.5 | 59 | 0 | 0 | 1 | 0 | 1 |

**Top movers — DOM (T12 median, days)**

| operator | csv | db |
|---|---|---|
| Blusky PM | 101.0 | 84.5 |
| Epoch Management CO | 71.0 | 56.0 |
| Cornerstone Property Management | 15.5 | 27.0 |
| Purpose Residential | 31.5 | 42.0 |
| RT Management LLC | 107.0 | 98.0 |

**Top movers — Rent YoY change**

| operator | csv | db |
|---|---|---|
| Foxtail Real Estate Company | +91.8% | +37.5% |
| Real Smart | -25.4% | +0.6% |
| Midwest Property Management | -12.8% | +6.2% |
| Location Properties | +3.3% | -12.2% |
| J And J Rentals | -3.1% | +8.6% |

**Top movers — 18-mo retention**

| operator | csv | db |
|---|---|---|
| Real Smart | 88.8% | 75.9% |
| The Tiehen Group | 60.4% | 70.0% |
| Midwest Property Management | 72.1% | 63.8% |
| J And J Rentals | 69.7% | 62.7% |
| Ranger Management | 60.0% | 66.4% |

**Top movers — Marketing composite**

| operator | csv | db |
|---|---|---|
| Frontier Property Management | 17.5 | 48.7 |
| Cooper Murdock | 78.2 | 62.1 |
| Valhalla Management | 80.8 | 70.1 |
| Real Smart | 60.8 | 52.5 |
| Foxtail Real Estate Company | 66.0 | 61.0 |

### Marketing / photos

The reconciliation gate found the export omits some active photos for some properties (example: property 9555972 has 35 active images, all created 2026-08-01, but the export lists only 20 of them; the dropped ones carry a different source-filename pattern from the kept ones -- an export photo-selection rule the database doesn't expose). On this market, the raw median photo count runs about the same on the db side (see the table below); the shift need not be uniform across operators if it's concentrated in a few properties rather than systemic. Distribution is across every scored operator on each side (not just those scored in both), csv vs db:

| | csv median | csv p10 | csv p90 | db median | db p10 | db p90 |
|---|---|---|---|---|---|---|
| Photos sub-score (0-100, cohort-scaled) | 56.7 | 31.7 | 100.0 | 56.7 | 30.0 | 100.0 |
| Raw median photos, T12 listings (count) | 17.0 | 9.0 | 33.4 | 17.0 | 9.0 | 34.8 |
| Marketing composite (internal-only, not ranked) | 69.1 | 35.2 | 83.9 | 68.8 | 39.2 | 85.2 |

- Marketing star changed for 2 / 123 operators scored in both (1.6%).

### Invariant checklist

| invariant | result |
|---|---|
| No unexplained lost operators | PASS |
| Counts move in the expected direction (db >= csv rows) | PASS |
| Rows dropped only for a missing URU: 0 (0.00%) | PASS |
