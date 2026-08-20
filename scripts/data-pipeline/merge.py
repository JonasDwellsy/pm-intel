#!/usr/bin/env python3
"""v0.6.4 per-market JSON → merged seed (src/data/scorecard_data.json).

Combines the per-market JSONs (one per market in markets.json) into the
single merged seed file that prisma/seed.ts consumes. Also handles the
canonical-operator aggregation: PMs that share a `canonicalOperatorId`
across markets get rolled up into the top-level `canonicalOperators`
object with aggregate stats.

Safety model
============

This script defaults to --dry-run. The --apply mode (which actually
overwrites scorecard_data.json) requires explicit opt-in and always
snapshots the existing file first to a timestamped .bak.

Three modes:

  --dry-run (DEFAULT)
      Builds the merged JSON in /tmp, prints a structural diff against
      the current scorecard_data.json (markets added/removed, PM counts
      per market, canonical-operator changes), exits without writing.
      Safe to run anytime.

  --propose-canonicals
      Analyzes per-market PM names for cross-market collisions that
      look like they should be canonicalized but aren't yet (i.e., new
      Seattle/Denver operators whose normalized name matches an existing
      single-market PM in another market). Writes a proposal JSON for
      human review. Does NOT mutate scorecard_data.json.

  --apply
      Snapshots scorecard_data.json to .bak.<timestamp>, then writes the
      merged JSON in place. Use after --dry-run looks correct AND any
      canonical-mapping curation is done.

The canonical-operator assignment for existing markets is preserved
verbatim from the per-market JSONs (they were already curated upstream).
The merge step itself doesn't touch canonical assignments — that's
controlled exclusively by the canonical_mapping JSON (see --canonical).

Usage
=====

    # Default dry-run, prints diff:
    python merge.py

    # Generate canonical-mapping proposal for new markets:
    python merge.py --propose-canonicals \\
        --new-markets seattle-wa,denver-co \\
        --out /tmp/canonical_proposal.json

    # After diff looks good + canonical curation done:
    python merge.py --apply

See README.md for the full add-a-market runbook.
"""

import argparse
import glob
import json
import os
import re
import shutil
import sys
import time
from collections import defaultdict, Counter
from datetime import datetime, timezone


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
DEFAULT_DATA_DIR = os.path.expanduser("~/Documents/Claude/Projects/Product Support")
DEFAULT_TARGET = os.path.join(REPO_ROOT, "src", "data", "scorecard_data.json")


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------

def load_registry(registry_path):
    with open(registry_path) as f:
        return json.load(f)


def load_per_market(data_dir, output_slug):
    path = os.path.join(data_dir, f"Scorecard_Data_v0.6.4_{output_slug}.json")
    if not os.path.isfile(path):
        sys.exit(
            f"[merge] missing per-market JSON: {path}\n"
            f"  Run: python pipeline.py --market <id> first."
        )
    with open(path) as f:
        return json.load(f), path


# v0.6.4 Patch 5 — coverage-point schema normalization. Different pipeline
# generations emitted points with three different shapes:
#   - {lat, lng, address, city, type}   ← modern pipeline (v0.6.4-native
#     markets: Birmingham/Huntsville/Montgomery/Seattle/Denver/San Antonio/
#     Boulder/Fort Collins). 63% of the points in the merged seed.
#   - {lat, lon}                        ← MSA backdrop points, minimal
#   - {lat, lon, n, city, type}         ← v0.6.3-era markets (Phoenix,
#     Jacksonville, the five TN markets). Aggregated by location.
#
# This mismatch was a SILENT BUG: CoverageMapClient.tsx reads `p.lon`,
# so any point with `lng` instead rendered as [undefined, lat] which
# Mapbox skips. 63% of operator-coverage dots simply didn't appear.
#
# Normalization rule: everything becomes {lat, lon, n}. The lng→lon
# rename happens here; address/city/type are dropped (dead fields, never
# consumed downstream); n defaults to 1 when not aggregated. Also halves
# the JSON size since the dead fields were ~50 bytes/point × ~99K points.
# v0.6.4 Patch 8 — coordinate precision. Source points carry 6-decimal
# lat/lon (~0.1m); on a metro-scale dot map 4 decimals (~11m) is visually
# identical and trims ~0.7MB off the merged seed at 25 markets. Rounding
# here (at merge time) keeps it a single source-of-truth transform that
# applies to every market automatically.
COORD_DECIMALS = 4


