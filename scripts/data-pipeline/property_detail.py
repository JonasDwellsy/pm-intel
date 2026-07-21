"""Pure per-property detail builder for the operator property-level detail
feature (Phase 1, Task 1).

Turns per-operator listing buckets — one per MF community, one per SFR
submarket rollup — into the `propertyDetail` records the pipeline emits per
operator. Deliberately observation-only: NO per-property score, star, or
percentile-rank field. Property-level rank/scoring would let a client infer
individual-listing performance from a handful of units, which this feature
must not expose (see the existing scorecard rank-leak guardrail). A later
audit greps this module for those field names, so don't add them.

Pure module by design: no I/O, no file reads, no DB access, so it can be
unit-tested in isolation and reused wherever pipeline.py assembles per-market
JSON. Mirrors the marketing.py / tenancy_survival.py extraction pattern.

Input bucket shape (built by the caller, pipeline.py):
    communities: dict[community_id] -> {
        "label": str, "units": int | None, "submarket": str | None,
        "dom": [float, ...], "rent_t12": [float, ...], "rent_prior": [float, ...],
        "concession_hits": int, "n_listings": int,
        "marketing": [<per-listing marketing dict>, ...],
    }
    sfr_by_submarket: dict[submarket_slug] -> same shape, minus "units",
        plus "homes": int (and "label" is the submarket display name).

`comps` are MSA medians computed by the caller (already rounded); this module
passes them through unchanged in the returned dict.
"""

import statistics
from collections import Counter

from marketing import compute_marketing


def _median_or_none(values, ndigits=None):
    """statistics.median rounded to ndigits, or None for an empty list.

    ndigits=None (the default) matches plain `round(x)` — an int result —
    which is what a whole-dollar median needs; pass an int ndigits (e.g. 1
    for medianDomT12) for a fractional round.
    """
    if not values:
        return None
    return round(statistics.median(values), ndigits)


def _rent_yoy(t12, prior):
    """(median(t12) - median(prior)) / median(prior), rounded to 3dp, or
    None when either list is empty or the prior median is zero (div-by-zero
    guard). Shared by `_build_record` and `compute_market_comps` so the
    guard logic can't drift between the two callers.
    """
    if not t12 or not prior:
        return None
    median_prior = statistics.median(prior)
    if not median_prior:
        return None
    return round((statistics.median(t12) - median_prior) / median_prior, 3)


def _rate(hits, n):
    """hits / n rounded to 3dp, or None when n is 0 (div-by-zero guard)."""
    return round(hits / n, 3) if n else None


def _build_record(kind, bucket):
    dom = bucket.get("dom") or []
    rent_t12 = bucket.get("rent_t12") or []
    rent_prior = bucket.get("rent_prior") or []
    n_listings = bucket.get("n_listings", 0)
    concession_hits = bucket.get("concession_hits", 0)
    marketing_listings = bucket.get("marketing") or []

    median_dom_t12 = _median_or_none(dom, 1)
    median_rent_t12 = _median_or_none(rent_t12)
    rent_yoy = _rent_yoy(rent_t12, rent_prior)
    concession_rate = _rate(concession_hits, n_listings)

    listing_quality = None
    if marketing_listings:
        listing_quality = compute_marketing({"marketing_listings_t12": marketing_listings})["compositeScore"]

    return {
        "kind": kind,
        "label": bucket.get("label"),
        "submarket": bucket.get("submarket"),
        # "units" (MF) is only present on community buckets; "homes" (SFR)
        # only on submarket-rollup buckets. Pulling both via .get naturally
        # yields None on the side that doesn't apply for this record's kind.
        "units": bucket.get("units"),
        "homes": bucket.get("homes"),
        "nListings": n_listings,
        "medianDomT12": median_dom_t12,
        "medianRentT12": median_rent_t12,
        "rentYoY": rent_yoy,
        "concessionRate": concession_rate,
        "listingQuality": listing_quality,
    }


