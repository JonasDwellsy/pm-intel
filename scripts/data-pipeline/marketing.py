"""Marketing-discipline composite for the per-market pipeline.

Extracted from pipeline.py so it can be imported and unit-tested in isolation
(pipeline.py parses argv at module load, which makes it unimportable in a
test). Mirrors the tenancy_survival / operator_grouping module pattern.

Calibration — "Sharp" (p90-anchored) profile
--------------------------------------------
The composite blends four listing-quality signals. Each *richness* sub-score
saturates near the top of the real cross-market distribution, so the top
decile earns 100 and everyone else spreads across the range. The prior
calibration saturated in the *middle* of the distribution (description at 500
chars when the median operator writes ~700, amenities at 10 when the median is
9), which pegged ~16% of operators at exactly 100 and hollowed out the metric.

Photo depth is a scored sub-metric here for the first time — per-listing photo
counts became reliable once the ';'-delimited source field was parsed
correctly, so median photos/listing is now a real signal rather than a
constant 1.

    composite = 0.35*completeness + 0.20*amenities + 0.20*description
              + 0.25*photos
      completeness: % of listings that have a description AND photos AND
                    amenities (the hygiene floor)
      amenities:   min(100, 100 * mean_amenities_per_listing / 18)
      description: 0.5*length + 0.5*richness (see below)
      photos:      min(100, 100 * median_photos_per_listing  / 30)

Description sub-score — length + content richness (v0.9)
--------------------------------------------------------
Raw character count (the prior proxy) had two weaknesses an 800K-listing
LA+Seattle audit surfaced: (1) a hollow top — the 1,200-char cap sat at ~p80,
pegging 14-16% of operators at exactly 100; and (2) it rewarded non-marketing
filler — a long fee schedule scored like premium prose. The feared failure
("length rewards copy-pasted blobs") did NOT hold: length anti-correlates with
duplication (longer descriptions are MORE unique). So the fix is not to punish
length but to blend it with a content signal:

    description = 0.5 * length_component + 0.5 * richness_component
      length_component:   min(100, 100 * mean_distinct_words / 195)   # ≈ cross-market p90
      richness_component: 100 * min(1, mean_content_categories / 6)

`length_component` uses distinct words rather than chars — collinear with chars
(r≈0.98, so ranking is preserved) but robust to whitespace/HTML padding.
`richness_component` counts how many of 7 content categories (amenities,
location, transit, parking, pet, fees, lease) the prose touches — a fee
schedule can't win it on verbosity. Both means are taken over NON-BLANK
descriptions; blank descriptions are already penalized by `completeness`, so
counting them as 0 here too would double-penalize. A reliability guard applies:
only operators with at least MIN_NONBLANK_FOR_DESC non-blank descriptions get
the non-blank-only assessment; below that, blanks count (blank-inclusive
means), so a rich 2-3-description sample among hundreds of listings can't max
the sub-score off `completeness` alone.
"""

import re
import statistics

# Saturation points — the value of each richness signal that maps to a
# sub-score of 100. Set near the p90 of the observed cross-market operator
# distribution. Changing these shifts every operator's marketing score, so a
# bump warrants a methodology review, not a casual edit.
AMEN_SATURATION = 18.0          # mean amenities per listing
DESC_WORDS_SATURATION = 195.0   # mean distinct words / listing -> length_component=100
DESC_CATEGORIES = 6.0           # legacy 7-category saturation (diagnostic only)
DESCRIPTIVE_CATEGORIES = 3.0    # of 4 descriptive categories -> richness_component=100
POLICY_CATEGORIES = 2.0         # of 3 policy categories -> policiesScore=100
PHOTO_SATURATION = 30.0         # median photos per listing
# DESC_WORDS_SATURATION / DESC_CATEGORIES are the cross-market p90 of ranked
# operators (measured over Seattle+LA, the two markets the signal audit
# studied: 730 ranked ops, words p90=193, cats p90=6.0). Same "top decile
# earns 100" bar as AMEN/PHOTO. This de-saturates the description sub-score
# from the old char/1200 proxy (pooled 16% pegged at 100) to ~5%, matching the
# amenities (~9%) and photos (~11%) sub-scores.

# Composite weights (sum to 1.0).
# v0.11 reweighting. The prior split had no component for stated rules, so
# adding one required taking weight from the rest. Completeness stays the
# largest single component — it is the hygiene floor everything else builds on.
# Photos and description are the two elements a renter actually reads, then
# itemised amenities and stated rules as the supporting detail.
W_COMPLETENESS = 0.30           # was 0.35
W_PHOTOS = 0.20                 # was 0.25
W_DESCRIPTION = 0.20            # unchanged
W_AMENITIES = 0.15              # was 0.20
W_POLICIES = 0.15               # new

