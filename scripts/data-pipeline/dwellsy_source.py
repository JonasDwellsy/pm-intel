"""Read one market's listing history from the Dwellsy database.

Yields dicts keyed exactly like the CSV export's rows, so pipeline.py's row
handling is unchanged (that swap is Task 7's job, not this module's). See
field_mapping.md for the column derivation and its verification status. The
population filter's translation from dwellsy_prod.full_export_view is
explained inline in the WHERE_SQL comments below.

Task 3 scope: pass-through fields only. Task 4 added amenities, photos and
address_type, originally as two correlated subqueries per listing row (one
execution of both per output row). That was correct (98-99.7% export
agreement) but did not scale: Kansas City went from 10.8s to 232.9s because
the subqueries re-scan property_amenity_table/property_media_table once per
listing, and many listings share a property.

Fix round 1 replaced the correlated subqueries with a three-phase batched
design that computes each property's amenities/photos ONCE, not once per
listing that shares it:
  1. `_collect_property_ids` streams `select distinct p.id,
     p.parent_property_id` over the SAME base FROM/WHERE the listing reader
     uses (reusing BASE_FROM/WHERE_SQL verbatim, so the property population
     can't drift from the listing population), and collects every p.id plus
     every non-null p.parent_property_id (PHOTOS unions media from both).
  2. `_batched_lookups` looks those ids up in chunks of LOOKUP_CHUNK via
     dwellsy_db.query() (not stream() -- each chunk is its own bounded
     statement): one grouped query for amenities-by-property, one for
     active-media-ids-by-property.
  3. `market_listings` streams the listing rows with the two subqueries
     removed (p.id/p.parent_property_id carried as internal columns
     instead) and attaches amenities/photos from the two lookup dicts built
     in step 2, via `_attach_amenities_and_photos`.
See field_mapping.md's AMENITIES/PHOTOS sections for the semantics being
preserved; test_batched_lookup_equals_correlated_form pins this design
against the original per-row correlated-subquery expressions.

Fix round 2: phase 1 and phase 2 each run in their own transaction against a
live database, so a property that appears in phase 3's listing stream but
was absent from phase 1's set (e.g. created between the two phases, or a
parent property that was) would otherwise fall through the lookup dicts'
`.get(id, "")` to an empty string -- indistinguishable from a real empty.
`_attach_amenities_and_photos` guards against this: it tracks which property
ids phase 2 actually looked up, and for any row referencing an id outside
that set, looks it up on demand (via the same chunked lookup function,
injectable for testing) and folds the result into the shared dicts so later
rows sharing the property benefit too. The count of such late lookups is
exposed on the module-level `LAST_RUN_STATS` dict, reset at the start of
each `market_listings` call, so a caller can confirm it stayed at 0 (or
near it) on a real run. Values that CHANGED between phases for a property
phase 2 already looked up are accepted as current-state skew against a live
database and are not handled -- only properties phase 2 never saw at all
are.

- company_name, child_company_id, child_company_type, parent_company_id,
  parent_company_name, parent_company_type (operator identity) arrive in
  Task 6. `company_id` (the join key Task 6 needs) and `listing_id` (the key
  Task 5 reconciles on) are emitted here.
"""
from typing import Iterator

import dwellsy_db

# Base FROM clause, verbatim from field_mapping.md ("Base FROM clause (paste
# into Task 3)"). Every join after l -> p is to-one (each target's `id` is its
# PRIMARY KEY), so nothing here multiplies rows. Do not join
# listing_amount_log_table (one row per price change) or
# organization_company_table (see field_mapping.md, "Parent company vs
# organization"). Tasks 4 and 6 add SELECT columns against this same FROM;
# they do not need new joins. Also reused verbatim by PROPERTY_SET_SQL below
# so the property population can never drift from the listing population.
BASE_FROM = """
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
"""

