# URU Identity & Direct Database Source — Design Spec

**Date:** 2026-08-21
**Status:** Draft for review
**Goal:** Adopt `uru_id` as the authoritative unit identifier inside Operator IQ, and replace the monthly CSV export with a self-served snapshot queried directly from `dwellsy_prod`.

---

## 1. Problem & context

Two problems that share a root, both surfaced while scoping the pending methodology re-run.

**The source is a monthly hand-off.** Operator IQ consumes `export_*.csv` from the data team, which `merge_listings.py` folds into 44 per-market `merged_*.csv` files totalling **19.1 GB**, synced through Google Drive. Every refresh waits on that hand-off. Direct read-only access to `dwellsy_prod` now exists and is already used to build Market IQ, so the hand-off is no longer necessary.

**Unit identity is not persisted.** `uru_id` — Dwellsy's authoritative unit-level identifier, which will in time replace `dwellsy_address_id` — reaches the pipeline but never the database. It is used in exactly one way, as a set-membership key:

```python
d["urus_t12"].add(uru)              # -> urusT12, the size-metric basis
d["comm_urus_t12"][cid].add(uru)    # -> community concentration, classification
d["city_urus_t12"][city].add(uru)   # -> geographic coverage
```

`len()` is then taken and **the identifiers are discarded**. Only counts survive.

Where unit identity *does* reach the database, it is address-level instead. `PropertyHome` is keyed `@@unique([pmSlug, addressId])` on `address1_id`. For scattered single-family that is adequate — one address, one unit. For an apartment building it collapses 200 units into one row, which is why `build_home_records` is **scattered-SFR only** and drops concentrated MF communities at emit. That exclusion is a workaround for address-level identity, not a product decision.

**The prize:** adopting `uru_id` makes property-level detail possible for multifamily, which is currently impossible.

## 2. What the pipeline actually needs from the source

**25 of the export's 53 columns.** The other 28 — `square_feet`, `year_built`, the eleven `ss_raw_*` address-parse fields, `msa_name`, `listing_deposit`, `dwellsy_address_id` and others — are carried and never read.

```
address1_id    address_1        address_city      address_type   amenities
bedrooms       child_company_id child_company_type community_id  company_name
creation_time  deactivation_time description       latitude      listing_id
longitude      msa_code         parent_company_id  parent_company_name
parent_company_type  photos     property_listing_status  rent_amount
top_down_community_count        uru_id
```

Three of these looked derived rather than stored, and were confirmed authoritative and available:

| column | status |
|---|---|
| `uru_id` | New unit-level identifier, will replace `dwellsy_address_id`. Authoritative. |
| `top_down_community_count` | Aggregate calculated by Dwellsy. Authoritative. |
| `parent_company_id` / `_name` | Hybrid — from the PM plus Dwellsy's grouping work. Authoritative. |

Nothing has to be reimplemented on our side.

## 3. Architecture decision — snapshot, don't query live

`pipeline.py` will **not** query the database directly during a run. A separate step materialises the query to a local snapshot; the pipeline reads that.

Reasons, in order of weight:

1. **`dataAsOf` semantics.** It is defined as the newest real listing event in the data, not "now". `merge_listings.py --apply` derives it from the export and patches `markets.json`. A live query has no equivalent anchor.
2. **Reproducibility.** The pipeline guarantees byte-identical output for a given input under `PYTHONHASHSEED=0`, and the monthly acceptance gate is a per-market `json.dumps` comparison. Two runs a day apart against a live database would silently differ, and that gate would become meaningless.
3. **Load.** The T12 window across 44 MSAs is a large analytical scan against an OLTP database — Dallas alone is 1.7 GB over that window. One controlled extract is kinder than 44 pipeline runs hitting it, and kinder still than two passes of 44.
4. **Failure isolation.** A snapshot on disk can be re-run against, diffed, and rolled back. A transient query failure mid-refresh cannot.

The snapshot replaces the *export*, not the *file*. What goes away is the dependency on another team and the 19.1 GB of merged CSVs — not the discipline of running against a frozen input.

## 4. Workstreams

Three pieces, independently useful and independently shippable.

### A. Persist `uru_id` (additive, low risk)

Carry the identifiers through instead of discarding them after counting.