# Description sub-score internal blend (length vs content richness; sum to 1.0).
W_DESC_LENGTH = 0.5
W_DESC_RICHNESS = 0.5

# Minimum non-blank descriptions needed to assess description quality over the
# non-blank subset. Below this, an operator hasn't written enough descriptions
# for a reliable quality estimate, so blanks count (blank-inclusive means) — a
# rich 2-3-description sample among hundreds of listings must not max this
# sub-score off `completeness` alone. Eligibility is already >=30 listings, so
# this only catches operators who leave nearly everything blank.
MIN_NONBLANK_FOR_DESC = 5

# Content-marker lexicon — cheap keyword heuristics grouped into 7 categories.
# The richness sub-score counts how many DISTINCT categories a listing's prose
# touches, rewarding text that actually informs a renter (amenities +
# neighborhood + policies) over sheer length. Word-boundary matching keeps
# "park" (transit) from firing on "parking" (its own category). Coarse by
# design — the 6-category cap + the 50% length anchor blunt keyword-stuffing.
_CONTENT_PATTERNS = {
    "amenities": r"\b(pool|gym|fitness|dishwasher|hardwood|granite|quartz|stainless|"
                 r"renovated|remodeled|upgraded|updated|washer|dryer|laundry|balcony|"
                 r"patio|deck|fireplace|walk-?in|central air|air conditioning|a/c|closet)\b",
    "location": r"\b(walk to|walkable|near|close to|neighborhood|heart of|located in|"
                r"minutes? (from|to|away)|blocks? (from|away)|steps from|downtown|"
                r"nestled|convenient(ly)?)\b",
    "transit": r"\b(park|schools?|station|freeway|transit|bus|train|subway|light rail|"
               r"metro|highway|shopping|restaurants?|mall|university|campus|airport)\b",
    "parking": r"\b(parking|garage|carport|off-?street|driveway)\b",
    "pet": r"\b(pets?|dogs?|cats?|pet-?friendly)\b",
    "fees": r"\b(deposit|application fee|admin fee|move-?in|security deposit|first month)\b",
    "lease": r"\b(lease|application|credit|income|month-to-month|background check|"
             r"minimum|qualif\w*)\b",
}
# v0.11 — policies are scored as their own composite component rather than
# as three of seven interchangeable "richness" categories.
#
# WHY. A complete listing states its rules: pet policy, fees, lease terms. That
# is part of what makes a listing useful to a renter, and it is the part
# operators most often skip — measured over 19,688 non-blank Chattanooga
# descriptions, amenities appear in 78.0% and location in 72.2%, but pet 36.4%,
# fees 35.0%, lease 34.6%. Burying the three least-stated elements inside a
# 7-category average let an operator max the richness component on amenities
# and location alone while telling a renter nothing about the rules.
#
# The two sets are DISJOINT so nothing is double-counted: richness now measures
# the four descriptive categories, `policies` measures the three rule ones.
_POLICY_CATEGORIES = ("pet", "fees", "lease")
_DESCRIPTIVE_CATEGORIES = tuple(
    k for k in _CONTENT_PATTERNS if k not in _POLICY_CATEGORIES
)
_CONTENT_RES = [re.compile(p, re.I) for p in _CONTENT_PATTERNS.values()]
_DESCRIPTIVE_RES = [
    re.compile(_CONTENT_PATTERNS[k], re.I) for k in _DESCRIPTIVE_CATEGORIES
]
_POLICY_RES = [re.compile(_CONTENT_PATTERNS[k], re.I) for k in _POLICY_CATEGORIES]
_WORD_RE = re.compile(r"[a-z0-9']+")


def count_distinct_words(desc):
    """Distinct lowercased word tokens in a description. A length signal that
    ignores whitespace/HTML padding; collinear with raw chars (r≈0.98) so
    ranking is preserved, the unit is just more robust. 0 for blank/None."""
    if not desc:
        return 0
    return len(set(_WORD_RE.findall(desc.lower())))


def count_content_categories(desc):
    """How many of the 7 content-marker categories the description touches
    (0-7). 0 for blank/None. Retained for the reported `descContentCats`
    diagnostic; the description sub-score now uses the descriptive subset."""
    if not desc:
        return 0
    return sum(1 for rx in _CONTENT_RES if rx.search(desc))