def normalize_coverage_points(points):
    """Emit compact [lat, lon, n] tuples.

    These are the heaviest thing in the seed: 366k+ points across the book.
    The old dict form spent 56 bytes each repeating four keys; the tuple
    spends 19. That is ~13 MB off a 54 MB committed file, which matters
    because GitHub hard-rejects anything over 100 MB and the file was a few
    refreshes away from it.

    `city` is dropped. A comment here used to claim OperatorProfilePDF.tsx
    grouped points by city to place map labels — it does not, and no reader
    has ever touched the field. The PDF draws bare circles and takes its
    place names from the Mapbox basemap.

    Accepts dicts (older per-market pipeline output) or tuples (current), so
    a re-merge over mixed vintages is safe.
    """
    out = []
    for p in points or []:
        if isinstance(p, (list, tuple)):
            if len(p) < 2:
                continue
            lat, lon = p[0], p[1]
            n = p[2] if len(p) > 2 else 1
        else:
            lat = p.get("lat")
            lon = p.get("lon", p.get("lng"))
            n = p.get("n", 1)
        if lat is None or lon is None:
            continue  # drop malformed points
        out.append([round(lat, COORD_DECIMALS), round(lon, COORD_DECIMALS), n])
    return out


def normalize_pms_inplace(pms):
    """Strip dead fields + normalize coverage points across the merged PM
    array. Mutates each PM dict in place."""
    for pm in pms:
        gc = pm.get("geographicCoverage")
        if gc and "coverageMapPoints" in gc:
            gc["coverageMapPoints"] = normalize_coverage_points(
                gc["coverageMapPoints"]
            )


# ---------------------------------------------------------------------------
# v0.6.4 Phase B — ID-based cross-market identity
# ---------------------------------------------------------------------------

def _canonical_slug(name):
    """Slug for a canonical entity. Mirrors the pipeline's pm_slug minus the
    market suffix, so an ID-derived canonical slug ('invitation-homes')
    matches the name-based one the decision files produced — keeping
    existing /operators/<slug> URLs stable."""
    return re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")


def load_curated_canon_slugs(decisions_dir=SCRIPT_DIR):
    """Curated cross-market canonical slugs, read from every
    canonical_decisions_*.json (`new_canonicals` + `extend_existing`
    `canonical_slug`). link_by_parent_id must NOT override a
    canonicalOperatorId whose value is one of these: a human explicitly
    curated that cross-market grouping, and it outranks the auto parent-id
    linker (whose parent-name-derived slug can be market-specific)."""
    slugs = set()
    for path in glob.glob(os.path.join(decisions_dir, "canonical_decisions_*.json")):
        with open(path) as f:
            data = json.load(f)
        for key in ("new_canonicals", "extend_existing"):
            for entry in data.get(key, []):
                slug = entry.get("canonical_slug")
                if slug:
                    slugs.add(slug)
    return slugs


def link_by_parent_id(pms, curated_canon_slugs=frozenset()):
    """Group operators across markets by parentCompanyId and assign each
    group a shared canonicalOperatorId (slug of the parent name) +
    canonicalOperatorName, overriding the name-based value already present.

    Operators without a parentCompanyId are left untouched (decision-file /
    self canonical remains — the fallback for untyped markets + standalone
    operators). Operators already carrying a CURATED canonical slug
    (curated_canon_slugs, from the decision files) are likewise left
    untouched — human curation wins over this auto-linker, so a market-
    specific parent name ("PURE Property Management of Arizona") can't yank
    an operator out of its curated cross-market group ("pure-property-
    management"). The source guarantees parentCompanyId→name is 1:1; the rare
    two-distinct-parents-same-name case is disambiguated by appending the id
    to the smaller group's slug, leaving the larger group on the bare slug.

    Returns the number of PMs whose canonicalOperatorId was (re)assigned."""
    pid_name = {}
    pid_groups = defaultdict(list)
    for pm in pms:
        pid = pm.get("parentCompanyId")
        if pid:
            pid_groups[pid].append(pm)
            nm = pm.get("parentCompanyName")
            if nm and pid not in pid_name:
                pid_name[pid] = nm

    # Resolve a unique slug per parent id.
    base_to_pids = defaultdict(list)
    for pid in pid_groups:
        base_to_pids[_canonical_slug(pid_name.get(pid) or pid)].append(pid)
    pid_slug = {}
    for base, pids in base_to_pids.items():
        if len(pids) == 1:
            pid_slug[pids[0]] = base
            continue
        # Same base slug, genuinely different parents: largest group keeps
        # the bare slug (URL stability), the rest get an id suffix.
        #
        # v0.8 — groups containing ACTIVE operators outrank all-dormant groups.
        # Without this, introducing the dormant tier could hand the bare slug to
        # a dormant operator and rename a live one's /operators/<slug> URL, which
        # is the opposite of the stability this tiebreak exists to protect. When
        # no dormant operators are present this is identical to the old ordering
        # (active count == group size), so existing slugs are untouched.
        def _slug_priority(p):
            grp = pid_groups[p]
            n_active = sum(1 for pm in grp if pm.get("operatorStatus") != "dormant")
            return (-n_active, -len(grp), p)

        for i, pid in enumerate(sorted(pids, key=_slug_priority)):
            pid_slug[pid] = base if i == 0 else f"{base}-{pid}"

    assigned = 0
    for pid, group in pid_groups.items():
        slug = pid_slug[pid]
        name = pid_name.get(pid) or group[0].get("canonicalOperatorName") or group[0]["name"]
        for pm in group:
            # Human-curated cross-market canonicals win over the auto parent-id
            # linker: a market-specific parent name must not yank an operator
            # out of its curated group. Leave any PM already on a curated slug.
            if pm.get("canonicalOperatorId") in curated_canon_slugs:
                continue
            pm["canonicalOperatorId"] = slug
            pm["canonicalOperatorName"] = name
            assigned += 1
    return assigned


