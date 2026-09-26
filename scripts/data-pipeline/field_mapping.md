# Dwellsy export field mapping

This file maps each of the 24 export columns the pipeline reads to the
`dwellsy_prod` expression that produces it. Task 3 builds its query from this
file. It was established on 2026-09-26 against the live production database,
read-only and scoped to Bozeman (msa 14580). The reference file was
`merged_bozeman-mt_20260908.csv` (12,935 rows, all well-formed).

To reproduce: `cd scripts/data-pipeline && python3 probe_field_mapping.py`
(about 20 s). Every number below comes from that script's output.

## How the mapping was proven

1. **The data team's own view.** `dwellsy_prod.full_export_view` (and its
   variants `full_export_view2` and `full_export_view3`) has a select list that
   names 47 of the export's 53 columns, with the same aliases. That select list
   is where each expression below came from. The six `child_/parent_company_*`
   columns are not in the view. They were derived from the joins the view already
   uses, then tested the same way as the rest.
2. **Value agreement on matched rows.** 1,000 export rows were drawn uniformly
   at random (seed 20260926) and joined to the DB on
   `listing_id = property_listing_table.id`. All 1,000 matched. The join is 1:1:
   `l.id` is the primary key, and every later join in the FROM clause below
   lands on a `PRIMARY KEY (id)`. The brief's `(uru_id, creation date)` key was
   used as a cross-check. It agreed on 1,000/1,000 of the listing_id-matched
   rows. `listing_id` is the stronger key because the export carries it and it
   is the table's PK.
3. **Whole-export checks where they were cheap.** The company fields were
   checked on all 12,935 rows, one lookup per child company (433 of them).
   All 12,935 export `listing_id`s exist in the DB under `p.msa_code = 14580`.

## Status definitions

- **VERIFIED**: the values agree at the value level on matched rows. The
  agreement rate is given in the row. Any residual mismatches were diagnosed.
- **UNVERIFIED**: a plausible source exists, but its values were not proven to
  match. The row says why.
- **UNRESOLVED**: no source was found. Any UNRESOLVED row blocks Task 3.

**Result: 24 VERIFIED, 0 UNVERIFIED, 0 UNRESOLVED. Nothing blocks Task 3.**

## Open questions for the data team

None of these block Task 3. Every field has a proven source. They affect
parity (Task 5) and semantics.