def count_descriptive_categories(desc):
    """Descriptive categories touched (0-4): amenities, location, transit,
    parking. Excludes the policy categories, which score separately."""
    if not desc:
        return 0
    return sum(1 for rx in _DESCRIPTIVE_RES if rx.search(desc))


def count_policy_categories(desc):
    """Policy categories touched (0-3): pet, fees, lease. This is the
    "rules clearly stated" half of a complete listing."""
    if not desc:
        return 0
    return sum(1 for rx in _POLICY_RES if rx.search(desc))


def compute_marketing(d):
    listings = d["marketing_listings_t12"]
    if not listings:
        return {"completeness": 0.0, "completenessScore": 0.0,
                "amenitiesMentioned": 0.0, "amenitiesScore": 0.0,
                "descLen": 0, "descWords": 0, "descContentCats": 0.0, "descScore": 0.0,
                "zeroPhotoT12": 0.0, "amenitiesT12": 0.0,
                "medianPhotosT12": 0, "photosScore": 0.0,
                "descriptiveCats": 0.0, "policyCats": 0.0, "policiesScore": 0.0,
                "compositeScore": 0.0}
    n = len(listings)
    amen_mean = statistics.mean(l["amenities_n"] for l in listings)
    desc_mean = statistics.mean(l["desc_len"] for l in listings)
    photos_med = statistics.median(l["photos_n"] for l in listings)
    zero_photo_pct = 100.0 * sum(1 for l in listings if l["photos_n"] == 0) / n
    has_all = sum(1 for l in listings if l["desc_len"] > 0 and l["photos_n"] > 0 and l["amenities_n"] > 0)
    completeness_score = 100.0 * has_all / n
    amen_score = min(100.0, 100.0 * amen_mean / AMEN_SATURATION)
    photo_score = min(100.0, 100.0 * photos_med / PHOTO_SATURATION)

    # Description sub-score — blend length (distinct words) + content richness.
    # Assessed over NON-BLANK descriptions (blanks are penalized by
    # completeness; counting them as 0 here would double-penalize — see module
    # docstring), BUT only when there's a reliable sample (>=MIN_NONBLANK_FOR_DESC
    # non-blank listings). Below that the operator hasn't demonstrated
    # description quality, so blanks count (blank-inclusive means).
    nonblank = [l for l in listings if l["desc_len"] > 0]
    basis = nonblank if len(nonblank) >= MIN_NONBLANK_FOR_DESC else listings
    words_mean = statistics.mean(l["distinct_words"] for l in basis)
    cats_mean = statistics.mean(l["content_cats"] for l in basis)
    # Richness now spans the DESCRIPTIVE categories only; the policy ones are
    # scored as their own component so they can't be substituted away.
    desc_cats_mean = statistics.mean(l.get("descriptive_cats", 0) for l in basis)
    policy_cats_mean = statistics.mean(l.get("policy_cats", 0) for l in basis)
    length_component = min(100.0, 100.0 * words_mean / DESC_WORDS_SATURATION)
    richness_component = 100.0 * min(1.0, desc_cats_mean / DESCRIPTIVE_CATEGORIES)
    desc_score = W_DESC_LENGTH * length_component + W_DESC_RICHNESS * richness_component
    # "Rules clearly stated." Assessed on the same non-blank basis as the
    # description: a blank description already costs the operator via
    # completeness, and counting it as a policy failure too would double-
    # penalize the same omission.
    policies_score = 100.0 * min(1.0, policy_cats_mean / POLICY_CATEGORIES)

    composite = round(
        W_COMPLETENESS * completeness_score
        + W_AMENITIES * amen_score
        + W_DESCRIPTION * desc_score
        + W_PHOTOS * photo_score
        + W_POLICIES * policies_score,
        1,
    )
    return {
        "completeness": round(amen_mean, 1), "completenessScore": round(completeness_score, 1),
        "amenitiesMentioned": round(amen_mean, 1), "amenitiesScore": round(amen_score, 1),
        "descLen": int(round(desc_mean)), "descWords": int(round(words_mean)),
        "descContentCats": round(cats_mean, 2), "descScore": round(desc_score, 1),
        "zeroPhotoT12": round(zero_photo_pct, 1), "amenitiesT12": round(amen_mean, 1),
        "medianPhotosT12": int(photos_med), "photosScore": round(photo_score, 1),
        "descriptiveCats": round(desc_cats_mean, 2),
        "policyCats": round(policy_cats_mean, 2), "policiesScore": round(policies_score, 1),
        "compositeScore": composite,
    }