# Population filter, translated from `pg_get_viewdef('dwellsy_prod.full_export_view')`
# (read 2026-09-26). Every predicate below is kept in the same meaning as the
# view's WHERE clause, with three deliberate omissions (Jonas, 2026-09-26):
#   - the apartment-only clause
#     `a2.address_type_id = 1 OR (a1.address_type_id = 1 AND a2.address_type_id IS NULL)`
#     -- the export includes houses, so this would wrongly drop them.
#   - the hard-coded deactivation/creation date window
#     (`deactivation_time > '2026-01-01 08:00:00+00' OR deactivation_time IS NULL`,
#     `creation_time > ('2026-01-01' - 120)`, `creation_time < '2026-09-01 07:00:00+00'`)
#     -- a fixed pull-date window, meaningless for a live read.
#
# Kept as an ordered list of (name, sql) pairs -- rather than one opaque WHERE
# string -- so Task 5's reconciliation gate can run each predicate on its own
# as a boolean column (`coalesce((<sql>), false) as <name>`) against the
# UNFILTERED base join, to classify exactly which predicate(s) excluded an
# export-only row. WHERE_SQL below is generated from this list and is
# semantically identical to the flat form it replaces: wrapping each
# predicate in parens and joining with `and` does not change SQL boolean
# evaluation (AND is associative/commutative), so no dwellsy_source test
# needed to change for this refactor. Each predicate's explanatory comment
# is kept next to it, unchanged from the original.
POPULATION_PREDICATES: list[tuple[str, str]] = [
    ("market", "p.msa_code = %(msa_code)s"),
    (
        # lifecycle: active and still open, or inactive with a lifetime over
        # 4h (excludes listings that opened and closed within 4 hours --
        # noise)
        "lifecycle",
        """
        (l.property_listing_status = 'active' and l.deactivation_time is null)
     or (l.property_listing_status = 'inactive'
         and (l.creation_time + interval '4 hours') < l.deactivation_time)
        """,
    ),
    (
        # allowed address types only: apartment(1) / house(2) / mobile(3)
        "address_type",
        "a1.address_type_id in (1, 2, 3)",
    ),
    (
        # USPS DPV match on the property's own address
        # (excludes addresses the postal service could not confirm)
        "dpv_match",
        "p.ss_raw_dpv_match_code = 'Y'",
    ),
    (
        # a1 'D' dpv rule: a building-level-only match ('D') is acceptable
        # only when a secondary (unit) address exists to disambiguate it
        # (excludes building-level-only matches with no unit on file)
        "dpv_d_rule",
        """
        (a1.ss_raw_dpv_match_code = 'D' and p.address2_id is not null)
     or (a1.ss_raw_dpv_match_code <> 'D')
        """,
    ),
    (
        # exclude single-room listings (rooms, not units)
        "not_room",
        "p.is_room = 0",
    ),
    (
        # must resolve to a canonical rental unit (URU)
        "has_uru",
        "p.uru_id is not null",
    ),
    (
        # managing company must be active
        "company_active",
        "c.company_status = 'active'",
    ),
    (
        # exclude blacklisted companies unless explicitly whitelisted
        "not_blacklisted",
        "(c.blacklist_status is null or c.is_whitelisted)",
    ),
    (
        # exclude waitlist-only postings (not a real listing)
        "not_waitlist",
        "p.property_category <> 'Waitlist'",
    ),
    (
        # plausible rent band: at least $250 per bedroom (minimum 1), at most
        # $20,000 (excludes data-entry noise at both ends)
        "rent_band",
        """
        l.listing_amount >= greatest(p.bedrooms, 1) * 250
    and l.listing_amount <= 20000
        """,
    ),
]

WHERE_SQL = "where " + "\n  and ".join(
    f"({sql.strip()})" for _, sql in POPULATION_PREDICATES
)

# Phase 1 (see module docstring): every property the listing population
# touches, streamed once per market. `distinct` collapses the many listings
# that share a property; Python then dedupes further when parent ids are
# folded in (see _collect_property_ids).
PROPERTY_SET_SQL = (
    """
select distinct p.id, p.parent_property_id
"""
    + BASE_FROM
    + WHERE_SQL
)

# Phase 2 (see module docstring): chunked, grouped lookups replacing Task 4's
# per-row correlated subqueries. Semantics preserved verbatim from
# field_mapping.md's AMENITIES/PHOTOS sections; see
# test_batched_lookup_equals_correlated_form for the pinning test.
LOOKUP_CHUNK = 2000

