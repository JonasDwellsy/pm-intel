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

from marketing import compute_marketing


def _median_rounded(values, ndigits):
    """statistics.median rounded to ndigits, or None for an empty list."""
    if not values:
        return None
    return round(statistics.median(values), ndigits)


def _build_record(kind, bucket):
    dom = bucket.get("dom") or []
    rent_t12 = bucket.get("rent_t12") or []
    rent_prior = bucket.get("rent_prior") or []
    n_listings = bucket.get("n_listings", 0)
    concession_hits = bucket.get("concession_hits", 0)
    marketing_listings = bucket.get("marketing") or []

    median_dom_t12 = _median_rounded(dom, 1)
    median_rent_t12 = round(statistics.median(rent_t12)) if rent_t12 else None

    rent_yoy = None
    if rent_t12 and rent_prior:
        median_prior = statistics.median(rent_prior)
        if median_prior:
            rent_yoy = round((statistics.median(rent_t12) - median_prior) / median_prior, 3)

    concession_rate = round(concession_hits / n_listings, 3) if n_listings else None

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
