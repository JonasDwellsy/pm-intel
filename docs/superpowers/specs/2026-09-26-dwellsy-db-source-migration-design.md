# Operator IQ: read from the Dwellsy database instead of CSV exports

**Status:** design, approved in outline 2026-09-26. Phase 1a only.
**Scope:** replace the pipeline's data source. No metric definitions change
except operator identity, which is called out explicitly below.

## Why

Operator IQ consumes periodic per-market CSV exports produced by the Dwellsy
data team and never connects to the database. That costs us four things:

1. **A manual step.** Every refresh waits on an export, arrives as zips, and
   lands via a Drive inbox. The export does not reliably quote `description`,
   so rows arrive corrupted and are repaired by `repair_export_quoting.py`.
2. **Fields we cannot get.** No `organization_id`, no `organization_company`
   bridge, no structured concession fields, no addr3/addr4.
3. **Data we are not receiving.** Measured 2026-09-26: the database holds
   21,863 Bozeman listing rows where the export delivered 12,935, and history
   from 2019-09-04 where the export starts 2020-09-16.
4. **A single-machine dependency.** ~65 GB of source CSVs live on one laptop.

## What we measured (2026-09-26, read-only against `dwellsy_prod`)

Session: PostgreSQL 15.15, user `ai_agent`, `transaction_read_only = on`.

**The export is not a view dump.** `full_export_view`, `full_export_view2` and
`full_export_view3` are CURRENT-SNAPSHOT views — view3 returned 2,207 Bozeman
rows stamped `snapshot_date = 2026-09-26`. Operator IQ needs history. All three
views also lack the six company columns the export carries.

**History lives in a two-table join.**

```sql
from property_listing_table pl
join property_table        p on p.id = pl.property_id
where p.msa_code = :msa_code
```

`property_table` carries `msa_code`, `uru_id`, `community_id`, `company_id`.
`property_listing_table` carries `creation_time`, `deactivation_time`,
`property_listing_status`, `listing_amount`, `listing_deposit`.

**Performance is viable.** Bozeman full history: **1.3 s**. New York: 51 s.
`property_listing_table` is 20.2M rows / 48 GB; `property_table` 17.5M / 124 GB.

**The pipeline reads 24 of the export's 53 columns.** The other 29 — all 11
`ss_raw_*` fields, `listing_id`, `uru_type`, `square_feet`, `year_built` and
more — are never read. We do not need to reproduce the export's shape.

**Identity is better through the canonical path.** For Bozeman:

| | export | database |
|---|---|---|
| rows with an operator id | 81.6% (`parent_company_id`) | **100%** (`property_table.company_id`) |
| distinct companies | 433 child ids | 699 |
| with `organization_company` bridge | n/a — not in the export | **684 (97.9%)** |
| distinct organizations | n/a | 669 |

**Two things we do NOT know.** The export delivers ~60% of Bozeman's rows and
~52% of New York's within the same date window, and we cannot explain why:
`is_deleted` is NULL throughout the view and `record_status` is `active` on all
21,863 Bozeman rows. Ask the data team. We are not reproducing the filter, but
we should know whether the missing rows are excluded for a reason.

## Design

### The seam

A single reader, `market_listings(msa_code, as_of) -> Iterable[dict]`, replaces
`csv.DictReader` at its two call sites in `pipeline.py` (the auto-merge pre-pass
at line 564 and the main pass at line 591). It yields dicts with the SAME 24 keys
the pipeline reads today, so no metric code changes.

Everything downstream — stars, cohorts, retention, the eligibility gate, the
7-cell taxonomy — is untouched by this phase. That is the point of the seam.

### What changes inside it

**17 fields pass through** from the join, renamed where the database differs
(`listing_amount` -> `rent_amount`, listing text -> `description`). Same values.