1. **What SQL produced the export?** It is not `full_export_view` verbatim, and
   the producing query is not stored in the DB. We searched views, matviews and
   functions. The differences we observed:
   - The export includes houses. The view's clause
     `a2.address_type_id = 1 OR (a1.address_type_id = 1 AND a2.address_type_id IS NULL)`
     would drop 21.8% of the export's rows.
   - The export spans 2020-10-29 to 2026-09-08, while the view's window is hard-coded.
   - `photos` is joined with `;` in the export, not the view's `'; '`.
   - `description` has no `property_description` fallback and no `\`→`/` replace.
2. **Timestamps are Pacific wall-clock with no offset.** Please confirm that this
   is intentional and the same for every market export (see "Timestamps" below).
3. **Unexplained population gap.** 5,740 Bozeman listings pass every
   `full_export_view` filter except the apartment-only clause, yet are absent
   from the export.
   - 1,850 of them predate the export's first listing (2020-10-29).
   - Of the other 3,890, 3,830 belong to URUs that never appear in the export.
     3,817 sit at address1 records that never appear in it. Their companies do
     appear: 94% of them are export companies.
   - None of the address attributes we profiled separates them from exported
     addresses: `is_hidden`, `canonical_type`, dpv, precision, `multi_family`,
     `reviewed`, `unit_structure`, city/zip, and recent updates.

   What excludes them? Task 5 owns this reconciliation.
4. **Descriptions that are now NULL.** 100 export rows (0.8%) carry description
   text where `l.listing_long_text` is now NULL.
   - 90 of them come from two operators: Montana Crestview (54) and Connect
     Property Management (36).
   - They are mostly 2024–25 listings.
   - Only 17 of them equal the current `p.property_description`.

   Was the text cleared after capture, or did an older export generation fall
   back to `property_description`?
5. **No history for property-level attributes.** `amenities`, `photos`, and the
   company, community and address attributes are current state at pull time. The
   merged CSV mixes rows pulled at different dates. A live query therefore
   attaches today's photos and amenities to historical listings. The only thing
   in the DB that looks like history is `deleted_property_media_table`, and it
   does not reconstruct the export (see `photos` below). Is there a media or
   amenity audit trail?

## Base FROM clause (paste into Task 3)

```sql
from dwellsy_prod.property_listing_table l
join dwellsy_prod.property_table p                on p.id   = l.property_id
left join dwellsy_prod.address_line1_table a1     on a1.id  = p.address1_id
left join dwellsy_prod.address_type_table aty     on aty.id = a1.address_type_id
left join dwellsy_prod.address_line2_table a2     on a2.id  = p.address2_id
left join dwellsy_prod.address_community_table ac on ac.id  = p.community_id
left join dwellsy_prod.company_table c            on c.id   = p.company_id
left join dwellsy_prod.company_type_table ct      on ct.id  = c.company_type_id
left join dwellsy_prod.company_table pc           on pc.id  = c.parent_company_id
left join dwellsy_prod.company_type_table pct     on pct.id = pc.company_type_id
where p.msa_code = %(msa)s
```

- Every join after `l → p` is to-one: each target's `id` is its PRIMARY KEY, so
  nothing multiplies rows.
- **Do not** join `listing_amount_log_table`. `full_export_view2` and
  `full_export_view3` do, and that emits one row per price change, while the
  export has exactly one row per `listing_id` (12,935 unique).
- **Do not** join `organization_company_table` (see "Parent company" below).
- The joins are LEFT so the mapping is independent of population. Which rows to
  keep is Task 3's and Task 5's decision (see "Population filters").

## Mapping

| export column | source expression | status |
|---|---|---|
| uru_id | `p.uru_id` | VERIFIED: 1000/1000 (100.0%) |
| community_id | `p.community_id` | VERIFIED: 1000/1000 (100.0%) |
| address1_id | `p.address1_id` | VERIFIED: 1000/1000 (100.0%) |
| address_1 | `p.address_1` | VERIFIED: 1000/1000 (100.0%) |
| address_city | `p.address_city` | VERIFIED: 1000/1000 (100.0%) |
| address_type | `coalesce(aty.address_type, p.property_category)` via `a1.address_type_id → address_type_table` | VERIFIED: 1000/1000 (100.0%). Export values are only Apartment/House/Mobile (address_type ids 1–3). |
| bedrooms | `coalesce(a2.bedrooms::integer, a1.bedrooms::integer, p.bedrooms)` | VERIFIED: 1000/1000 (100.0%). `p.bedrooms` alone scores 98.2%. |
| rent_amount | `l.listing_amount` | VERIFIED: 999/1000 (99.9%). The one miss is a listing whose row was rewritten after the 09-08 pull. The view's `COALESCE(ll.listing_amount, l.listing_amount)` joins `ll` on `listing_id = 0`, a dead join, so it reduces to `l.listing_amount`. |
| amenities | [AMENITIES](#amenities) subquery | VERIFIED: 986/1000 exact string (98.6%), 987/1000 by count. 13 of the 14 misses have amenity rows written after the 09-08 pull. |
| photos | [PHOTOS](#photos) subquery (the pipeline needs only the count) | VERIFIED on the count the pipeline uses: 969/1000 (96.9%). Exact URL string: 928/1000 (92.8%). All misses are media changed after capture. |
| description | `l.listing_long_text` | VERIFIED: 996/1000 (99.6%). 1 miss was rewritten after the pull. 3 misses have DB text that is NULL while the export has text (open question 4). The view's `coalesce(listing_long_text, property_description)` scores only 83.8%. |
| creation_time | `to_char(l.creation_time at time zone 'America/Los_Angeles', 'YYYY-MM-DD HH24:MI:SS')` | VERIFIED: 1000/1000 (100.0%). UTC scores 0/1000 and America/Denver 0/1000. |
| deactivation_time | `to_char(l.deactivation_time at time zone 'America/Los_Angeles', 'YYYY-MM-DD HH24:MI:SS')` | VERIFIED: 992/1000 (99.2%). All 8 misses closed after the pull: blank in the export, now closed in the DB. UTC scores 15/1000, and those 15 are the still-open blanks. |
| msa_code | `p.msa_code` (bigint, so emit `::text`) | VERIFIED: 1000/1000. The sample match holds by construction because the query filters on it. The meaningful check is that all 12,935 export ids resolve under `p.msa_code = 14580`. |
| property_listing_status | `l.property_listing_status::text` | VERIFIED: 992/1000 (99.2%). The 8 misses were active at the pull and are inactive now. Enum labels: posting, pending_review, active, inactive, error, archived. The export holds only active and inactive. |
| top_down_community_count | `ac.count_top_down`, via `p.community_id → address_community_table` | VERIFIED: 1000/1000 (100.0%) |
| company_name | `coalesce(pc.company_name_displayed, c.company_name_displayed)` | VERIFIED: 1000/1000 on the sample and 12,935/12,935 on the whole export |
| child_company_id | `c.id` (= `p.company_id`, **not** `l.company_id`) | VERIFIED: 1000/1000 (100.0%) |
| child_company_type | `ct.type`, via `c.company_type_id → company_type_table` | VERIFIED: 1000/1000, and 12,935/12,935 on the whole export. The export's 35 blank values are exactly the rows where `ct.type` is NULL. |
| parent_company_id | `c.parent_company_id` (a self-reference into `company_table`, **not** an organization) | VERIFIED: 1000/1000, and 12,935/12,935 on the whole export |
| parent_company_name | `pc.company_name_displayed` | VERIFIED: 1000/1000, and 12,935/12,935 on the whole export |
| parent_company_type | `pct.type`, via `pc.company_type_id → company_type_table` | VERIFIED: 1000/1000, and 12,935/12,935 on the whole export |
| latitude | `coalesce(a1.ss_latitude, p.ss_latitude, p.latitude)` | VERIFIED: 1000/1000 (100.0%). `p.latitude` alone scores 17.6%. |
| longitude | `coalesce(a1.ss_longitude, p.ss_longitude, p.longitude)` | VERIFIED: 1000/1000 (100.0%). `p.longitude` alone scores 18.0%. |

### AMENITIES

```sql
(select string_agg(ad.amenity_name, '; ' order by ad.amenity_name)
   from (select distinct a.amenity_name
           from dwellsy_prod.property_amenity_table pa
           join dwellsy_prod.amenity_table a on a.id = pa.amenity_id
          where pa.property_id = p.id and a.amenity_name <> 'Other') ad) as amenities