- Pipeline emits per-operator URU sets where they are already computed (`urus_t12`, `comm_urus_t12`, `city_urus_t12`).
- Nothing changes behaviourally: every existing count remains `len()` of the same set. **Acceptance is 0-drift** on all existing metrics — this must not move a single score or star.
- Size cost is real and must be measured before committing: ~4,468 operators × their T12 unit counts. If the seed grows materially, the identifiers belong in a sidecar table rather than the blob, following the `PropertyHome` precedent rather than the scorecard-blob one.

**This is the prerequisite for B.** It is worth landing alone even if B is deferred.

### B. Re-key `PropertyHome` on `uru_id`, lift the SFR-only restriction

Where the value is.

- Schema: `PropertyHome.addressId` → `uruId`, `@@unique([pmSlug, uruId])`. An expand-and-contract migration, matching the pattern used to remove the watch-list `kind` column (#255/#256): add the new column, backfill, switch reads, drop the old one.
- `build_home_records` stops dropping concentrated MF communities. The `concentrated_cids` exclusion exists only because address identity cannot represent MF units; with unit identity it is unnecessary.
- **Open question — volume.** Today's SFR-only export is bounded by scattered homes. Admitting MF means one row per apartment unit, which could be a large multiple. Needs measuring on one market before committing, and may need the entitlement gating the Homes export already has.
- Unlocks two things beyond MF coverage: unit-level change tracking (which specific units churned between snapshots), and a shared join key with Dwellsy's own data.

### C. Direct source snapshot (independent of A and B)

- A new extract script queries `dwellsy_prod` for the 25 columns, filtered by `msa_code` and the T12 window, and writes one snapshot per market in the shape `pipeline.py` already reads.
- `dataAsOf` derived from `max(creation_time, deactivation_time)` in the extract, preserving today's semantics, and patched into `markets.json` exactly as `merge_listings.py` does now.
- `merge_listings.py` is retired once the extract is proven — but not before. Both paths should coexist for at least one refresh so the outputs can be compared.
- **Acceptance: a snapshot-sourced run must reproduce a CSV-sourced run.** Same market, same `dataAsOf`, per-market `json.dumps` comparison, zero drift. That is the only convincing proof the extract is faithful.

## 5. Sequencing

**C first** if the goal is removing the export dependency. It is independent, it makes the pending methodology re-run self-served, and it is the piece with an unambiguous acceptance test.

**A then B** if multifamily property detail is more urgent. B is the larger product win; A is its prerequisite and is cheap.

They do not conflict — A/B change what we store, C changes where data comes from. The only ordering constraint is A before B.

## 6. Risks & open questions

| risk | mitigation |
|---|---|
| Query load on a production OLTP database | Read replica if available; index on `(msa_code, creation_time, deactivation_time)`; one extract rather than per-run queries |
| Extract silently differs from the export | 0-drift acceptance against a CSV-sourced run before retiring `merge_listings.py` |
| Seed size growth from persisting URUs | Measure first; sidecar table if material |
| MF admission explodes `PropertyHome` volume | Measure on one market; reuse the existing entitlement gate |
| Credentials handling | Read-only by policy. The connection string is never printed, copied, or logged, per `AGENTS.md` in the Dwellsy Database Access project |

**Open questions requiring the schema:**

1. Which tables in `dwellsy_prod` hold the 25 columns, and do they join cleanly per listing?
2. Is `uru_id` populated for all listings, or only recent ones? A partial rollout changes both A and B materially — counts would silently shift if some listings lack it.
3. Is `top_down_community_count` a stored column or a view-time aggregate?
4. Is there a read replica, or is `dwellsy_prod` the primary?

**Blocked on environment:** no PostgreSQL client is installed in this workspace (`psql`, `psycopg2`, `psycopg3`, node `pg` all absent), and the credentials path is gated by the permission classifier. Both need resolving before the schema questions can be answered here.

## 7. Explicit non-goals

- **Not** replacing Dwellsy's identity resolution. `uru_id`, the parent/child company grouping and `top_down_community_count` are authoritative upstream and are consumed, not recomputed.
- **Not** changing any metric. A and C are identity and plumbing; both must be 0-drift.
- **Not** live-querying from `pipeline.py`. See §3.
- **Not** bundled with the pending methodology re-run (#420, #422). That release should ship on the current source so its acceptance gate stays interpretable.