def build_property_detail(communities, sfr_by_submarket, comps):
    """Build the propertyDetail dict for one operator.

    Args:
        communities: dict[community_id] -> bucket (see module docstring).
        sfr_by_submarket: dict[submarket_slug] -> bucket (see module docstring).
        comps: MSA-median comparison dict, passed through unchanged.

    Returns:
        {"properties": [...], "comps": comps}, sorted by nListings desc then
        label asc, or None when there are zero property records.
    """
    properties = [_build_record("community", bucket) for bucket in communities.values()]
    properties.extend(_build_record("sfr-submarket", bucket) for bucket in sfr_by_submarket.values())

    if not properties:
        return None

    properties.sort(key=lambda p: (-p["nListings"], p["label"]))
    return {"properties": properties, "comps": comps}


def compute_market_comps(dom_values, rent_t12_values, rent_prior_values, concession_hits, n_listings):
    """MSA-median comps for one market (Task 2).

    Computed from raw per-listing T12 values pooled across every operator in
    the market (the caller decides which population — see pipeline.py's
    reuse notes), using the SAME rounding + guard rules as `_build_record`'s
    per-property comps, so a propertyDetail record's own stats are directly
    comparable to the `comps` block returned here.

    Args:
        dom_values: list of raw T12 days-on-market values (unrounded).
        rent_t12_values: list of raw T12 rent amounts.
        rent_prior_values: list of raw prior-year (T24-T12) rent amounts.
        concession_hits: total T12 concession-matching listing count.
        n_listings: total T12 listing count (concessionRate denominator).

    Returns:
        {"medianDomT12", "medianRentT12", "rentYoY", "concessionRate"}.
    """
    median_dom_t12 = _median_or_none(dom_values, 1)
    median_rent_t12 = _median_or_none(rent_t12_values)
    rent_yoy = _rent_yoy(rent_t12_values, rent_prior_values)
    concession_rate = _rate(concession_hits, n_listings)

    return {
        "medianDomT12": median_dom_t12,
        "medianRentT12": median_rent_t12,
        "rentYoY": rent_yoy,
        "concessionRate": concession_rate,
    }


def _blank_sfr_bucket(label, submarket):
    return {"label": label, "submarket": submarket, "dom": [], "rent_t12": [],
            "rent_prior": [], "concession_hits": 0, "n_listings": 0,
            "marketing": [], "homes": 0}


def assemble_property_detail(comm_buckets, comm_urus_counts, comm_tdc, sfr_buckets, comps, min_concentrated=10):
    """Split an operator's community buckets into concentrated-MF vs
    scattered-SFR, then delegate to `build_property_detail` (Task 2).

    This is where the concentrated-vs-scattered decision lives — kept here
    (pure, unit-tested) rather than in pipeline.py, which cannot be run
    end-to-end in this environment.

    Args:
        comm_buckets: dict[community_id] -> bucket (see module docstring),
            PLUS an integer "homes" (distinct address count) — used only
            when a community folds into an SFR submarket below; dropped
            from any community that stays its own record (community
            records are sized by "units", not "homes").
        comm_urus_counts: dict[community_id] -> int T12 URU count for that
            community (the pipeline's `len(comm_urus_t12[cid])`). Decides
            concentrated (>= min_concentrated) vs scattered, mirroring the
            same >=10 threshold pipeline.py already uses to classify
            concentrated communities elsewhere. This is an OBSERVED count —
            it decides the concentration boundary only; it is NOT what gets
            displayed as `units` (see comm_tdc below).
        comm_tdc: dict[community_id] -> int declared top-down community size
            (the pipeline's `comm_tdc`, sourced from top_down_community_count
            in the raw listing data). A concentrated community's `units`
            field is this DECLARED size, not the observed URU count — the
            two can differ meaningfully (a large community can have well
            under `min_concentrated` T12 URUs turn over and still be a
            1,000-unit property). `.get(cid)` naturally yields None when the
            source had no declared count for that community; that's a valid
            "unknown declared size" result, not an error.
        sfr_buckets: dict[submarket_slug] -> bucket (see module docstring),
            the pipeline's existing scattered-SFR rollups.
        comps: MSA-median comps dict, passed through unchanged.
        min_concentrated: URU threshold for "this community counts as a
            concentrated MF holding" (default 10, matching pipeline.py).

    Returns:
        build_property_detail(...) result, or None when there's nothing to
        show (mirrors build_property_detail's empty-input behavior).
    """
    concentrated = {}
    merged_sfr = {sub: dict(bucket) for sub, bucket in sfr_buckets.items()}

    for cid, bucket in comm_buckets.items():
        urus = comm_urus_counts.get(cid, 0)
        if urus >= min_concentrated:
            record = {k: v for k, v in bucket.items() if k != "homes"}
            # units = the DECLARED community size (top_down_community_count),
            # NOT the observed URU count used above for the concentration
            # decision. May be None when the source has no declared count.
            record["units"] = comm_tdc.get(cid)
            concentrated[cid] = record
            continue

        # Below the concentration threshold: fold this community's listing
        # values into the SFR submarket rollup it belongs to, so its
        # listings still count toward the operator's scattered-site stats
        # instead of vanishing.
        sub = bucket.get("submarket") or "unknown"
        target = merged_sfr.setdefault(sub, _blank_sfr_bucket(bucket.get("label") or sub, sub))
        target["dom"] = list(target.get("dom") or []) + list(bucket.get("dom") or [])
        target["rent_t12"] = list(target.get("rent_t12") or []) + list(bucket.get("rent_t12") or [])
        target["rent_prior"] = list(target.get("rent_prior") or []) + list(bucket.get("rent_prior") or [])
        target["concession_hits"] = target.get("concession_hits", 0) + bucket.get("concession_hits", 0)
        target["n_listings"] = target.get("n_listings", 0) + bucket.get("n_listings", 0)
        target["marketing"] = list(target.get("marketing") or []) + list(bucket.get("marketing") or [])
        target["homes"] = (target.get("homes") or 0) + (bucket.get("homes") or 0)

    return build_property_detail(concentrated, merged_sfr, comps)