# ---------------------------------------------------------------------------
# Merge
# ---------------------------------------------------------------------------

def merge_markets(per_market_blobs, methodology_version="v0.7"):
    """Combine per-market JSONs into a single merged blob.

    The canonical-operator IDs on each PM are preserved verbatim from
    the per-market JSON. We recompute the top-level canonicalOperators
    aggregate from the union of PMs (groups of PMs sharing the same
    canonicalOperatorId become a canonical entity).
    """
    merged = {
        "$schema": "v0.6.4",
        "methodologyVersion": methodology_version,
        "designVersion": "v2.0",
        "dataAsOf": None,  # set below to max of per-market dataAsOf
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "marketCount": len(per_market_blobs),
        "markets": [],
        "pms": [],
        "canonicalOperators": {},
        # v0.24 — internal (underscore prefix = stripped from the seed by
        # snapshot_and_write): sub-eligible merge-tool fragments, aggregated
        # across markets + written to the separate merge_fragments.json sidecar.
        "_mergeFragments": [],
    }

    max_data_as_of = None
    slug_counts = Counter()

    for blob in per_market_blobs:
        # Each per-market JSON has markets[] of length 1. Stamp each market
        # with its OWN data cutoff so the scorecard footer can show the
        # per-market "data as of" date (markets refresh on different dates)
        # rather than the global max computed below.
        blob_data_as_of = blob.get("dataAsOf")
        for m in blob["markets"]:
            if blob_data_as_of and "dataAsOf" not in m:
                m["dataAsOf"] = blob_data_as_of
        merged["markets"].extend(blob["markets"])
        for pm in blob["pms"]:
            # Intentionally NOT deduping. The upstream Python pipeline
            # occasionally produces two PMs in the same market whose
            # names slugify identically (e.g., "Asset Realty Management
            # Inc" vs "Asset Realty Management, Inc." both → the same
            # slug). prisma/seed.ts has a deterministic disambiguator
            # that handles this at DB-write time (appends -2/-3 suffix).
            # We pass duplicates through verbatim and surface them in
            # the validation report; root-cause fix at the pipeline is
            # on the methodology backlog.
            slug_counts[pm["slug"]] += 1
            merged["pms"].append(pm)
        merged["_mergeFragments"].extend(blob.get("mergeFragments", []))
        if blob.get("dataAsOf") and (max_data_as_of is None or blob["dataAsOf"] > max_data_as_of):
            max_data_as_of = blob["dataAsOf"]

    merged["dataAsOf"] = max_data_as_of
    duplicate_slugs = [s for s, n in slug_counts.items() if n > 1]

    # v0.6.4 Phase B — ID-based cross-market identity. Operators sharing a
    # parentCompanyId are one entity; assign them a shared canonical slug
    # (from the parent name) + name. AUTHORITATIVE over the name-based
    # decision-file canonicalOperatorId already on each PM. Operators with
    # no parentCompanyId keep their existing canonicalOperatorId — that's
    # the fallback path covering the untyped market(s) + standalone ops.
    id_linked = link_by_parent_id(merged["pms"], load_curated_canon_slugs())
    merged["_id_linked_count"] = id_linked

    # Roll up canonicalOperators from the merged PM set.
    co_groups = defaultdict(list)
    for pm in merged["pms"]:
        cid = pm.get("canonicalOperatorId")
        if cid:
            co_groups[cid].append(pm)

    canonical_operators = {}
    for cid, group in co_groups.items():
        distinct_markets = {pm["marketId"] for pm in group}
        if len(distinct_markets) < 2:
            # Only cross-market entities get a top-level canonicalOperators
            # entry. Single-market operators (including intra-market slug
            # collisions like Knoxville's Asset Realty Management Inc /
            # Inc., which share a slug) are NOT canonical entities — they
            # remain per-market PMs and seed.ts disambiguates them.
            continue
        canonical_name = group[0].get("canonicalOperatorName") or group[0]["name"]
        canonical_operators[cid] = {
            "canonicalSlug": cid,
            "canonicalName": canonical_name,
            "marketIds": sorted(distinct_markets),
            "pmSlugs": sorted(pm["slug"] for pm in group),
            "marketCount": len(distinct_markets),
            "aggregateStats": {
                "totalT12Listings": sum(pm.get("t12Listings", 0) or 0 for pm in group),
                "totalT24T12Listings": sum(pm.get("t24t12Listings", 0) or 0 for pm in group),
                "totalUrusT12": sum(pm.get("urusT12", 0) or 0 for pm in group),
            },
        }

    merged["canonicalOperators"] = canonical_operators
    # v0.6.4 Patch 5 — normalize coverage-point schema across all PMs.
    # Drops the lng/lon/address/city/type inconsistency that left 63%
    # of operator-coverage dots invisible on the in-page map. See
    # normalize_coverage_points() docstring above for the rationale.
    normalize_pms_inplace(merged["pms"])
    # Surface duplicate slugs as INFO (seed.ts will disambiguate them with
    # -2/-3 suffixes — both records persist in the DB).
    merged["_merge_info"] = {"duplicate_pm_slugs": duplicate_slugs} if duplicate_slugs else {}
    return merged


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