# Same predicate/dedupe/order/join-delimiter as field_mapping.md's AMENITIES
# subquery, just grouped by property_id instead of correlated per-row.
# `string_agg(DISTINCT ...)` is Postgres-legal here because the only ORDER BY
# expression (a.amenity_name) matches the DISTINCT target.
AMENITIES_SQL = """
select pa.property_id,
       string_agg(distinct a.amenity_name, '; ' order by a.amenity_name)
                                         as amenities
  from dwellsy_prod.property_amenity_table pa
  join dwellsy_prod.amenity_table a       on a.id = pa.amenity_id
 where pa.property_id = any(%(ids)s::bigint[])
   and a.amenity_name <> 'Other'
 group by pa.property_id
"""

# photo media ids, not URLs; the pipeline only counts them; see
# field_mapping.md PHOTOS for the URL form
#
# Same predicates as field_mapping.md's PHOTOS subquery (active image/
# floorplan media), one row per media id instead of a pre-joined string --
# the Python merge in _merge_photo_ids does the p.id/parent_property_id
# union that the original `= any(array[p.id, p.parent_property_id])` did
# inside the correlated subquery.
MEDIA_SQL = """
select mp.property_id, mp.id
  from dwellsy_prod.property_media_table mp
 where mp.property_id = any(%(ids)s::bigint[])
   and mp.property_media_status = 'active'
   and mp.media_type in ('image', 'floorplan')
"""

BASE_SQL = (
    """
select
    l.id::text                          as listing_id,
    p.uru_id::text                      as uru_id,
    p.community_id::text                as community_id,
    p.address1_id::text                 as address1_id,
    p.address_1                         as address_1,
    p.address_city                      as address_city,
    coalesce(a2.bedrooms::integer, a1.bedrooms::integer, p.bedrooms)
                                         as bedrooms,
    coalesce(a1.ss_latitude, p.ss_latitude, p.latitude)
                                         as latitude,
    coalesce(a1.ss_longitude, p.ss_longitude, p.longitude)
                                         as longitude,
    p.msa_code::text                    as msa_code,
    p.company_id::text                  as company_id,
    l.listing_amount                    as rent_amount,
    l.listing_long_text                 as description,
    to_char(l.creation_time at time zone 'America/Los_Angeles',
             'YYYY-MM-DD HH24:MI:SS')   as creation_time,
    to_char(l.deactivation_time at time zone 'America/Los_Angeles',
             'YYYY-MM-DD HH24:MI:SS')   as deactivation_time,
    l.property_listing_status::text     as property_listing_status,
    ac.count_top_down                   as top_down_community_count,
    coalesce(aty.address_type, p.property_category)
                                         as address_type,
    -- internal only: consumed by market_listings to attach amenities/photos
    -- from the Phase 2 lookup dicts, then popped before the row is yielded.
    p.id                                 as _property_id,
    p.parent_property_id                 as _parent_property_id
"""
    + BASE_FROM
    + WHERE_SQL
)


# Reset at the start of every market_listings call; see the module
# docstring's "Fix round 2" paragraph. Kept as a plain dict (no logging
# framework) so a caller can just read LAST_RUN_STATS["late_lookups"]
# after exhausting the generator.
LAST_RUN_STATS: dict[str, int] = {}


def market_listings(msa_code: str, as_of: str | None = None) -> Iterator[dict]:
    """One market's full listing history, newest-agnostic (the caller windows).

    `as_of` is accepted for parity with pipeline.py's --as-of but does NOT
    filter here: the pipeline computes its own T12 window from row timestamps,
    and filtering twice would silently change metric semantics.
    """
    LAST_RUN_STATS.clear()
    LAST_RUN_STATS["late_lookups"] = 0
    property_ids = _collect_property_ids(msa_code)
    looked_up_ids = set(property_ids)
    amenities_by_property, media_by_property = _batched_lookups(property_ids)
    for row in dwellsy_db.stream(BASE_SQL, {"msa_code": msa_code}):
        row = _attach_amenities_and_photos(
            row, amenities_by_property, media_by_property, looked_up_ids
        )
        yield _stringify(row)