**6 identity fields change source.** Today: `parent_company_id` when present,
else `child_company_id`. New: `property_table.company_id` resolved through
`organization_company_table` to an organization. This is the ONE deliberate
semantic change in Phase 1a, taken because reproducing the export's 81.6%-covered
parent field would mean building the broken thing on purpose and replacing it
immediately.

`organization_company_table` is a TRUE MANY-TO-MANY bridge (v1.13, EN-1963) — a
company can belong to several organizations. The reader must not pick one
arbitrarily. Where a company maps to multiple organizations, carry the set and
resolve deterministically; never silently take the first.

**1 field is a precomputed aggregate.** `top_down_community_count` reads from
`address_community_table.count_top_down`.

### What we take

Full history, no artificial filters. Not the export's 2020-09-16 floor, and not
whatever drops the other 40%. With no active users there is no restatement cost,
and discarding data we are paying for has no upside.

Consequence: metrics move on cutover. Listing volume roughly doubles in some
markets, which moves T12 counts, the >=30-listing eligibility gate, concession
rates and retention curves. That is a better product, not a regression, but it
must be stated rather than discovered.

### Out of scope for Phase 1a

- **New York (msa 35620).** Structurally unlike the other markets — company
  names are frequently individual agents, 3,439 operators resolve to 102 ranked,
  and it is the worst performance case. Excluded from the migration and its
  validation set; revisit as its own question once the path is proven.
- **Structured concessions.** Replacing 15 prose regexes with
  `concession_table`'s `effective_rent` / `concession_value` changes what a
  published number MEANS. Its own phase.
- **addr3/addr4 subdivisions.**
- **Moving the runtime off the laptop.** That is Phase 1b, deliberately split so
  a data-path failure and an environment failure cannot be confused.

## Validation

Byte-identical output is impossible once we take the full data, so the
acceptance test is an invariant instead.

**Superset reconciliation.** For each in-scope market, every row in the current
export must match a database row on `(uru_id, creation_time)`.

- Export rows with no database match are **migration bugs** — a broken join, a
  wrong filter, a timezone slip. The build fails.
- Database rows with no export match are the data we were missing. Counted and
  characterised by year and status, never silently absorbed.

**Bozeman is the reference case.** Small enough (12,935 vs 21,863) to reconcile
completely and inspect by hand.

**Output invariants**, asserted per market:

- no operator that was scored loses its scored status without an explained cause
- operator count, URU count and listing count each move in an explainable
  direction with a recorded magnitude
- `uru_id` coverage stays at 100% (measured today in both sampled markets)
- no operator identity collapses two organizations into one

**A restatement report** accompanies the cutover PR: per market, before/after
operator counts, ranked counts, and the largest metric movements.

## Risks

**The unexplained 40%.** If the data team's filter exists for a reason — test
listings, duplicates, a source we should not trust — taking everything imports
noise. Mitigation: characterise the extra rows before cutover, and ask.

**Many-to-many identity.** A naive join through the bridge multiplies rows and
inflates every count. Mitigation: `EXISTS` for membership or a separately
aggregated association set, never a plain join. This is called out in the
skill's `product-data-contract.md` and is the single easiest way to get this
wrong.

**Timezone.** Export timestamps versus `timestamp with time zone` in
`property_listing_table`. T12 windows are date-boundary sensitive. Verify
against the reconciliation before trusting any window arithmetic.

**Production load.** 51 s for New York is acceptable ad hoc, but the trajectory
backfill runs the pipeline 810 times. It must pull each market's history ONCE and
move the window in memory rather than issuing 810 queries. Ask whether a read
replica exists before the runtime moves to a cloud runner in Phase 1b.

## Open questions for the data team

1. Why does the export deliver ~60% of the rows the database holds for the same
   market and window? Not `is_deleted` (NULL) and not `record_status` (all
   `active`).
2. Is the 2020-09-16 floor deliberate, and is earlier history trustworthy?
3. Is there a read replica for bulk extraction?
4. Which listing text column backs the export's `description`?