def build_home_records(home_recs, concentrated_cids=None, submarket_by_cid=None):
    """Per-home aggregation for Phase 2 individual-home export. Pure.

    home_recs: dict[address_id] -> accumulator with keys:
      address:str, cid:str|None, submarket:str|None, lat:float|None,
      lng:float|None, brs:list[int], rents:list[float], doms:list[int],
      dates:list[str], concession:bool, n:int

    In the source data EVERY listing carries a community_id — scattered
    single-family homes are micro-communities (often of 1), real MF holdings
    are communities with many T12 units. The Homes export is SCATTERED-SFR
    ONLY, so `home_recs` is keyed across all listings during streaming and the
    concentrated MF communities are dropped HERE, mirroring the same
    concentrated/scattered split `assemble_property_detail` makes:

      concentrated_cids: set of community_ids that qualify as concentrated MF
        (>= the URU threshold). A home whose `cid` is in this set is excluded.
        A home with no cid, or a cid below the threshold, is a scattered home
        and is kept. Defaults to none-excluded.
      submarket_by_cid: {community_id -> submarket slug}, the pipeline's
        `comm_submarket`. A home's submarket is resolved from its community
        (matching the Phase 1 rollup), falling back to the accumulator's own
        `submarket` (the rare true-no-cid SFR bucket). Defaults to empty.

    Returns one record per scattered home, sorted by address, un-scored.
    """
    concentrated_cids = concentrated_cids or set()
    submarket_by_cid = submarket_by_cid or {}

    def _median_int(xs):
        return round(statistics.median(xs)) if xs else None

    def _modal_int(xs):
        return Counter(xs).most_common(1)[0][0] if xs else None

    out = []
    for aid, a in home_recs.items():
        cid = a.get("cid")
        if cid is not None and cid in concentrated_cids:
            continue  # concentrated MF community — not a scattered SFR home
        out.append({
            "addressId": aid,
            "address": a.get("address") or "",
            "submarket": submarket_by_cid.get(cid) or a.get("submarket"),
            "latitude": a.get("lat"),
            "longitude": a.get("lng"),
            "bedrooms": _modal_int(a.get("brs") or []),
            "medianRentT12": _median_int(a.get("rents") or []),
            "domT12": _median_int(a.get("doms") or []),
            "lastListedDate": max(a["dates"]) if a.get("dates") else None,
            "nListings": a.get("n") or 0,
            "concession": bool(a.get("concession")),
        })
    out.sort(key=lambda r: (r["address"] or "").lower())
    return out