def _collect_property_ids(msa_code: str) -> list[int]:
    """Phase 1: every property id the listing population touches (p.id plus
    each non-null p.parent_property_id), streamed so memory stays bounded
    even though the result is fully materialized into a set."""
    ids: set[int] = set()
    for row in dwellsy_db.stream(PROPERTY_SET_SQL, {"msa_code": msa_code}):
        ids.add(row["id"])
        if row["parent_property_id"] is not None:
            ids.add(row["parent_property_id"])
    return sorted(ids)


def _batched_lookups(
    property_ids: list[int],
) -> tuple[dict[int, str], dict[int, list[int]]]:
    """Phase 2: chunked dwellsy_db.query() lookups (one bounded statement per
    chunk per table) building property_id -> amenities string and
    property_id -> [active media id, ...]."""
    amenities_by_property: dict[int, str] = {}
    media_by_property: dict[int, list[int]] = {}
    for chunk in _chunked(property_ids, LOOKUP_CHUNK):
        for row in dwellsy_db.query(AMENITIES_SQL, {"ids": chunk}):
            amenities_by_property[row["property_id"]] = row["amenities"]
        for row in dwellsy_db.query(MEDIA_SQL, {"ids": chunk}):
            media_by_property.setdefault(row["property_id"], []).append(row["id"])
    return amenities_by_property, media_by_property


def _chunked(seq: list[int], size: int) -> Iterator[list[int]]:
    for i in range(0, len(seq), size):
        yield seq[i : i + size]


def _attach_amenities_and_photos(
    row: dict,
    amenities_by_property: dict[int, str],
    media_by_property: dict[int, list[int]],
    looked_up_ids: set[int],
    lookup_fn=_batched_lookups,
) -> dict:
    """Phase 3 (see module docstring): pop the internal `_property_id`/
    `_parent_property_id` columns off `row` and attach amenities/photos from
    the two lookup dicts phase 2 built, mutating them (and `looked_up_ids`,
    and LAST_RUN_STATS) in place for any property phase 2 didn't already
    cover -- see the module docstring's "Fix round 2" paragraph for why that
    can happen against a live database.

    `lookup_fn` defaults to the real `_batched_lookups` but is injectable so
    the late-lookup path can be unit tested without a database connection
    (see AttachAmenitiesAndPhotos in test_dwellsy_source.py).
    """
    property_id = row.pop("_property_id")
    parent_property_id = row.pop("_parent_property_id")

    missing_ids = [
        pid
        for pid in (property_id, parent_property_id)
        if pid is not None and pid not in looked_up_ids
    ]
    if missing_ids:
        late_amenities, late_media = lookup_fn(missing_ids)
        amenities_by_property.update(late_amenities)
        media_by_property.update(late_media)
        looked_up_ids.update(missing_ids)
        LAST_RUN_STATS["late_lookups"] = (
            LAST_RUN_STATS.get("late_lookups", 0) + len(missing_ids)
        )

    row["amenities"] = amenities_by_property.get(property_id, "")
    own_media = media_by_property.get(property_id, [])
    parent_media = (
        media_by_property.get(parent_property_id, [])
        if parent_property_id is not None
        else []
    )
    row["photos"] = _merge_photo_ids(own_media, parent_media)
    row["property_id"] = str(property_id)
    return row


def _merge_photo_ids(own_ids: list[int], parent_ids: list[int]) -> str:
    """Union of active-media ids belonging to a property and its parent
    property, sorted numerically and ';'-joined -- identical in result to
    Task 4's `mp.property_id = any(array[p.id, p.parent_property_id])`
    expression (a media row belongs to exactly one property_id, so there is
    no cross-property duplicate in practice; the set-union below is a pure
    safety net, not something the live data is expected to exercise)."""
    merged = sorted(set(own_ids) | set(parent_ids))
    return ";".join(str(i) for i in merged)


def _stringify(row: dict) -> dict:
    """csv.DictReader yields strings; match that so downstream parsing is
    unchanged. None becomes '' exactly as an empty CSV cell does."""
    out = {}
    for key, value in row.items():
        out[key] = "" if value is None else str(value)
    return out