REQUIRED_TOP_KEYS = {"methodologyVersion", "dataAsOf", "marketCount", "markets", "pms", "canonicalOperators"}
REQUIRED_MARKET_KEYS = {"id", "msaCode", "city", "state", "fullName"}
REQUIRED_PM_KEYS = {"slug", "name", "marketId", "canonicalOperatorId"}


def validate(merged):
    errors = []
    missing = REQUIRED_TOP_KEYS - set(merged.keys())
    if missing:
        errors.append(f"missing top-level keys: {missing}")
    if merged.get("marketCount") != len(merged.get("markets", [])):
        errors.append(f"marketCount {merged.get('marketCount')} != len(markets) {len(merged.get('markets', []))}")
    seen_market_ids = set()
    for m in merged.get("markets", []):
        miss = REQUIRED_MARKET_KEYS - set(m.keys())
        if miss:
            errors.append(f"market {m.get('id', '?')} missing keys: {miss}")
        if m.get("id") in seen_market_ids:
            errors.append(f"duplicate market id: {m.get('id')}")
        seen_market_ids.add(m.get("id"))
    pm_market_ids = Counter(pm.get("marketId") for pm in merged.get("pms", []))
    for mid in pm_market_ids:
        if mid not in seen_market_ids:
            errors.append(f"pm references unknown marketId: {mid}")
    for pm in merged.get("pms", [])[:3]:  # spot-check shape on a few
        miss = REQUIRED_PM_KEYS - set(pm.keys())
        if miss:
            errors.append(f"pm {pm.get('slug', '?')} missing keys: {miss}")
    # Duplicate PM slugs are passed through verbatim — seed.ts disambiguates
    # them. We surface them as info, not error.
    return errors


def info_messages(merged):
    msgs = []
    dups = merged.get("_merge_info", {}).get("duplicate_pm_slugs")
    if dups:
        msgs.append(
            f"{len(dups)} intra-market slug collision(s) (seed.ts will append -2/-3 suffix): "
            f"{dups[:3]}{'...' if len(dups) > 3 else ''}"
        )
    return msgs


# ---------------------------------------------------------------------------
# Diff (human-readable)
# ---------------------------------------------------------------------------