```

- **Export string format:** distinct `amenity_table.amenity_name` values,
  sorted alphabetically, joined with `'; '`, with 'Other' excluded. Example:
  `Cats OK; Small Dogs OK`.
- **Grain:** the property (`pa.property_id = p.id`), not the listing. The
  parent property is not included.
- **Status filter:** none, following the view. No sampled property had a
  non-active `property_amenity_table` row, so filtering to active changes
  nothing in Bozeman.
- **`amenity_map_table` is not on the path.** It maps source names to
  `amenity_id` at ingest time.
- **How the pipeline uses it:** it counts non-blank `;`-separated parts
  (pipeline.py `amenities_n`). A count form is enough:
  `(select count(distinct a.amenity_name) ... same where ...)`. That form agreed
  987/1000.

### PHOTOS

```sql
(select string_agg(replace(mp.media_url,
            'https://s3-us-west-2.amazonaws.com/v2media.dwellsy.com/',
            'https://media.dwellsy.com/'), ';'
          order by case when mp.media_type = 'image' then 0 else 1 end, mp.id)
   from dwellsy_prod.property_media_table mp
  where mp.property_id = any(array[p.id, p.parent_property_id])
    and mp.property_media_status = 'active'
    and mp.media_type in ('image', 'floorplan')) as photos
