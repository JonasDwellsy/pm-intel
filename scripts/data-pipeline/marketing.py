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
      description: min(100, 100 * mean_description_chars     / 1200)
      photos:      min(100, 100 * median_photos_per_listing  / 30)
"""

import statistics

# Saturation points — the value of each richness signal that maps to a
# sub-score of 100. Set near the p90 of the observed cross-market operator
# distribution. Changing these shifts every operator's marketing score, so a
# bump warrants a methodology review, not a casual edit.
AMEN_SATURATION = 18.0      # mean amenities per listing
DESC_SATURATION = 1200.0    # mean description characters
PHOTO_SATURATION = 30.0     # median photos per listing

# Composite weights (sum to 1.0).
W_COMPLETENESS = 0.35
W_AMENITIES = 0.20
W_DESCRIPTION = 0.20
W_PHOTOS = 0.25


def compute_marketing(d):
    listings = d["marketing_listings_t12"]
    if not listings:
        return {"completeness": 0.0, "completenessScore": 0.0,
                "amenitiesMentioned": 0.0, "amenitiesScore": 0.0,
                "descLen": 0, "descScore": 0.0,
                "zeroPhotoT12": 0.0, "amenitiesT12": 0.0,
                "medianPhotosT12": 0, "photosScore": 0.0, "compositeScore": 0.0}
    n = len(listings)
    amen_mean = statistics.mean(l["amenities_n"] for l in listings)
    desc_mean = statistics.mean(l["desc_len"] for l in listings)
    photos_med = statistics.median(l["photos_n"] for l in listings)
    zero_photo_pct = 100.0 * sum(1 for l in listings if l["photos_n"] == 0) / n
    has_all = sum(1 for l in listings if l["desc_len"] > 0 and l["photos_n"] > 0 and l["amenities_n"] > 0)
    completeness_score = 100.0 * has_all / n
    amen_score = min(100.0, 100.0 * amen_mean / AMEN_SATURATION)
    desc_score = min(100.0, 100.0 * desc_mean / DESC_SATURATION)
    photo_score = min(100.0, 100.0 * photos_med / PHOTO_SATURATION)
    composite = round(
        W_COMPLETENESS * completeness_score
        + W_AMENITIES * amen_score
        + W_DESCRIPTION * desc_score
        + W_PHOTOS * photo_score,
        1,
    )
    return {
        "completeness": round(amen_mean, 1), "completenessScore": round(completeness_score, 1),
        "amenitiesMentioned": round(amen_mean, 1), "amenitiesScore": round(amen_score, 1),
        "descLen": int(round(desc_mean)), "descScore": round(desc_score, 1),
        "zeroPhotoT12": round(zero_photo_pct, 1), "amenitiesT12": round(amen_mean, 1),
        "medianPhotosT12": int(photos_med), "photosScore": round(photo_score, 1),
        "compositeScore": composite,
    }
