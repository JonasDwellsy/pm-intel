"""Read one market's listing history from the Dwellsy database.

Yields dicts keyed exactly like the CSV export's rows, so pipeline.py's row
handling is unchanged (that swap is Task 7's job, not this module's). See
field_mapping.md for the column derivation and its verification status. The
population filter's translation from dwellsy_prod.full_export_view is
explained inline in the WHERE_SQL comments below.

Task 3 scope: pass-through fields only.
- amenities, photos, address_type arrive in Task 4.
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
# they do not need new joins.
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
# One predicate per line, each tagged with what it excludes.
WHERE_SQL = """
where p.msa_code = %(msa_code)s
  -- lifecycle: active and still open, or inactive with a lifetime over 4h
  -- (excludes listings that opened and closed within 4 hours -- noise)
  and (
        (l.property_listing_status = 'active' and l.deactivation_time is null)
     or (l.property_listing_status = 'inactive'
         and (l.creation_time + interval '4 hours') < l.deactivation_time)
      )
  -- allowed address types only: apartment(1) / house(2) / mobile(3)
  and a1.address_type_id in (1, 2, 3)
  -- USPS DPV match on the property's own address
  -- (excludes addresses the postal service could not confirm)
  and p.ss_raw_dpv_match_code = 'Y'
  -- a1 'D' dpv rule: a building-level-only match ('D') is acceptable only
  -- when a secondary (unit) address exists to disambiguate it
  -- (excludes building-level-only matches with no unit on file)
  and (
        (a1.ss_raw_dpv_match_code = 'D' and p.address2_id is not null)
     or (a1.ss_raw_dpv_match_code <> 'D')
      )
  -- exclude single-room listings (rooms, not units)
  and p.is_room = 0
  -- must resolve to a canonical rental unit (URU)
  and p.uru_id is not null
  -- managing company must be active
  and c.company_status = 'active'
  -- exclude blacklisted companies unless explicitly whitelisted
  and (c.blacklist_status is null or c.is_whitelisted)
  -- exclude waitlist-only postings (not a real listing)
  and p.property_category <> 'Waitlist'
  -- plausible rent band: at least $250 per bedroom (minimum 1), at most $20,000
  -- (excludes data-entry noise at both ends)
  and l.listing_amount >= greatest(p.bedrooms, 1) * 250
  and l.listing_amount <= 20000
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
    ac.count_top_down                   as top_down_community_count
"""
    + BASE_FROM
    + WHERE_SQL
)


def market_listings(msa_code: str, as_of: str | None = None) -> Iterator[dict]:
    """One market's full listing history, newest-agnostic (the caller windows).

    `as_of` is accepted for parity with pipeline.py's --as-of but does NOT
    filter here: the pipeline computes its own T12 window from row timestamps,
    and filtering twice would silently change metric semantics.
    """
    for row in dwellsy_db.stream(BASE_SQL, {"msa_code": msa_code}):
        yield _stringify(row)


def _stringify(row: dict) -> dict:
    """csv.DictReader yields strings; match that so downstream parsing is
    unchanged. None becomes '' exactly as an empty CSV cell does."""
    out = {}
    for key, value in row.items():
        out[key] = "" if value is None else str(value)
    return out