```

- **Source:** `photos` is not a column on any base table. It comes from
  `property_media_table`: active `image` and `floorplan` media of the property
  and of its parent property.
- **Delimiter:** the export uses `;` with no space. The view uses `'; '`.
- **How the pipeline uses it:** pipeline.py only counts non-blank `;` parts
  (`photos_n`). marketing.py uses `photos_n` for the median, the zero-photo
  share, and completeness. It never reads the URLs. A count is therefore enough:
  `(select count(*) from dwellsy_prod.property_media_table mp where <same three predicates>) as photos_n`.
  The pipeline would then read an integer instead of splitting a string.
- **The 31 count misses are all capture drift.**
  - The DB has 183 photos the export lacks. 182 of them were created after the
    listing closed; the remaining one belongs to a still-active listing.
  - The export has 224 photos that are no longer active in the DB.
  - 41 rows have matching counts but different strings. 37 of them list
    different URLs (different media hashes), and 4 differ only in order.
- **Rejected:** a listing-time reconstruction that keeps media created at or
  before the listing closed agreed only 415/1000. Adding back media from
  `deleted_property_media_table` that was deleted after the close raised it only
  to 555/1000. Media `creation_time` is not a reliable capture time, so use
  current state.

## Timestamps (Task 5 depends on this)

- **Types:** `l.creation_time`, `l.deactivation_time` and `l.last_update_time`
  are all `timestamp with time zone`. The probe session's TimeZone is UTC.
- **Export format:** `YYYY-MM-DD HH24:MI:SS` with no offset. That is
  America/Los_Angeles wall-clock.
  - It agreed 1000/1000 on creation_time and 992/1000 on deactivation_time.
  - Converting to UTC agreed 0/1000.
  - The sample covers all 12 months, and the offsets differ by DST (8 h in
    December, 7 h in April). So this is a true zone conversion, not a fixed
    −08:00 offset.
  - This fits the data team running `to_char` in a Pacific session. Their views
    hard-code Pacific midnights such as `'2026-01-01 08:00:00+00'`.
- **Pipeline impact:** `pipeline.parse_dt` stamps these strings as UTC. Today's
  metrics therefore treat Pacific wall-clock as UTC, which is 7–8 h off.
  - For byte-parity with the export, Task 3 should emit the `at time zone
    'America/Los_Angeles'` form above.
  - Moving to true UTC would shift the T12 window edges, quarter buckets and
    per-home dates for listings near midnight. It would not change DOM, which is
    a difference of two values in the same zone. That choice belongs to Task 5.

## Parent company vs organization, and org multiplicity (Task 6)

- **The export's parent is a company, not an organization.**
  `parent_company_id = company_table.parent_company_id`, with name and type
  taken from that parent `company_table` row. This agrees on 12,935/12,935 rows.
- **The organization hypothesis is refuted.** Of the 10,554 export rows that
  have a parent, 0 have a `parent_company_id` equal to any organization id of
  the child company.
- **The vocabularies differ.** `organization_table.org_type` holds
  `sole_operator` and `company`. The export's `parent_company_type` holds
  Property Manager, Brokerage and Owner, which is the `company_type_table`
  vocabulary.
- **Multiplicity (observed 2026-09-26):**
  - Bozeman: of the 712 companies that own Bozeman properties, 695 map to
    exactly 1 organization, 17 map to none, and 0 map to more than one. Of the
    433 export child companies, 423 map to 1 and 10 to none.
  - Global: 0 of the 600,292 companies in `organization_company_table` have more
    than one organization.
  - The schema still allows many-to-many (UNIQUE is only on
    `(organization_id, company_id)`), and the skill says to treat it as M:N.
    Task 6 should guard against multiplicity even though none exists today.

## Population filters (context for Task 3 and Task 5; not field logic)

`full_export_view`'s WHERE clause, measured against the export's rows:

- **Every export row passes these view filters:**
  - lifecycle: active and not closed, or inactive with a lifetime over 4 h
  - `p.ss_raw_dpv_match_code = 'Y'`
  - the `a1` 'D' dpv rule
  - `p.is_room = 0`
  - company `active`
  - not blacklisted, unless whitelisted
  - `property_category <> 'Waitlist'`
  - rent between `greatest(bedrooms, 1) * 250` and `20000`
  - `creation_time` before the pull
- **Nearly every export row passes these two:**
  - `a1.address_type_id in (1, 2, 3)`: 0.9999
  - `p.uru_id is not null`: 0.9997. The export has 4 blank `uru_id` values.
- **Only 78.2% of export rows pass the apartment-only clause**, so the export
  did not apply it.
- Of the 21,863 Bozeman listings in the DB, 18,670 pass all of the above except
  the apartment clause. 12,930 of those are in the export. The 5,740 left over
  are open question 3.

## Notes for Task 3 on output shape

The pipeline reads CSV strings through `row.get(...)`. It treats `''` and
`'null'` as missing, and it compares `msa_code` to a string.

- Emit `msa_code` and the id columns as text.
- NULL can arrive as `''` or `None`. The consumers either guard with
  `or ""` or go through `safe_int`, `safe_float` or `parse_dt`, all of which
  return None on None or `''`. `uru_id`, `community_id` and `address1_id` are
  only truth-tested.
- `rent_amount`, `latitude`, `longitude`, `bedrooms` and
  `top_down_community_count` are parsed with `safe_float` / `safe_int`, so
  numeric text is fine.