def diff_summary(old, new):
    lines = []
    old_markets = {m["id"]: m for m in old.get("markets", [])}
    new_markets = {m["id"]: m for m in new.get("markets", [])}
    added = sorted(set(new_markets) - set(old_markets))
    removed = sorted(set(old_markets) - set(new_markets))
    kept = sorted(set(new_markets) & set(old_markets))

    lines.append(f"Markets:  {len(old_markets)} → {len(new_markets)}   (+{len(added)} / -{len(removed)})")
    for mid in added:
        m = new_markets[mid]
        lines.append(f"  + {mid:50s} {m.get('fullName', '?')}")
    for mid in removed:
        m = old_markets[mid]
        lines.append(f"  - {mid:50s} {m.get('fullName', '?')}")

    old_pms_by_market = Counter(pm["marketId"] for pm in old.get("pms", []))
    new_pms_by_market = Counter(pm["marketId"] for pm in new.get("pms", []))
    lines.append(f"PMs:      {sum(old_pms_by_market.values())} → {sum(new_pms_by_market.values())}")
    for mid in sorted(set(old_pms_by_market) | set(new_pms_by_market)):
        oc, nc = old_pms_by_market.get(mid, 0), new_pms_by_market.get(mid, 0)
        if oc != nc:
            marker = "  +" if mid not in old_markets else "   "
            lines.append(f"  {marker} {mid:50s} {oc} → {nc}")

    old_co = old.get("canonicalOperators", {})
    new_co = new.get("canonicalOperators", {})
    co_added = sorted(set(new_co) - set(old_co))
    co_removed = sorted(set(old_co) - set(new_co))
    co_changed = sorted(
        cid for cid in set(new_co) & set(old_co)
        if new_co[cid].get("marketCount") != old_co[cid].get("marketCount")
    )
    lines.append(
        f"Canonical operators: {len(old_co)} → {len(new_co)}   "
        f"(+{len(co_added)} / -{len(co_removed)} / ~{len(co_changed)})"
    )
    for cid in co_added[:10]:
        c = new_co[cid]
        lines.append(f"  + {cid:50s} {c.get('canonicalName', '?')} ({c.get('marketCount')} markets)")
    for cid in co_changed[:10]:
        o, n = old_co[cid], new_co[cid]
        lines.append(f"  ~ {cid:50s} markets {o.get('marketCount')} → {n.get('marketCount')}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Canonical proposal
# ---------------------------------------------------------------------------

def normalize_name(name):
    s = (name or "").lower().strip()
    s = re.sub(r"\b(llc|inc|corp|co|llp|ltd)\b\.?", "", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


WEBSITE_VERDICTS_PATH = os.path.join(
    REPO_ROOT, "src", "data", "management_model_website.json"
)


def load_website_verdicts(path=WEBSITE_VERDICTS_PATH):
    """companyId -> stored website verdict, keyed as a string.

    Produced by enrich_company_websites.py + classify_management_website.py for
    the management-model signal. Read here purely as REVIEW EVIDENCE: the URL
    is the single fastest way to tell whether two same-named operators are one
    company or two, and it was already sitting in the repo unused by this step.

    Concretely: "Peak Property Management" was proposed as one cross-market
    entity across Fort Collins CO, Richmond VA and Bozeman MT. Two of the three
    had a stored URL — peakproperty.net and a Richmond domain — and a reviewer
    seeing those side by side rejects in seconds. Without them the same call
    took parentCompanyId archaeology plus outside searches, and the first
    argument reached that way was wrong: 67 of 188 accepted canonical groups
    have no parentCompanyId on any member, so its absence proves nothing.

    Missing file or malformed JSON is not fatal — the proposal is still useful
    without the evidence, it just costs the reviewer more.
    """
    try:
        with open(path) as f:
            data = json.load(f)
    except (OSError, ValueError):
        return {}
    return {str(k): v for k, v in data.items()} if isinstance(data, dict) else {}


def propose_canonicals(merged, new_market_ids, baseline_canonical_path=None):
    """Find PMs in new markets whose normalized name matches a PM in
    another market. Returns a proposal dict for human review.

    Two flavors of proposal:
    1. extend_existing: new-market PM matches an existing canonical entity
       (e.g., Invitation Homes in Seattle should fold into the existing
       `invitation-homes` canonical operator).
    2. new_pair: new-market PM matches a single-market PM in another
       market that isn't canonicalized yet — create a NEW canonical entity.
    """
    new_market_ids = set(new_market_ids)
    pms = merged["pms"]
    verdicts = load_website_verdicts()

    def member(pm):
        """Proposal member row + whatever disambiguating evidence we hold."""
        row = {"slug": pm["slug"], "name": pm["name"], "marketId": pm["marketId"]}
        cid = pm.get("companyId")
        if cid is not None:
            row["companyId"] = cid
        if pm.get("parentCompanyId") is not None:
            row["parentCompanyId"] = pm["parentCompanyId"]
            if pm.get("parentCompanyName"):
                row["parentCompanyName"] = pm["parentCompanyName"]
        v = verdicts.get(str(cid)) if cid is not None else None
        # website is the load-bearing field; the rest is context.
        row["website"] = (v or {}).get("url")
        if v and v.get("verdict"):
            row["websiteVerdict"] = v["verdict"]
        # Say so explicitly rather than leaving the key absent — a silent gap
        # reads as "no website" when it means "never scraped". New markets land
        # here until enrich_company_websites.py runs for them.
        if row["website"] is None:
            row["websiteEvidence"] = "not scraped"
        return row

    # Index existing canonical entities by normalized name of their member PMs.
    existing_canonicals = merged.get("canonicalOperators", {})
    canonical_norm_index = {}
    for cid, c in existing_canonicals.items():
        canonical_norm_index[normalize_name(c.get("canonicalName", ""))] = cid

    # Group ALL PMs by normalized name.
    by_norm = defaultdict(list)
    for pm in pms:
        norm = normalize_name(pm["name"])
        if norm:
            by_norm[norm].append(pm)

    extend_existing = []
    new_pairs = []

    for norm, group in by_norm.items():
        market_ids_in_group = {pm["marketId"] for pm in group}
        new_markets_present = market_ids_in_group & new_market_ids
        if not new_markets_present:
            continue
        if len(market_ids_in_group) < 2:
            continue  # only one market hits this norm — nothing to canonicalize

        # Case 1: matches an existing canonical entity by normalized name.
        if norm in canonical_norm_index:
            existing_cid = canonical_norm_index[norm]
            existing = existing_canonicals[existing_cid]
            new_pms_to_add = [
                member(pm) for pm in group if pm["marketId"] in new_market_ids
            ]
            if new_pms_to_add:
                extend_existing.append({
                    "existing_canonical_slug": existing_cid,
                    "existing_canonical_name": existing["canonicalName"],
                    "currently_covers_markets": existing["marketIds"],
                    "currently_pm_count": existing["marketCount"],
                    "proposed_additions": new_pms_to_add,
                })
            continue

        # Case 2: new cross-market entity (multiple PMs share normalized
        # name, at least one is in a new market, none in existing canonicals).
        # Skip if all PMs are already in canonical mapping (would have hit
        # case 1).
        all_pm_canonical_ids = {pm.get("canonicalOperatorId") for pm in group}
        # If they already share a canonical id (i.e. canonicalization
        # already done upstream), skip.
        if len(all_pm_canonical_ids) == 1 and len(all_pm_canonical_ids - {pm["slug"] for pm in group}) > 0:
            continue
        new_pairs.append({
            "normalized_name": norm,
            "display_name": group[0]["name"],
            "members": [member(pm) for pm in group],
            # Pre-computed so the reviewer doesn't have to eyeball domains:
            # >1 distinct website is strong evidence of distinct companies.
            "distinct_websites": sorted(
                {m["website"] for m in (member(pm) for pm in group) if m["website"]}
            ),
        })

    return {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "new_market_ids": sorted(new_market_ids),
        "summary": {
            "extensions_to_existing_canonicals": len(extend_existing),
            "new_canonical_entity_candidates": len(new_pairs),
        },
        "extend_existing": extend_existing,
        "new_pairs": new_pairs,
        "_instructions": (
            "REVIEW THIS PROPOSAL BY HAND. Proposals are matched on NORMALIZED "
            "NAME ALONE, so a generic name ('Peak Property Management', 'Real "
            "Estate Group') will pair unrelated companies. 'extend_existing' "
            "folds PMs into an existing canonical entity; 'new_pairs' creates a "
            "new one.\n\n"
            "START WITH `distinct_websites`. More than one distinct domain "
            "across the members is strong evidence of separate companies — "
            "reject. One shared domain is strong evidence for the merge. "
            "`website: null` with `websiteEvidence: \"not scraped\"` means we "
            "have no URL, NOT that the operator has none; run "
            "enrich_company_websites.py for the market and re-propose before "
            "deciding on thin evidence.\n\n"
            "DO NOT treat a missing parentCompanyId as evidence of separate "
            "companies. 67 of 188 accepted canonical groups have no "
            "parentCompanyId on any member (Mission Rock Residential spans 11 "
            "markets that way), so its absence proves nothing. A SHARED "
            "parentCompanyId across members is meaningful; its absence is not.\n\n"
            "Weigh geography and classification too: non-adjacent states plus "
            "small per-market footprints point to distinct local operators, "
            "while a genuine multi-market operator is usually institutional. "
            "When still unsure, REJECT — a wrong merge publishes a false claim "
            "about named businesses and is what a client sees, while a missed "
            "linkage is invisible and can be curated in later.\n\n"
            "Once curated, fold the approved decisions into a new "
            "canonical_mapping_v064_p2_<N>markets.json and re-run "
            "merge.py --apply."
        ),
    }


# ---------------------------------------------------------------------------
# I/O
# ---------------------------------------------------------------------------

# How many timestamped snapshots of a given target to keep. Three covers the
# realistic recovery need — "undo this merge", "undo the one before it" — while
# staying bounded. Without a cap these accumulated to 1.6 GB of a 42 MB file
# copied on every --apply, which is a slow-motion disk leak nobody notices
# because .backups/ is gitignored and therefore invisible in git status.
KEEP_BACKUPS = 3


def prune_backups(backup_dir, base_name, keep=KEEP_BACKUPS):
    """Delete all but the newest `keep` snapshots of one target file.

    Sorted by the embedded timestamp via the filename, not mtime: a copied or
    restored file can carry a misleading mtime, and the name is the thing that
    actually records when the snapshot was taken.

    Only ever touches files matching this exact target's snapshot pattern, so a
    directory shared with other backups is left alone.
    """
    if not os.path.isdir(backup_dir):
        return []
    prefix, suffix = f"{base_name}.", ".bak"
    snaps = sorted(
        f for f in os.listdir(backup_dir)
        if f.startswith(prefix) and f.endswith(suffix)
    )
    stale = snaps[:-keep] if keep > 0 else snaps
    removed = []
    for f in stale:
        path = os.path.join(backup_dir, f)
        try:
            freed = os.path.getsize(path)
            os.remove(path)
            removed.append((f, freed))
        except OSError as e:
            # Never let cleanup fail a merge — the snapshot already succeeded
            # and the merge output is what matters.
            print(f"[merge] warn: could not remove old snapshot {f}: {e}")
    return removed


def snapshot_and_write(merged, target_path):
    if os.path.isfile(target_path):
        ts = time.strftime("%Y%m%dT%H%M%S")
        # v0.6.4 Patch 5 — backups go in a .backups/ subdirectory rather
        # than next to the source file, so the src/data/ folder doesn't
        # accumulate 27MB cruft files between merges. Still gitignored.
        backup_dir = os.path.join(os.path.dirname(target_path), ".backups")
        os.makedirs(backup_dir, exist_ok=True)
        base_name = os.path.basename(target_path)
        backup_name = f"{base_name}.{ts}.bak"
        backup = os.path.join(backup_dir, backup_name)
        shutil.copyfile(target_path, backup)
        print(f"[merge] snapshot: {backup} ({os.path.getsize(backup):,} bytes)")
        # Prune AFTER the new snapshot lands, so a failure above never leaves
        # us having deleted history without writing a replacement.
        removed = prune_backups(backup_dir, base_name)
        if removed:
            freed = sum(sz for _, sz in removed)
            print(
                f"[merge] pruned {len(removed)} old snapshot(s), "
                f"freed {freed:,} bytes (keeping newest {KEEP_BACKUPS})"
            )
    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    # Strip internal _merge_warnings before writing.
    out = {k: v for k, v in merged.items() if not k.startswith("_")}
    # v0.6.4 Patch 5 — minify the merged seed (drop indentation). The
    # file ballooned to 27MB at 15 markets; minification alone cuts
    # 43%. The trade-off is git line-diffs become uninformative on
    # the JSON, but at this size meaningful PR review reads merge.py's
    # diff_summary() output, not the JSON diff line by line.
    with open(target_path, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"[merge] wrote {target_path} ({os.path.getsize(target_path):,} bytes)")

    # v0.6.4 Patch 8 — slim markets-summary sidecar. The full seed is
    # imported at runtime by src/app/property-managers/page.tsx (reads
    # markets.length) and src/lib/ask-system-prompt.ts (reads the market
    # list) — a default JSON import bundles the WHOLE 24MB file into those
    # serverless functions even though neither touches the multi-MB `pms`
    # array. Emitting a markets-only sidecar (~0.3MB) and pointing those
    # importers at it keeps the public markets page + the /api/ask bundle
    # tiny. Written here (not a separate step) so it can never drift from
    # the seed — every merge --apply regenerates both atomically.
    # National operator-weighted DOM median — median of performance.domT12
    # across every ranked PM in every market. Previously recomputed at
    # runtime inside loadStateView() by loading *all* markets' scorecardData
    # on every state page; at 32 markets that pulled the whole ~36MB seed per
    # state-page render and blew the build's DB connection budget. Precompute
    # it once here from the full in-memory seed (exact same value) and read it
    # from the sidecar at runtime. Median formula mirrors state-data.ts
    # median() exactly so the benchmark line is unchanged.
    national_doms = sorted(
        d
        for pm in out.get("pms", [])
        for d in (pm.get("performance", {}).get("domT12"),)
        if isinstance(d, (int, float))
    )
    if national_doms:
        n = len(national_doms)
        mid = n // 2
        national_median_dom = (
            (national_doms[mid - 1] + national_doms[mid]) / 2
            if n % 2 == 0
            else national_doms[mid]
        )
    else:
        national_median_dom = None

    summary = {
        "methodologyVersion": out.get("methodologyVersion"),
        "dataAsOf": out.get("dataAsOf"),
        "nationalMedianDomT12": national_median_dom,
        "markets": out.get("markets", []),
    }
    summary_path = os.path.join(
        os.path.dirname(target_path), "markets-summary.json"
    )
    with open(summary_path, "w") as f:
        json.dump(summary, f, separators=(",", ":"))
    print(
        f"[merge] wrote {summary_path} "
        f"({os.path.getsize(summary_path):,} bytes)"
    )

    # v0.24 — merge-tool sidecar: sub-eligible operator fragments surfaced
    # ONLY in the admin merge tool (never in the seed, PM table, or any
    # ranked / searchable surface). Written atomically with the seed so it
    # can't drift. Deterministic order (market, then -T12, then companyId) and
    # no generatedAt stamp keep the committed git diff stable across re-runs.
    fragments = sorted(
        merged.get("_mergeFragments", []),
        key=lambda x: (x.get("marketId", ""),
                       -x.get("t12ListingsCount", 0),
                       x.get("companyId", "")),
    )
    fragments_path = os.path.join(
        os.path.dirname(target_path), "merge_fragments.json"
    )
    with open(fragments_path, "w") as f:
        json.dump({
            "methodologyVersion": out.get("methodologyVersion"),
            "dataAsOf": out.get("dataAsOf"),
            "fragments": fragments,
        }, f, separators=(",", ":"))
    print(
        f"[merge] wrote {fragments_path} "
        f"({len(fragments)} fragments, {os.path.getsize(fragments_path):,} bytes)"
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    p = argparse.ArgumentParser(
        description="v0.6.4 per-market → merged seed",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    mode = p.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="Build merged JSON in /tmp, print diff, exit. DEFAULT.")
    mode.add_argument("--apply", action="store_true", help="Snapshot target, write merged JSON in place.")
    mode.add_argument("--propose-canonicals", action="store_true", help="Generate canonical-mapping proposal JSON.")
    p.add_argument("--data-dir", default=None, help="Folder with per-market JSONs (default ~/Documents/Claude/Projects/Product Support)")
    p.add_argument("--registry", default=os.path.join(SCRIPT_DIR, "markets.json"))
    p.add_argument("--target", default=DEFAULT_TARGET, help="Path to scorecard_data.json")
    p.add_argument("--markets", default=None, help="Comma-separated market ids to merge (default: all from registry)")
    p.add_argument("--new-markets", default=None, help="(--propose-canonicals only) Comma-separated NEW market ids being analyzed")
    p.add_argument("--out", default=None, help="(--propose-canonicals only) Output path for proposal JSON")
    args = p.parse_args()

    # Default to --dry-run if no mode flag.
    if not (args.apply or args.propose_canonicals):
        args.dry_run = True

    data_dir = args.data_dir or os.environ.get("IQ_DATA_DIR") or DEFAULT_DATA_DIR
    if not os.path.isdir(data_dir):
        sys.exit(f"[merge] data-dir does not exist: {data_dir}")

    registry = load_registry(args.registry)
    market_subset = set((args.markets or "").split(",")) if args.markets else None
    markets_to_load = [
        m for m in registry["markets"]
        if market_subset is None or m["id"] in market_subset
    ]
    if not markets_to_load:
        sys.exit(f"[merge] no markets matched. Known: {[m['id'] for m in registry['markets']]}")

    print(f"[merge] loading {len(markets_to_load)} per-market JSONs from {data_dir}")
    per_market = []
    for m in markets_to_load:
        blob, path = load_per_market(data_dir, m["outputSlug"])
        per_market.append(blob)
        print(f"  ✓ {m['id']:50s} {os.path.basename(path)} ({len(blob.get('pms', []))} pms)")

    print(f"\n[merge] merging...")
    merged = merge_markets(per_market, registry.get("methodologyVersion", "v0.7"))

    errors = validate(merged)
    if errors:
        print(f"\n⚠  Validation errors ({len(errors)}):")
        for e in errors:
            print(f"   {e}")
        if args.apply:
            sys.exit("[merge] refusing to --apply with validation errors")
    else:
        print(f"[merge] validation: ✓ ({len(merged['markets'])} markets, "
              f"{len(merged['pms'])} pms, {len(merged['canonicalOperators'])} canonicals)")
    for msg in info_messages(merged):
        print(f"   ℹ  {msg}")

    if args.propose_canonicals:
        if not args.new_markets:
            sys.exit("[merge] --propose-canonicals requires --new-markets <ids>")
        new_market_ids = args.new_markets.split(",")
        proposal = propose_canonicals(merged, new_market_ids)
        out_path = args.out or f"/tmp/canonical_proposal_{int(time.time())}.json"
        with open(out_path, "w") as f:
            json.dump(proposal, f, indent=2)
        s = proposal["summary"]
        print(f"\n[merge] canonical proposal written: {out_path}")
        print(f"   Extensions to existing canonicals: {s['extensions_to_existing_canonicals']}")
        print(f"   New canonical entity candidates:   {s['new_canonical_entity_candidates']}")
        print(f"\n   Review by hand before applying.")
        return

    # Both --dry-run and --apply produce the merged JSON; only --apply writes
    # to the target. --dry-run also dumps to /tmp for inspection.
    if os.path.isfile(args.target):
        with open(args.target) as f:
            current = json.load(f)
    else:
        current = {"markets": [], "pms": [], "canonicalOperators": {}}

    print(f"\n[merge] diff vs current {os.path.relpath(args.target, REPO_ROOT)}:")
    print(diff_summary(current, merged))

    if args.dry_run:
        out_path = f"/tmp/scorecard_data.merged.{int(time.time())}.json"
        out = {k: v for k, v in merged.items() if not k.startswith("_")}
        with open(out_path, "w") as f:
            json.dump(out, f, indent=2)
        print(f"\n[merge] DRY-RUN — wrote merged JSON to {out_path} for inspection.")
        print(f"        Run with --apply to overwrite {os.path.relpath(args.target, REPO_ROOT)}.")
        return

    if args.apply:
        print(f"\n[merge] APPLYING — snapshotting and writing target.")
        snapshot_and_write(merged, args.target)
        print(f"\n[merge] done. Next: FORCE_SEED=true npx prisma db seed (locally) → commit + PR.")


if __name__ == "__main__":
    main()
