#!/usr/bin/env python3
"""v0.6.4 per-market scorecard pipeline — parameterized from markets.json.

Single source of truth for the v0.6.4 methodology. Earlier iterations
forked one script per market (_v064_birmingham.py, _v064_huntsville.py,
_v064_montgomery.py, _v064_seattle.py, _v064_denver.py) — 1600 lines of
near-identical code × N markets. Any methodology change had to be applied
to every fork.

This file holds the methodology body unchanged. Per-market identity
(MSA code, market name, CSV file, snapshot date) lives in markets.json
alongside this script. New market = add a JSON object to markets.json
and run:

    python pipeline.py --market <market-id>

Optional flags:
    --data-dir <path>   Folder containing the raw CSVs and where outputs
                        are written. Defaults to $IQ_DATA_DIR env var,
                        or ~/Documents/Claude/Projects/Product Support.
    --config <path>     Path to markets.json. Defaults to the file
                        sibling to this script.
    --out-dir <path>    Override output directory (defaults to data-dir).

Output: <data-dir>/Scorecard_Data_v0.6.4_<outputSlug>.json plus a
Summary.md. The merged seed (src/data/scorecard_data.json) is then
rebuilt via merge.py.

See README.md in this directory for the full add-a-market runbook.
"""

import argparse
import csv
import json
import math
import os
import re
import statistics
import sys
import time
from collections import defaultdict, Counter
from datetime import datetime, timedelta, timezone

csv.field_size_limit(sys.maxsize)

# ---------------------------------------------------------------------------
# Configuration — loaded from markets.json via CLI args.
#
# Methodology constants (ELIG_T12_MIN, INSTITUTIONAL_THRESHOLD, etc.) are
# intentionally NOT in markets.json. They define the v0.6.4 methodology
# itself, not per-market identity. Changing them is a methodology version
# bump and warrants a code review, not a config edit. If you need to vary
# them for experimentation, override here and ship as a methodology patch.
# ---------------------------------------------------------------------------

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

_parser = argparse.ArgumentParser(
    description="v0.6.4 per-market scorecard pipeline",
    formatter_class=argparse.RawDescriptionHelpFormatter,
)
_parser.add_argument(
    "--market", required=True,
    help="Market id (key in markets.json), e.g. 'seattle-wa'",
)
_parser.add_argument(
    "--config", default=os.path.join(_SCRIPT_DIR, "markets.json"),
    help="Path to markets.json (default: sibling of this script)",
)
_parser.add_argument(
    "--data-dir", default=None,
    help="Folder containing raw CSVs + national lookup. Defaults to "
         "$IQ_DATA_DIR env var, then ~/Documents/Claude/Projects/Product Support.",
)
_parser.add_argument(
    "--out-dir", default=None,
    help="Output directory for the per-market JSON + Summary.md (defaults to --data-dir).",
)
_args = _parser.parse_args()

# Resolve --data-dir: explicit CLI > env var > home-relative default.
_DEFAULT_DATA_DIR = os.path.expanduser("~/Documents/Claude/Projects/Product Support")
BASE = (
    _args.data_dir
    or os.environ.get("IQ_DATA_DIR")
    or _DEFAULT_DATA_DIR
)
if not os.path.isdir(BASE):
    sys.exit(
        f"[pipeline] data-dir does not exist: {BASE}\n"
        f"  Pass --data-dir, set $IQ_DATA_DIR, or create the default path."
    )

OUT_DIR = _args.out_dir or BASE
os.makedirs(OUT_DIR, exist_ok=True)

with open(_args.config) as _f:
    _cfg = json.load(_f)
_markets_by_id = {m["id"]: m for m in _cfg["markets"]}
if _args.market not in _markets_by_id:
    sys.exit(
        f"[pipeline] unknown market id: {_args.market!r}\n"
        f"  Known markets: {sorted(_markets_by_id)}"
    )
_mkt = _markets_by_id[_args.market]

NATIONAL_LOOKUP = os.path.join(
    BASE, _cfg.get("nationalLookup", "Operator_National_Urus_v0.6.2.json")
)
CSV_PATH = os.path.join(BASE, _mkt["csvFile"])
OUT_JSON = os.path.join(OUT_DIR, f"Scorecard_Data_v0.6.4_{_mkt['outputSlug']}.json")
OUT_SUMMARY = os.path.join(OUT_DIR, f"Scorecard_Data_v0.6.4_{_mkt['outputSlug']}_Summary.md")

for _path, _label in [(CSV_PATH, "csvFile"), (NATIONAL_LOOKUP, "nationalLookup")]:
    if not os.path.isfile(_path):
        sys.exit(f"[pipeline] missing input ({_label}): {_path}")

MSA_CODE = _mkt["msaCode"]
MSA_FULL_NAME = _mkt["msaFullName"]
MARKET_NAME = _mkt["name"]
MARKET_ID = _mkt["id"]
MARKET_STATE = _mkt["state"]
PRIMARY_CITY_FOR_MARKET = _mkt["primaryCity"]

DATA_AS_OF = _mkt["dataAsOf"]
NOW = datetime.strptime(DATA_AS_OF, "%Y-%m-%d").replace(tzinfo=timezone.utc)
T12_START = NOW - timedelta(days=365)
T24_START = NOW - timedelta(days=730)

# Methodology constants — v0.6.4. See note at top of config block.
ELIG_T12_MIN = 30
ELIG_ADDR_MIN = 3
ELIG_BIG_COMM_MIN = 30
ACTIVE_OP_T12_MIN = 3
INSTITUTIONAL_THRESHOLD = 500

START_T = time.time()


def log(msg):
    print(f"[{time.time()-START_T:6.1f}s] {msg}", flush=True)


def parse_dt(s):
    if not s:
        return None
    s = s.strip()
    if not s or s.lower() == "null":
        return None
    try:
        return datetime.strptime(s[:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    except Exception:
        try:
            return datetime.strptime(s[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except Exception:
            return None


def quarter_of(dt):
    return f"{dt.year}Q{(dt.month - 1)//3 + 1}"


def normalize_name(name):
    return re.sub(r"\s+", " ", (name or "").strip()).lower()


def safe_float(s):
    if s is None: return None
    s = str(s).strip()
    if not s or s.lower() == "null": return None
    try: return float(s)
    except Exception: return None


def safe_int(s):
    if s is None: return None
    s = str(s).strip()
    if not s or s.lower() == "null": return None
    try: return int(float(s))
    except Exception: return None


def br_bucket(br):
    if br is None: return None
    if br <= 1: return "1"
    if br == 2: return "2"
    return "3+"


def slugify_city(city):
    s = (city or "").lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = s.strip("-")
    return s or "unknown"


def pm_slug(name):
    s = name.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = s.strip("-")
    return f"{s}-{MARKET_ID}"


# v0.6.4 Patch 4 — PM display-name normalization. The Dwellsy source CSV
# title-cases company names ('PMI Mile High' → 'Pmi Mile High'). We
# restore canonical acronym capitalization via an allowlist + a
# 2-char-token auto-upper heuristic. See normalize_pm_names.py (the
# one-off batch tool that uses the same logic on existing per-market
# JSONs) and pm_name_acronyms.json (the source of truth for the
# allowlist + stopwords) for full rationale.
_PM_NAME_ACRONYMS_PATH = os.path.join(_SCRIPT_DIR, "pm_name_acronyms.json")
with open(_PM_NAME_ACRONYMS_PATH) as _f:
    _acronym_cfg = json.load(_f)
_ACRONYM_MAP = {a.upper(): a for a in _acronym_cfg["acronyms"]}
_STOPWORDS_2CHAR = set(_acronym_cfg.get("stopwords_2char", []))


def normalize_pm_name(name):
    if not name:
        return name
    out = []
    for token in name.split(" "):
        if not token or not token.isalpha():
            out.append(token)
            continue
        upper = token.upper()
        if upper in _ACRONYM_MAP:
            out.append(_ACRONYM_MAP[upper])
        elif len(token) == 2 and token.lower() not in _STOPWORDS_2CHAR:
            out.append(upper)
        else:
            out.append(token)
    return " ".join(out)


def percentile_rank(value, sorted_values):
    if not sorted_values: return None
    n = len(sorted_values)
    le = sum(1 for v in sorted_values if v <= value)
    return round(100.0 * le / n, 1)


def star_for_pct(p):
    if p is None: return None
    if p >= 75: return "gold"
    if p >= 50: return "silver"
    return "none"


def quarter_seq(end_dt, n):
    y, q = end_dt.year, (end_dt.month - 1) // 3 + 1
    seq = []
    for _ in range(n):
        seq.append(f"{y}Q{q}")
        q -= 1
        if q < 1:
            q = 4; y -= 1
    return list(reversed(seq))


def in_t12(ct, dt):
    if ct is None and dt is None: return False
    if ct and T12_START <= ct <= NOW: return True
    if dt and T12_START <= dt <= NOW: return True
    if dt is None and ct is not None: return True
    return False


def in_t24_t12(ct, dt):
    if ct is None and dt is None: return False
    if ct and T24_START <= ct < T12_START: return True
    if dt and T24_START <= dt < T12_START: return True
    return False


# Concession classifier — v0.6.4 Patch 2 regex pattern catalog
CONCESSION_PATTERNS = [
    ("free_month_lease", re.compile(r"\b(?:first|1st|one|1)\s+month(?:'s)?\s+(?:rent\s+)?free\b", re.IGNORECASE)),
    ("free_month_lease2", re.compile(r"\bfree\s+(?:first|1st)?\s*month(?:'s)?\b", re.IGNORECASE)),
    ("months_free_multi", re.compile(r"\b(?:two|three|2|3|4|second)\s+months?\s+free\b", re.IGNORECASE)),
    ("percent_off", re.compile(r"\b\d{1,2}\s*%\s*off\b", re.IGNORECASE)),
    ("half_off", re.compile(r"\b(?:1\/2|half)\s*(?:%)?\s*off\b", re.IGNORECASE)),
    ("dollar_off", re.compile(r"\$\s*\d{2,5}\s*off\b", re.IGNORECASE)),
    ("no_deposit", re.compile(r"\b(?:no\s+deposit|\$0\s+deposit|waived\s+deposit|reduced\s+deposit|zero\s+deposit)\b", re.IGNORECASE)),
    ("move_in_special", re.compile(r"\bmove[\s-]?in\s+(?:special|bonus|incentive|offer|gift|credit)\b", re.IGNORECASE)),
    ("explicit_concession", re.compile(r"\bconcessions?\b", re.IGNORECASE)),
    ("rent_reduction", re.compile(r"\b(?:rent\s+reduction|rental\s+discount|rent\s+incentive|reduced\s+rent)\b", re.IGNORECASE)),
    ("lease_special", re.compile(r"\b(?:lease\s+special|lease\s+promotion|leasing\s+incentive|lease\s+incentive)\b", re.IGNORECASE)),
    ("limited_offer", re.compile(r"\b(?:limited[\s-]time\s+offer|holiday\s+special|year[\s-]end\s+promotion|grand\s+opening\s+special)\b", re.IGNORECASE)),
    ("waived_fee", re.compile(r"\b(?:waived\s+(?:application\s+)?fees?|waived\s+admin\s+fee|application\s+fee\s+waived)\b", re.IGNORECASE)),
    ("free_rent", re.compile(r"\bfree\s+rent\b", re.IGNORECASE)),
]


def classify_concession(desc):
    if not desc: return []
    matches = []
    for name, pat in CONCESSION_PATTERNS:
        m = pat.search(desc)
        if m:
            matches.append((name, m.start()))
    return matches


def concession_sample(desc, start_idx, prefix=80, suffix=120):
    if not desc: return None
    s = max(0, start_idx - prefix)
    e = min(len(desc), start_idx + suffix)
    return desc[s:e]


log("Loading national lookup...")
with open(NATIONAL_LOOKUP) as f:
    national = json.load(f)
log(f"National lookup: {len(national)} operators")


log(f"Streaming {os.path.basename(CSV_PATH)}, filtering to msa_code='{MSA_CODE}' ({MSA_FULL_NAME})...")

pm_rich = {}
pm_display_name = {}
pm_t12_listings = Counter()
pm_t12_by_sub = defaultdict(lambda: Counter())
pm_t24t12_listings = Counter()

backdrop_points = []
MAX_BACKDROP = 200
min_lat = float("inf"); max_lat = float("-inf")
min_lon = float("inf"); max_lon = float("-inf")


def init_rich(norm):
    pm_rich[norm] = {
        "urus_t12": set(), "urus_lifetime": set(),
        "comm_urus_t12": defaultdict(set), "comm_tdc": {},
        "address_t12": set(), "address_lifetime": set(),
        "br_t12_count": Counter(),
        "quarterly_rents_by_br": defaultdict(lambda: defaultdict(list)),
        "earliest_ct": None, "first_listing_dt": None,
        "active_listings": 0, "lifetime_listings": 0,
        "t12_listings": 0, "t24t12_listings": 0,
        "dom_t12_house": [], "dom_t12_apt": [],
        "marketing_listings_t12": [],
        "tenancy_episodes": defaultdict(list),
        "city_urus_t12": defaultdict(set),
        "uru_addr_type": {}, "uru_meta": {},
        "concession_t12_count": 0,
        "concession_patterns": Counter(),
        "concession_samples": [],
        "concession_sample_prefixes": set(),
    }


rows_total = 0
rows_market = 0
with open(CSV_PATH, newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        rows_total += 1
        if row.get("msa_code") != MSA_CODE:
            continue
        rows_market += 1
        company = row.get("company_name", "")
        if not company: continue
        norm = normalize_name(company)
        if not norm: continue
        if norm not in pm_rich:
            init_rich(norm)
            pm_display_name[norm] = company.strip()
        if norm not in pm_display_name or len(company.strip()) > len(pm_display_name.get(norm) or ""):
            pm_display_name[norm] = company.strip()
        d = pm_rich[norm]

        ct = parse_dt(row.get("creation_time"))
        dt_ = parse_dt(row.get("deactivation_time"))
        uru = row.get("uru_id")
        cid = row.get("community_id")
        aid = row.get("address1_id")
        br = safe_int(row.get("bedrooms"))
        rent = safe_float(row.get("rent_amount"))
        tdc = safe_int(row.get("top_down_community_count"))
        addr_type = (row.get("address_type") or "").strip().lower()
        addr_city = (row.get("address_city") or "").strip()
        addr_city_slug = slugify_city(addr_city) if addr_city else None
        status = (row.get("property_listing_status") or "").strip().lower()
        lat = safe_float(row.get("latitude"))
        lng = safe_float(row.get("longitude"))
        desc = row.get("description") or ""

        d["lifetime_listings"] += 1
        if uru: d["urus_lifetime"].add(uru)
        if aid: d["address_lifetime"].add(aid)
        if ct and (d["earliest_ct"] is None or ct < d["earliest_ct"]):
            d["earliest_ct"] = ct
            d["first_listing_dt"] = ct
        if status in ("active", "available"):
            d["active_listings"] += 1

        if lat is not None and lng is not None and -90 <= lat <= 90 and -180 <= lng <= 180:
            if lat < min_lat: min_lat = lat
            if lat > max_lat: max_lat = lat
            if lng < min_lon: min_lon = lng
            if lng > max_lon: max_lon = lng
            if len(backdrop_points) < MAX_BACKDROP and rows_market % 200 == 0:
                backdrop_points.append({"lat": lat, "lon": lng})

        if ct and rent and rent > 0 and br is not None:
            bb = br_bucket(br)
            if bb:
                d["quarterly_rents_by_br"][quarter_of(ct)][bb].append(rent)

        if in_t12(ct, dt_):
            pm_t12_listings[norm] += 1
            d["t12_listings"] += 1
            if addr_city_slug:
                pm_t12_by_sub[norm][addr_city_slug] += 1
                if uru:
                    d["city_urus_t12"][addr_city].add(uru)
            if uru: d["urus_t12"].add(uru)
            if cid and uru: d["comm_urus_t12"][cid].add(uru)
            if aid: d["address_t12"].add(aid)
            if br is not None:
                bb = br_bucket(br)
                if bb: d["br_t12_count"][bb] += 1
            if cid and tdc and cid not in d["comm_tdc"]:
                d["comm_tdc"][cid] = tdc
            if ct and dt_ and dt_ >= ct:
                dom_days = (dt_ - ct).days
                if addr_type in ("house", "single-family", "single_family", "sf"):
                    d["dom_t12_house"].append(dom_days)
                else:
                    d["dom_t12_apt"].append(dom_days)
            amen = row.get("amenities") or ""
            photos = row.get("photos") or ""
            d["marketing_listings_t12"].append({
                "amenities_n": len([x for x in amen.split("|") if x.strip()]) if amen else 0,
                "desc_len": len(desc),
                "photos_n": len([x for x in photos.split("|") if x.strip()]) if photos else 0,
            })
            if uru:
                if addr_type in ("house", "single-family", "single_family", "sf"):
                    d["uru_addr_type"][uru] = "house"
                else:
                    d["uru_addr_type"][uru] = "apartment"
                d["uru_meta"][uru] = {
                    "lat": lat, "lng": lng,
                    "addr": (row.get("address_1") or "").strip(),
                    "city": addr_city, "cid": cid,
                    "type": d["uru_addr_type"][uru],
                }
            if desc:
                matches = classify_concession(desc)
                if matches:
                    d["concession_t12_count"] += 1
                    for pname, _start in matches:
                        d["concession_patterns"][pname] += 1
                    if len(d["concession_samples"]) < 3:
                        first_match = matches[0]
                        snippet = concession_sample(desc, first_match[1])
                        prefix80 = snippet[:80] if snippet else ""
                        if prefix80 and prefix80 not in d["concession_sample_prefixes"]:
                            d["concession_sample_prefixes"].add(prefix80)
                            d["concession_samples"].append(snippet)

        if in_t24_t12(ct, dt_):
            pm_t24t12_listings[norm] += 1
            d["t24t12_listings"] += 1

        if uru and ct:
            d["tenancy_episodes"][uru].append((ct, dt_))

        if rows_total % 50000 == 0:
            log(f"  ... {rows_total:,} total rows; {rows_market:,} BHM rows; {len(pm_rich):,} operators")

log(f"Done streaming. total={rows_total:,}, BHM={rows_market:,}, operators={len(pm_rich):,}")


def has_big_community(d):
    return any(len(urus) >= ELIG_BIG_COMM_MIN for urus in d["comm_urus_t12"].values())


eligible_norms = set()
for norm, d in pm_rich.items():
    if d["t12_listings"] < ELIG_T12_MIN: continue
    if len(d["address_t12"]) < ELIG_ADDR_MIN and not has_big_community(d): continue
    if d["active_listings"] < 1 and d["t12_listings"] < 1: continue
    eligible_norms.add(norm)

active_op_norms = {norm for norm, n in pm_t12_listings.items() if n >= ACTIVE_OP_T12_MIN}

log(f"Eligible PMs (T12 >=30): {len(eligible_norms)}")
log(f"Active operators (T12 >=3): {len(active_op_norms)}")
log(f"Total operators in T12 window: {sum(1 for v in pm_t12_listings.values() if v >= 1)}")


# ---------------------------------------------------------------------------
# Per-PM feature derivation
# ---------------------------------------------------------------------------

last_12_q = quarter_seq(NOW, 12)
last_16_q = quarter_seq(NOW, 16)
last_6_q = quarter_seq(NOW, 6)


def compute_mix_adj_trajectory(d, mix_weights, qlist):
    out = []
    for q in qlist:
        qdata = d["quarterly_rents_by_br"].get(q, {})
        br_meds = {}
        total_n = 0
        for b in ("1", "2", "3+"):
            vals = qdata.get(b, [])
            if len(vals) >= 3:
                br_meds[b] = statistics.median(vals)
                total_n += len(vals)
        if not br_meds:
            out.append({"quarter": q, "mixAdjMedian": None, "n": total_n}); continue
        total_w = sum(mix_weights[b] for b in br_meds.keys())
        if total_w == 0:
            out.append({"quarter": q, "mixAdjMedian": None, "n": total_n}); continue
        mix_med = sum(br_meds[b] * (mix_weights[b] / total_w) for b in br_meds.keys())
        out.append({"quarter": q, "mixAdjMedian": round(mix_med, 1), "n": total_n})
    return out


def compute_pm_yoy(d, mix_weights):
    seq = quarter_seq(NOW, 8)
    qmap = {}
    for q in seq:
        qdata = d["quarterly_rents_by_br"].get(q, {})
        br_meds = {}
        for b in ("1", "2", "3+"):
            vals = qdata.get(b, [])
            if len(vals) >= 3:
                br_meds[b] = statistics.median(vals)
        if not br_meds:
            qmap[q] = None; continue
        total_w = sum(mix_weights[b] for b in br_meds.keys())
        if total_w == 0:
            qmap[q] = None; continue
        qmap[q] = sum(br_meds[b] * (mix_weights[b] / total_w) for b in br_meds.keys())
    recent4 = [qmap[q] for q in seq[4:] if qmap.get(q) is not None]
    prior4 = [qmap[q] for q in seq[:4] if qmap.get(q) is not None]
    if len(recent4) >= 2 and len(prior4) >= 2:
        m_recent = statistics.mean(recent4)
        m_prior = statistics.mean(prior4)
        if m_prior > 0:
            return round((m_recent / m_prior) - 1, 4)
    return None


def compute_dom_t12(d):
    apt = d["dom_t12_apt"]; house = d["dom_t12_house"]
    all_dom = apt + house
    return {
        "domT12": round(statistics.median(all_dom), 1) if all_dom else None,
        "domT12N": len(all_dom),
        "domLifetime": None,
        "houseDomT12": round(statistics.median(house), 1) if house else None,
        "houseUrusT12": len({u for u, t in d["uru_addr_type"].items() if t == "house"}),
        "houseEligible": len(house) >= 10,
        "aptDomT12": round(statistics.median(apt), 1) if apt else None,
        "aptUrusT12": len({u for u, t in d["uru_addr_type"].items() if t == "apartment"}),
        "aptEligible": len(apt) >= 10,
    }


def compute_marketing(d):
    listings = d["marketing_listings_t12"]
    if not listings:
        return {"completeness": 0.0, "completenessScore": 0.0,
                "amenitiesMentioned": 0.0, "amenitiesScore": 0.0,
                "descLen": 0, "descScore": 0.0,
                "zeroPhotoT12": 0.0, "amenitiesT12": 0.0,
                "medianPhotosT12": 0, "compositeScore": 0.0}
    n = len(listings)
    amen_mean = statistics.mean(l["amenities_n"] for l in listings)
    desc_mean = statistics.mean(l["desc_len"] for l in listings)
    photos_med = statistics.median(l["photos_n"] for l in listings)
    zero_photo_pct = 100.0 * sum(1 for l in listings if l["photos_n"] == 0) / n
    has_all = sum(1 for l in listings if l["desc_len"] > 0 and l["photos_n"] > 0 and l["amenities_n"] > 0)
    completeness_score = 100.0 * has_all / n
    amen_score = min(100.0, 10.0 * amen_mean)
    desc_score = min(100.0, 100.0 * desc_mean / 500.0)
    composite = round(0.40 * completeness_score + 0.30 * amen_score + 0.30 * desc_score, 1)
    return {
        "completeness": round(amen_mean, 1), "completenessScore": round(completeness_score, 1),
        "amenitiesMentioned": round(amen_mean, 1), "amenitiesScore": round(amen_score, 1),
        "descLen": int(round(desc_mean)), "descScore": round(desc_score, 1),
        "zeroPhotoT12": round(zero_photo_pct, 1), "amenitiesT12": round(amen_mean, 1),
        "medianPhotosT12": int(photos_med), "compositeScore": composite,
    }


def compute_tenancy(d):
    gaps_all = []; gaps_house = []; gaps_apt = []
    multi_episode_units = 0
    for uru, episodes in d["tenancy_episodes"].items():
        if len(episodes) < 2: continue
        episodes_sorted = sorted(episodes, key=lambda x: x[0])
        had_gap = False
        for i in range(1, len(episodes_sorted)):
            prev_ct = episodes_sorted[i - 1][0]
            curr_ct = episodes_sorted[i][0]
            if curr_ct and prev_ct and curr_ct > prev_ct:
                gap_months = (curr_ct - prev_ct).days / 30.44
                if 1.0 <= gap_months <= 60.0:
                    gaps_all.append(gap_months)
                    addr_t = d["uru_addr_type"].get(uru)
                    if addr_t == "house": gaps_house.append(gap_months)
                    elif addr_t == "apartment": gaps_apt.append(gap_months)
                    had_gap = True
        if had_gap:
            multi_episode_units += 1
    total_units = len(d["urus_lifetime"])
    multi_episode_pct = int(round(100 * multi_episode_units / total_units)) if total_units else 0

    def stats_block(vals):
        if not vals: return {"gap": None, "n": 0}
        return {"gap": round(statistics.median(vals), 1), "n": len(vals)}

    return {
        "totalUnits": total_units,
        "multiEpisodeUnits": multi_episode_units,
        "multiEpisodePct": multi_episode_pct,
        "overallGap": round(statistics.median(gaps_all), 1) if gaps_all else None,
        "house": stats_block(gaps_house),
        "apartment": stats_block(gaps_apt),
    }


def compute_community_visibility(d, q7):
    if "MF/BTR" not in q7: return None
    qualifying_communities = [(cid, urus) for cid, urus in d["comm_urus_t12"].items()
                              if len(urus) >= ELIG_BIG_COMM_MIN]
    total_units = len(d["urus_t12"])
    concentrated_units = sum(len(urus) for cid, urus in d["comm_urus_t12"].items() if len(urus) >= 10)
    concentrated_share = concentrated_units / total_units if total_units else 0
    months_obs = 0
    if d["earliest_ct"]:
        months_obs = (NOW - d["earliest_ct"]).days / 30.44
    if not qualifying_communities or concentrated_share < 0.5 or months_obs < 12:
        return None
    per_community = []
    total_actual = 0; total_expected = 0
    for cid, urus in d["comm_urus_t12"].items():
        actual = len(urus)
        tdc = d["comm_tdc"].get(cid, 0)
        if tdc <= 0: continue
        expected = tdc * 0.20
        per_community.append({
            "communityId": int(cid) if str(cid).isdigit() else cid,
            "knownSize": tdc,
            "expectedListings": round(expected, 1),
            "actualListings": actual,
        })
        total_actual += actual
        total_expected += expected
    if total_expected <= 0: return None
    ratio = round(total_actual / total_expected, 3)
    if ratio >= 0.8:
        state, label, chip = "comprehensive", "Comprehensive visibility", "teal"
    elif ratio >= 0.5:
        state, label, chip = "likely_partial", "Likely partial visibility", "amber"
    else:
        state, label, chip = "partial", "Partial visibility", "amber"
    return {
        "qualifies": True, "ratio": ratio, "state": state,
        "stateLabel": label, "chipColor": chip,
        "expectedTurnoverRate": 0.2,
        "denominatorSource": "top_down_community_count",
        "perCommunity": per_community,
    }


log("Deriving features for eligible set...")
pm_features = {}
# v0.6.4 Patch 3 — iterate the eligible set in sorted order so pm_features
# gets a deterministic insertion order. Python's set has hash-randomized
# iteration; downstream consumers (composite-rank assignment, the pms[]
# array, the merged seed JSON) inherit pm_features' iteration order, so
# without this sort, rank.overall for composite-tied PMs can shift by ±1
# between runs of the same pipeline on the same data.
for norm in sorted(eligible_norms):
    d = pm_rich[norm]
    total_units = len(d["urus_t12"])
    if total_units == 0:
        log(f"WARN: {norm} has T12 listings={d['t12_listings']} but 0 urus_t12; skip.")
        continue
    comm_units_by_pm = {cid: len(urus) for cid, urus in d["comm_urus_t12"].items()}
    concentrated = [(cid, n) for cid, n in comm_units_by_pm.items() if n >= 10]
    concentrated_units = sum(n for _, n in concentrated)
    concentrated_share = concentrated_units / total_units if total_units else 0.0
    median_conc = statistics.median(n for _, n in concentrated) if concentrated else 0

    if concentrated_share < 0.30: op_type = "SFR"
    elif concentrated_share >= 0.70:
        op_type = "Large_MF_BTR" if median_conc >= 50 else "Small_MF_BTR"
    else: op_type = "Hybrid"

    months_on_platform = None; years_visible = None
    if d["earliest_ct"]:
        months_on_platform = round((NOW - d["earliest_ct"]).days / 30.44, 1)
        years_visible = round(months_on_platform / 12.0, 2)

    br_t12 = d["br_t12_count"]
    total_mix = sum(br_t12.values()) or 1
    mix_weights = {k: br_t12.get(k, 0) / total_mix for k in ("1", "2", "3+")}

    rent_trajectory_6q = compute_mix_adj_trajectory(d, mix_weights, last_6_q)
    pm_yoy = compute_pm_yoy(d, mix_weights)

    qmap_16 = {}
    for q in last_16_q:
        qdata = d["quarterly_rents_by_br"].get(q, {})
        br_meds = {}
        for b in ("1", "2", "3+"):
            vals = qdata.get(b, [])
            if len(vals) >= 3:
                br_meds[b] = statistics.median(vals)
        if not br_meds: qmap_16[q] = None; continue
        total_w = sum(mix_weights[b] for b in br_meds.keys())
        if total_w == 0: qmap_16[q] = None; continue
        qmap_16[q] = sum(br_meds[b] * (mix_weights[b] / total_w) for b in br_meds.keys())

    yoy_list = []
    for i, q in enumerate(last_16_q):
        if i < 4: continue
        prior = last_16_q[i - 4]
        m, mp = qmap_16.get(q), qmap_16.get(prior)
        if m and mp and mp > 0:
            yoy_list.append((q, (m / mp) - 1))

    city_counts = sorted(((city, len(urus)) for city, urus in d["city_urus_t12"].items()),
                         key=lambda x: x[1], reverse=True)
    total_city_urus = sum(n for _, n in city_counts)
    top_cities = []
    for city, n in city_counts[:5]:
        if total_city_urus == 0: continue
        pct = int(round(100 * n / total_city_urus))
        if pct > 0:
            top_cities.append({"name": city, "pct": pct, "slug": slugify_city(city)})
    if top_cities:
        parts = [f"{c['name']} {c['pct']}%" if i == 0 else c['name'] for i, c in enumerate(top_cities)]
        cities_text = " · ".join(parts) + f" · {len(city_counts)} cities total observed in {MARKET_NAME} MSA data"
    else:
        cities_text = f"No cities observed in T12 for {MARKET_NAME} MSA"

    coverage_map_points = []
    for uru, meta in list(d["uru_meta"].items())[:200]:
        if meta["lat"] is not None and meta["lng"] is not None:
            coverage_map_points.append({
                "lat": meta["lat"], "lng": meta["lng"],
                "address": meta["addr"], "city": meta["city"],
                "type": meta["type"].title(),
            })

    pm_features[norm] = {
        "urus_t12_count": total_units,
        "urus_lifetime_count": len(d["urus_lifetime"]),
        "comm_units_by_pm": comm_units_by_pm,
        "comm_total_size": dict(d["comm_tdc"]),
        "concentrated_share": concentrated_share,
        "median_concentrated_size": median_conc,
        "op_type": op_type,
        "observed_community_total_units": sum(d["comm_tdc"].get(cid, 0) for cid in d["comm_urus_t12"].keys()),
        "observed_communities": len(d["comm_urus_t12"]),
        "months_on_platform": months_on_platform,
        "years_visible": years_visible,
        "yoy_list": yoy_list,
        "address_t12_count": len(d["address_t12"]),
        "mix_weights": mix_weights,
        "rent_trajectory_6q": rent_trajectory_6q,
        "pm_yoy_change": pm_yoy,
        "top_cities": top_cities,
        "cities_text": cities_text,
        "coverage_map_points": coverage_map_points,
        "first_listing": d["first_listing_dt"].strftime("%Y-%m-%d") if d["first_listing_dt"] else None,
        "lifetime_listings": d["lifetime_listings"],
        "t12_listings": d["t12_listings"],
        "t24t12_listings": d["t24t12_listings"],
        "active_listings": d["active_listings"],
        "dom_block": compute_dom_t12(d),
        "marketing_block": compute_marketing(d),
        "tenancy_block": compute_tenancy(d),
        "cv_block": None,
        "concession_count": d["concession_t12_count"],
        "concession_patterns": d["concession_patterns"],
        "concession_samples": d["concession_samples"],
    }

log(f"Computed features for {len(pm_features)} eligible PMs")


def is_institutional(norm, feats):
    rec = national.get(norm)
    if rec:
        national_total = int(rec.get("national_observed_urus_t12", 0))
        bhm_total = feats["urus_t12_count"]
        combined = national_total + bhm_total
        return combined >= INSTITUTIONAL_THRESHOLD, combined
    n = feats["urus_t12_count"]
    return n >= INSTITUTIONAL_THRESHOLD, n


def quadrant_7cell(op_type, institutional):
    if op_type == "SFR":
        return "SFR Institutional" if institutional else "SFR Independent"
    if op_type == "Small_MF_BTR":
        return "Small MF/BTR Institutional" if institutional else "Small MF/BTR Independent"
    if op_type == "Large_MF_BTR":
        return "Large MF/BTR Institutional" if institutional else "Large MF/BTR Independent"
    return "Hybrid"


def legacy_quadrant(q7):
    if q7 == "Hybrid": return "Hybrid"
    if q7 == "SFR Independent": return "Scattered / Independent"
    if q7 == "SFR Institutional": return "Scattered / Institutional"
    if q7 in ("Small MF/BTR Independent", "Large MF/BTR Independent"): return "MF/BTR / Independent"
    if q7 in ("Small MF/BTR Institutional", "Large MF/BTR Institutional"): return "MF/BTR / Institutional"
    return "Hybrid"


for norm, feats in pm_features.items():
    inst, national_count = is_institutional(norm, feats)
    feats["institutional"] = inst
    feats["national_count"] = national_count
    feats["quadrant7Cell"] = quadrant_7cell(feats["op_type"], inst)

for norm, feats in pm_features.items():
    d = pm_rich[norm]
    feats["cv_block"] = compute_community_visibility(d, feats["quadrant7Cell"])


# Metric values
metric_values = defaultdict(dict)
for norm, feats in pm_features.items():
    metric_values["dom"][norm] = feats["dom_block"]["domT12"]
    metric_values["tenancy"][norm] = feats["tenancy_block"]["overallGap"]
    metric_values["rentPerformance"][norm] = feats["pm_yoy_change"]
    metric_values["marketing"][norm] = feats["marketing_block"]["compositeScore"]
    if feats["cv_block"] and feats["cv_block"].get("qualifies"):
        metric_values["communityVisibility"][norm] = feats["cv_block"]["ratio"]

valid_yoys = [v for v in metric_values["rentPerformance"].values() if v is not None]
cohort_median_yoy_change = round(statistics.median(valid_yoys), 4) if valid_yoys else 0.0
log(f"cohortMedianYoyRentChange: {cohort_median_yoy_change}")
market_rent_growth_t12 = cohort_median_yoy_change

for norm, feats in pm_features.items():
    pm_yoy = feats["pm_yoy_change"]
    if pm_yoy is None:
        metric_values["rentPerformance"][norm] = None
    else:
        metric_values["rentPerformance"][norm] = round(pm_yoy - cohort_median_yoy_change, 4)


def cohort_members(level, focal_norm):
    f_q7 = pm_features[focal_norm]["quadrant7Cell"]
    f_type = pm_features[focal_norm]["op_type"]
    out = []
    for n, f in pm_features.items():
        if level == "primary":
            if f["quadrant7Cell"] == f_q7: out.append(n)
        elif level == "fallback":
            if f["op_type"] == f_type: out.append(n)
        else: out.append(n)
    return out


def cohort_name(level, focal_norm):
    f = pm_features[focal_norm]
    if level == "primary": return f"{MARKET_NAME} {f['quadrant7Cell']}"
    if level == "fallback":
        m = {"SFR": "SFR (any scale)", "Small_MF_BTR": "Small MF/BTR (any scale)",
             "Large_MF_BTR": "Large MF/BTR (any scale)", "Hybrid": "Hybrid"}
        return f"{MARKET_NAME} {m[f['op_type']]}"
    return f"{MARKET_NAME} MSA cohort"


def percentile_for_metric(metric, focal_norm, members):
    vals = [(m, metric_values[metric].get(m)) for m in members if metric_values[metric].get(m) is not None]
    member_dict = dict(vals)
    if focal_norm not in member_dict: return None, len(vals)
    focal_v = member_dict[focal_norm]
    only_vals = [v for _, v in vals]
    if metric == "dom":
        sorted_neg = sorted(-v for v in only_vals)
        pct = percentile_rank(-focal_v, sorted_neg)
    else:
        sorted_vals = sorted(only_vals)
        pct = percentile_rank(focal_v, sorted_vals)
    return pct, len(vals)


log("Computing multi-level percentile ranks...")
multi_pct = defaultdict(dict)
for norm in pm_features:
    for metric in ("dom", "tenancy", "rentPerformance", "marketing", "communityVisibility"):
        if metric not in metric_values or norm not in metric_values[metric]:
            multi_pct[norm][metric] = None; continue
        levels = {}
        for lvl in ("primary", "fallback", "msa"):
            members = cohort_members(lvl, norm)
            if metric == "communityVisibility":
                members = [m for m in members if m in metric_values["communityVisibility"]]
            pct, n = percentile_for_metric(metric, norm, members)
            levels[lvl] = {"pct": pct, "n": n}
        multi_pct[norm][metric] = {
            "primary": levels["primary"]["pct"], "primaryCohortN": levels["primary"]["n"],
            "fallback": levels["fallback"]["pct"], "fallbackCohortN": levels["fallback"]["n"],
            "msa": levels["msa"]["pct"], "msaCohortN": levels["msa"]["n"],
        }


WEIGHTS_FULL = {"dom": 0.30, "tenancy": 0.30, "rentPerformance": 0.10, "marketing": 0.15, "communityVisibility": 0.15}
WEIGHTS_NO_CV = {"dom": 0.30 / 0.85, "tenancy": 0.30 / 0.85, "rentPerformance": 0.10 / 0.85, "marketing": 0.15 / 0.85}


def compute_composite(norm):
    pcts = {}
    for metric in ("dom", "tenancy", "rentPerformance", "marketing", "communityVisibility"):
        block = multi_pct[norm].get(metric)
        if block: pcts[metric] = block.get("msa")
    has_cv = "communityVisibility" in pcts and pcts["communityVisibility"] is not None
    weights = WEIGHTS_FULL if has_cv else WEIGHTS_NO_CV
    total = 0.0; w_used = 0.0
    for m, w in weights.items():
        v = pcts.get(m)
        if v is not None:
            total += v * w; w_used += w
    if w_used == 0: return None
    return round(total / w_used, 1)


composite_values = {}
for norm in pm_features:
    composite_values[norm] = compute_composite(norm)
    metric_values["composite"][norm] = composite_values[norm]

for norm in pm_features:
    levels = {}
    for lvl in ("primary", "fallback", "msa"):
        members = cohort_members(lvl, norm)
        pct, n = percentile_for_metric("composite", norm, members)
        levels[lvl] = {"pct": pct, "n": n}
    multi_pct[norm]["composite"] = {
        "primary": levels["primary"]["pct"], "primaryCohortN": levels["primary"]["n"],
        "fallback": levels["fallback"]["pct"], "fallbackCohortN": levels["fallback"]["n"],
        "msa": levels["msa"]["pct"], "msaCohortN": levels["msa"]["n"],
    }

star_data = defaultdict(dict)
for norm in pm_features:
    for metric in ("dom", "tenancy", "rentPerformance", "marketing", "communityVisibility", "composite"):
        block = multi_pct[norm].get(metric)
        if not block:
            star_data[norm][metric] = None; continue
        if block["primaryCohortN"] >= 10 and block["primary"] is not None:
            used, pct = "primary", block["primary"]
        elif block["fallbackCohortN"] >= 10 and block["fallback"] is not None:
            used, pct = "fallback", block["fallback"]
        else:
            used, pct = "msa", block["msa"]
        star_data[norm][metric] = {
            "star": star_for_pct(pct), "cohortUsed": used,
            "cohortName": cohort_name(used, norm), "percentile": pct,
        }

# Ranks
comp_pairs = [(n, composite_values[n]) for n in pm_features if composite_values.get(n) is not None]
# v0.6.4 Patch 3 — secondary tie-break on `n` (the normalized name) so
# composite-tied PMs sort into a deterministic order. Without the
# secondary key, two PMs with identical composite scores can swap
# positions between runs (Python's sort is stable, but pm_features
# insertion order — its source — was previously hash-randomized; we
# fixed that above by sorting eligible_norms, but the explicit
# tie-break is defensive belt-and-suspenders).
comp_pairs.sort(key=lambda x: (-x[1], x[0]))
overall_rank = {n: i + 1 for i, (n, _) in enumerate(comp_pairs)}
overall_total = len(comp_pairs)
by_quad = defaultdict(list)
for n, c in comp_pairs:
    q = pm_features[n]["quadrant7Cell"]
    by_quad[q].append((n, c))
within_quad_rank = {}; within_quad_total = {}
for q, lst in by_quad.items():
    for i, (n, _) in enumerate(lst):
        within_quad_rank[n] = i + 1
        within_quad_total[n] = len(lst)


def compute_rent_stability_block(feats):
    yv = feats["years_visible"] or 0
    yoy = feats["yoy_list"]
    if yv < 3 or len(yoy) < 12:
        return {"volatilityPP": None, "yearsOfHistory": yv, "suppressed": True,
                "reason": f"Insufficient observation history to compute (operator visible {yv:.1f} years in our data)."}
    vals = [v for _, v in yoy]
    vol = statistics.stdev(vals) * 100
    return {"volatilityPP": round(vol, 2), "yearsOfHistory": yv, "suppressed": False}


rent_stab = {norm: compute_rent_stability_block(feats) for norm, feats in pm_features.items()}

rs_levels = {}
for norm in pm_features:
    if rent_stab[norm]["suppressed"]:
        rs_levels[norm] = None; continue
    vol = rent_stab[norm]["volatilityPP"]
    levels = {}
    for lvl in ("primary", "fallback", "msa"):
        members = [m for m in cohort_members(lvl, norm) if not rent_stab[m]["suppressed"]]
        vals = [rent_stab[m]["volatilityPP"] for m in members]
        if norm not in members:
            levels[lvl] = {"pct": None, "n": len(vals), "cohortMedian": None}; continue
        sorted_neg = sorted(-v for v in vals)
        pct = percentile_rank(-vol, sorted_neg)
        levels[lvl] = {"pct": pct, "n": len(vals),
                       "cohortMedian": round(statistics.median(vals), 2) if vals else None}
    rs_levels[norm] = levels


top3_share_all = {}
for norm, feats in pm_features.items():
    tcs = feats["top_cities"]
    if tcs:
        top3_share_all[norm] = round(sum(c["pct"] for c in tcs[:3]) / 100.0, 4)
    else:
        top3_share_all[norm] = None


def top3_cohort_median(members):
    vals = [top3_share_all[m] for m in members if top3_share_all.get(m) is not None]
    return round(statistics.median(vals), 4) if vals else None


def rent_state_from_pct(pct):
    if pct is None: return "neutral"
    if pct >= 60: return "positive"
    if pct <= 40: return "negative"
    return "neutral"


# Generated text
FORBIDDEN_TOKENS = ["weak", "poor", "underperforming", "underperformer",
                    "strong", "excellent", "best-in-class", "best in class", "subpar", "sub-par"]
MANAGES_PATTERN = re.compile(r"\bmanages\s+\d", re.IGNORECASE)
OPERATES_PATTERN = re.compile(r"\boperates\s+\d", re.IGNORECASE)


def operator_dignity_check(text):
    found = []
    lower = (text or "").lower()
    for tok in FORBIDDEN_TOKENS:
        if tok in lower: found.append(tok)
    if MANAGES_PATTERN.search(text or ""): found.append("manages <N>")
    if OPERATES_PATTERN.search(text or ""): found.append("operates <N>")
    return found


def fmt_int(n):
    if n is None: return "0"
    return f"{int(round(n)):,}"


def size_word(q7):
    if "Small MF/BTR" in q7: return "small multifamily"
    if "Large MF/BTR" in q7: return "multifamily"
    return ""


def quartile_phrase(star, pct):
    if star == "gold": return "top quartile"
    if star == "silver": return "the middle of the cohort"
    if pct is not None and pct < 25: return "the bottom quartile"
    return "the lower half of the cohort"


def driving_phrase(metric, percentile):
    if metric == "dom":
        if percentile >= 90: return "top-decile lease-up speed"
        if percentile >= 75: return "top-quartile lease-up speed"
        if percentile >= 50: return "above-cohort lease-up speed"
    elif metric == "tenancy":
        if percentile >= 90: return "top-decile tenant retention"
        if percentile >= 75: return "top-quartile tenant retention"
        if percentile >= 50: return "above-cohort tenant retention"
    elif metric == "rentPerformance":
        if percentile >= 75: return "above-cohort rent growth"
        if percentile >= 50: return "near-cohort rent growth"
    elif metric == "marketing":
        if percentile >= 75: return "top-quartile operational discipline"
        if percentile >= 50: return "above-cohort operational discipline"
    elif metric == "communityVisibility":
        if percentile >= 75: return "comprehensive community visibility"
        if percentile >= 50: return "above-cohort community visibility"
    return None


def drivers_for(focal_norm):
    sd = star_data[focal_norm]
    pos = []
    for m in ("dom", "tenancy", "rentPerformance", "marketing", "communityVisibility"):
        md = sd.get(m)
        if md and md["percentile"] is not None and md["percentile"] >= 50:
            phrase = driving_phrase(m, md["percentile"])
            if phrase: pos.append((md["percentile"], phrase))
    pos.sort(reverse=True)
    return [p for _, p in pos[:2]]


def tenure_clause(years_visible):
    if years_visible is None: return ""
    if years_visible < 1:
        return f"Observation history is only {years_visible:.1f} years, so cohort-relative metrics carry limited statistical weight."
    if years_visible < 3:
        return f"Observation history is {years_visible:.1f} years, shorter than the 3-year reference window — tenancy estimates may be biased low."
    return ""


def build_exec_summary(name, focal_norm, q7, feats):
    market = f"{MARKET_NAME} MSA"
    sd = star_data[focal_norm]
    comp = sd.get("composite") or {}
    pct = comp.get("percentile")
    star = comp.get("star")
    cn = comp.get("cohortName") or f"{MARKET_NAME} MSA cohort"
    quartile = quartile_phrase(star, pct)
    drv = drivers_for(focal_norm)
    drivers_clause = (f"driven by {' and '.join(drv)}" if drv
                      else "no metric reaching the top quartile of the cohort")
    tc = tenure_clause(feats["years_visible"])

    if q7.startswith("SFR"):
        n_addr = feats["address_t12_count"]
        m_listings = feats["t12_listings"]
        s1 = (f"{name} oversees a scattered single-family portfolio in {market}, "
              f"with {fmt_int(n_addr)} distinct addresses observed and "
              f"{fmt_int(m_listings)} listings in the trailing 12 months.")
        s2 = f"Within the {cn}, composite ranks {quartile}, {drivers_clause}."
        parts = [s1, s2]
        if tc: parts.append(tc)
        return " ".join(parts)

    if q7 == "Hybrid":
        n_conc = sum(1 for n in feats["comm_units_by_pm"].values() if n >= 10)
        concentrated_units = sum(n for n in feats["comm_units_by_pm"].values() if n >= 10)
        scattered_units = feats["urus_t12_count"] - concentrated_units
        comm_word = "community" if n_conc == 1 else "communities"
        if n_conc == 0:
            s1 = (f"{name} is a mixed-mode operator in {market} with no community holdings "
                  f"meeting the 10-unit concentration threshold and "
                  f"{fmt_int(scattered_units)} units across scattered addresses observed in T12.")
        else:
            s1 = (f"{name} is a mixed-mode operator in {market} with {fmt_int(concentrated_units)} units across "
                  f"{n_conc} concentrated {comm_word} and {fmt_int(scattered_units)} units across "
                  f"scattered addresses observed in T12.")
        s2 = f"Within the {cn}, composite ranks {quartile}, {drivers_clause}."
        parts = [s1, s2]
        if tc: parts.append(tc)
        return " ".join(parts)

    n_comm = feats["observed_communities"]
    comm_total = feats["observed_community_total_units"]
    comm_total_approx = int(round(comm_total / 100.0) * 100) if comm_total else 0
    m_listings = feats["t12_listings"]
    cls = size_word(q7) or "multifamily"

    if n_comm == 1:
        s1 = (f"{name} oversees 1 observed {cls} community in {market}, "
              f"with approximately {fmt_int(comm_total_approx)} units total.")
        s2 = (f"We observed {fmt_int(m_listings)} distinct listings from this community "
              f"in the trailing 12 months.")
    else:
        s1 = (f"{name} oversees {fmt_int(n_comm)} observed {cls} communities in {market}, "
              f"with approximately {fmt_int(comm_total_approx)} units total across these properties.")
        s2 = (f"We observed {fmt_int(m_listings)} distinct listings across these communities "
              f"in the trailing 12 months.")
    s3 = f"Within the {cn}, composite ranks {quartile}, {drivers_clause}."
    parts = [s1, s2, s3]
    if tc: parts.append(tc)
    return " ".join(parts)


def build_distinguishing(name, focal_norm, q7, feats):
    bullets = []
    rec = national.get(focal_norm)
    if rec and rec.get("by_market"):
        markets = [m for m, c in rec["by_market"].items() if c and c > 0]
        if len(markets) >= 1:
            other_count = len(markets)
            label_market = "market" if other_count == 1 else "markets"
            bullets.append(f"Also observed in {other_count} other Dwellsy IQ covered {label_market} ({', '.join(sorted(markets))}).")
    n_comm = feats["observed_communities"]
    median_conc = int(feats["median_concentrated_size"])
    if q7.startswith("Large MF/BTR"):
        comm_word = "community" if n_comm == 1 else "communities"
        bullets.append(f"{fmt_int(n_comm)} large multifamily {comm_word} observed (median PM-managed size {median_conc} units).")
    elif q7.startswith("Small MF/BTR"):
        comm_word = "community" if n_comm == 1 else "communities"
        bullets.append(f"{fmt_int(n_comm)} small multifamily {comm_word} observed (median PM-managed size {median_conc} units).")
    elif q7.startswith("SFR"):
        n_addr = feats["address_t12_count"]
        word = "address" if n_addr == 1 else "addresses"
        bullets.append(f"{fmt_int(n_addr)} distinct {word} observed across scattered single-family inventory.")
    elif q7 == "Hybrid":
        bullets.append(f"Mixed portfolio: {int(round(feats['concentrated_share']*100))}% in concentrated communities, balance in scattered addresses.")
    t3 = top3_share_all.get(focal_norm)
    if t3 is not None:
        bullets.append(f"Top-3 city share: {int(round(t3*100))}% of observed units.")
    rs = rent_stab[focal_norm]
    if not rs["suppressed"]:
        bullets.append(f"Rent volatility (trailing 12 quarters): {rs['volatilityPP']}pp standard deviation in YoY change.")
    yv = feats["years_visible"]
    if yv and yv >= 3:
        bullets.append(f"{yv:.1f} years of observation history in our data.")
    elif yv is not None:
        bullets.append(f"Observation history: {yv:.1f} years (shorter than 3-year reference window).")
    return bullets[:4] if len(bullets) >= 2 else []


def build_map_narrative(focal_norm, q7, feats):
    cities = feats["top_cities"]
    if q7.startswith("SFR"):
        if cities:
            top = cities[0]
            pct = top.get("pct", 0)
            if pct >= 80:
                secondary = ", ".join(c["name"] for c in cities[1:3])
                if secondary:
                    return f"Concentrated in {top['name']} ({int(round(pct))}% of observed units), with secondary presence in {secondary}."
                return f"Concentrated in {top['name']} ({int(round(pct))}% of observed units)."
            return f"Distributed across {len(cities)} submarkets in {MARKET_NAME} MSA — broad observed geographic coverage."
    if "MF/BTR" in q7:
        sizes = sorted(feats["comm_units_by_pm"].values(), reverse=True)[:3]
        comms_phrase = ", ".join(f"{n} units" for n in sizes)
        n_comm = feats["observed_communities"]
        if n_comm == 1:
            return f"All {feats['urus_t12_count']} observed units at one community in {cities[0]['name'] if cities else MARKET_NAME + ' MSA'}."
        return f"{n_comm} communities observed across {MARKET_NAME} MSA — observed PM-managed sizes: {comms_phrase}."
    if q7 == "Hybrid":
        if cities:
            return f"Mixed portfolio across {len(cities)} cities, anchored in {cities[0]['name']}."
        return f"Mixed portfolio across multiple submarkets in {MARKET_NAME} MSA."
    return f"{feats['urus_t12_count']} observed units in {MARKET_NAME} MSA."


# Active operator counts
active_operator_count = len(active_op_norms)
sub_to_active_ops = Counter()
for norm in active_op_norms:
    subs = pm_t12_by_sub.get(norm, {})
    for slug, n in subs.items():
        if n >= ACTIVE_OP_T12_MIN:
            sub_to_active_ops[slug] += 1
active_operator_count_by_submarket = dict(sub_to_active_ops)

log(f"activeOperatorCount: {active_operator_count}")

# Listing trajectory cohort median
trajectories = []
for norm in pm_features:
    t12 = pm_t12_listings.get(norm, 0)
    t24t12 = pm_t24t12_listings.get(norm, 0)
    if t24t12 > 0:
        traj = round((t12 - t24t12) / t24t12, 4)
        trajectories.append(traj)
cohort_median_listing_trajectory_yoy = round(statistics.median(trajectories), 4) if trajectories else None


log("Assembling v0.6.4 JSON...")
q7_counts = Counter(pm_features[n]["quadrant7Cell"] for n in pm_features)

legacy_quad_buckets = defaultdict(list)
for norm in pm_features:
    legacy_q = legacy_quadrant(pm_features[norm]["quadrant7Cell"])
    dom = pm_features[norm]["dom_block"]["domT12"]
    legacy_quad_buckets[legacy_q].append(dom)

quadrant_summary = {}
for q in ("MF/BTR / Institutional", "MF/BTR / Independent", "Scattered / Institutional",
          "Scattered / Independent", "Hybrid"):
    vals = [v for v in legacy_quad_buckets.get(q, []) if v is not None]
    quadrant_summary[q] = {
        "count": len(legacy_quad_buckets.get(q, [])),
        "medianDomT12": round(statistics.median(vals), 1) if vals else None,
    }

if min_lat == float("inf"):
    map_bounds = {"north": 33.8, "south": 33.2, "east": -86.4, "west": -87.4}
else:
    map_bounds = {"north": round(max_lat, 3), "south": round(min_lat, 3),
                  "east": round(max_lon, 3), "west": round(min_lon, 3)}


all_dom_t12 = []
for norm in pm_features:
    apt = pm_rich[norm]["dom_t12_apt"]
    house = pm_rich[norm]["dom_t12_house"]
    all_dom_t12.extend(apt + house)
median_dom_t12 = round(statistics.median(all_dom_t12), 1) if all_dom_t12 else None

msa_index_urus = sum(len(pm_rich[n]["urus_t12"]) for n in pm_rich)
msa_total_listings = sum(pm_t12_listings.values())

operator_count_total = sum(1 for v in pm_t12_listings.values() if v >= 1)
operator_count_eligible = len(pm_features)
operators_with_concessions = sum(1 for f in pm_features.values() if f["concession_count"] > 0)


pms = []
validation_failures = []
# v0.6.4 Patch 3 — track slugs assigned so far in this market so we can
# disambiguate collisions. The slug derives from the PM's display name
# (lowercased + non-alphanumerics → "-" + market suffix), which is more
# aggressive than the name normalization that drives pm_features keys.
# Two PMs with names like "Asset Realty Management Inc" and "Asset
# Realty Management, Inc." have DIFFERENT pm_features entries (different
# norms because of the comma) but slugify to the SAME slug. Previously
# this was handled by a deterministic disambiguator in prisma/seed.ts;
# fixing at source means downstream consumers see clean slugs without
# needing to know about the rewrite. seed.ts's disambiguator stays in
# place as defensive belt-and-suspenders.
#
# Iterating sorted(eligible_norms) (same as the feature-derivation loop
# above) makes the disambiguation deterministic: the "first" record
# encountered at each colliding slug keeps the bare slug; the "second"
# gets -2, "third" gets -3, etc.
seen_slugs_in_market = {}  # base slug → count of occurrences so far
slug_collisions = []  # (norm, original_slug, disambiguated_slug) for logging
for norm in sorted(eligible_norms):
    if norm not in pm_features: continue
    feats = pm_features[norm]
    q7 = feats["quadrant7Cell"]
    legacy_q = legacy_quadrant(q7)
    # v0.6.4 Patch 4 — acronym normalization. Dwellsy's source CSV title-
    # cases company names ('PMI Mile High' → 'Pmi Mile High'); we restore
    # canonical acronym capitalization via pm_name_acronyms.json allowlist
    # + 2-char auto-upper. Slug derivation uses the normalized name so
    # the resulting slug matches what the rest of the codebase expects
    # (slugify lowercases anyway, so 'PMI Mile High' and 'Pmi Mile High'
    # produce identical slugs — but using normalized name keeps any
    # downstream slug-from-name re-derivation consistent).
    name = normalize_pm_name(pm_display_name[norm])
    base_slug = pm_slug(name)
    n_seen = seen_slugs_in_market.get(base_slug, 0)
    if n_seen == 0:
        slug = base_slug
    else:
        # n_seen=1 → next gets "-2", n_seen=2 → "-3", etc.
        slug = f"{base_slug}-{n_seen + 1}"
        slug_collisions.append((norm, base_slug, slug))
    seen_slugs_in_market[base_slug] = n_seen + 1

    dom_star = star_data[norm].get("dom") or {}
    rp_star = star_data[norm].get("rentPerformance") or {}
    mkt_star = star_data[norm].get("marketing") or {}
    ten_star = star_data[norm].get("tenancy") or {}
    cv_star = star_data[norm].get("communityVisibility") or {}
    comp_star = star_data[norm].get("composite") or {}

    perf = dict(feats["dom_block"])
    perf["domStar"] = dom_star.get("star")
    perf["domCohortUsedForStar"] = dom_star.get("cohortUsed")
    perf["domCohortName"] = dom_star.get("cohortName")

    pm_yoy = feats["pm_yoy_change"]
    if pm_yoy is None:
        rp = {"pmYoyChange": None, "cohortMedianYoyChange": cohort_median_yoy_change,
              "delta": None, "percentileRank": None, "state": "neutral"}
    else:
        delta = round(pm_yoy - cohort_median_yoy_change, 4)
        rp_pct = (multi_pct[norm].get("rentPerformance") or {}).get("msa")
        rp = {"pmYoyChange": pm_yoy, "cohortMedianYoyChange": cohort_median_yoy_change,
              "delta": delta, "percentileRank": rp_pct, "state": rent_state_from_pct(rp_pct)}
    rp["star"] = rp_star.get("star")
    rp["cohortUsedForStar"] = rp_star.get("cohortUsed")
    rp["cohortName"] = rp_star.get("cohortName")

    mkt = dict(feats["marketing_block"])
    mkt["star"] = mkt_star.get("star")
    mkt["cohortUsedForStar"] = mkt_star.get("cohortUsed")
    mkt["cohortName"] = mkt_star.get("cohortName")

    ten = dict(feats["tenancy_block"])
    ten["tenancyPercentile"] = (multi_pct[norm].get("tenancy") or {}).get("msa")
    ten["shortHistoryFlag"] = (feats["years_visible"] or 0) < 3
    ten["yearsVisible"] = feats["years_visible"]
    ten["star"] = ten_star.get("star")
    ten["cohortUsedForStar"] = ten_star.get("cohortUsed")
    ten["cohortName"] = ten_star.get("cohortName")

    cv = None
    if feats["cv_block"]:
        cv = dict(feats["cv_block"])
        cv["percentileRank"] = (multi_pct[norm].get("communityVisibility") or {}).get("msa")
        cv["star"] = cv_star.get("star")
        cv["cohortUsedForStar"] = cv_star.get("cohortUsed")
        cv["cohortName"] = cv_star.get("cohortName")

    coverage = {
        "firstListing": feats["first_listing"],
        "monthsOnPlatform": int(round(feats["months_on_platform"])) if feats["months_on_platform"] else 0,
        "lifetimeListings": feats["lifetime_listings"],
        "t12Listings": feats["t12_listings"],
        "urusLifetime": feats["urus_lifetime_count"],
        "urusT12": feats["urus_t12_count"],
        "activeListings": feats["active_listings"],
        "totalObservedUnits": feats["urus_t12_count"],
        "nationalObservedUnitsT12": feats["national_count"],
        "citiesObserved": len(feats["top_cities"]),
        "dataTier": "Full ranking",
        "observedCommunities": feats["observed_communities"],
        "observedCommunityTotalUnits": feats["observed_community_total_units"],
        "yearsVisible": feats["years_visible"],
    }

    cs_pct = int(round(feats["concentrated_share"] * 100))
    scale = "Institutional" if feats["institutional"] else "Independent"
    if q7 == "Hybrid":
        rationale = (f"{name} operates a mix of multi-unit community holdings and scattered-site inventory. "
                     f"{cs_pct}% of observed inventory is in concentrated communities — between the 30% and 70% thresholds. "
                     f"Total observed managed units in {MARKET_NAME} MSA: {feats['urus_t12_count']}, at the {scale} scale.")
    elif q7.startswith("SFR"):
        rationale = (f"{name} operates predominantly scattered single-family inventory. "
                     f"{cs_pct}% of observed inventory sits in concentrated communities. "
                     f"Total observed managed units in {MARKET_NAME} MSA: {feats['urus_t12_count']}, "
                     f"classified as {legacy_q} at the {scale} scale.")
    else:
        rationale = (f"{name} operates predominantly in multi-unit communities. "
                     f"{cs_pct}% of observed inventory sits in communities where the operator manages 10+ units. "
                     f"Total observed managed units in {MARKET_NAME} MSA: {feats['urus_t12_count']}, "
                     f"classified as {legacy_q} at the {scale} scale.")
    if feats["urus_t12_count"] < 50:
        rationale += " Composite rank computed on thin sample — consider with caution."

    rs = rent_stab[norm]
    rs_block = {"volatilityPP": rs["volatilityPP"], "yearsOfHistory": rs["yearsOfHistory"], "suppressed": rs["suppressed"]}
    if rs["suppressed"]: rs_block["reason"] = rs.get("reason")
    rs_pct = rs_levels.get(norm)
    if rs_pct:
        rs_block["percentiles"] = {
            "primary": rs_pct["primary"]["pct"], "primaryCohortN": rs_pct["primary"]["n"], "primaryCohortMedian": rs_pct["primary"]["cohortMedian"],
            "fallback": rs_pct["fallback"]["pct"], "fallbackCohortN": rs_pct["fallback"]["n"], "fallbackCohortMedian": rs_pct["fallback"]["cohortMedian"],
            "msa": rs_pct["msa"]["pct"], "msaCohortN": rs_pct["msa"]["n"], "msaCohortMedian": rs_pct["msa"]["cohortMedian"],
        }
        if rs_pct["primary"]["n"] >= 10 and rs_pct["primary"]["pct"] is not None:
            used, pctv, med = "primary", rs_pct["primary"]["pct"], rs_pct["primary"]["cohortMedian"]
        elif rs_pct["fallback"]["n"] >= 10 and rs_pct["fallback"]["pct"] is not None:
            used, pctv, med = "fallback", rs_pct["fallback"]["pct"], rs_pct["fallback"]["cohortMedian"]
        else:
            used, pctv, med = "msa", rs_pct["msa"]["pct"], rs_pct["msa"]["cohortMedian"]
        rs_block["star"] = star_for_pct(pctv)
        rs_block["cohortUsedForStar"] = used
        rs_block["cohortMedianVolatility"] = med
    else:
        rs_block["star"] = None

    t3 = top3_share_all.get(norm)
    gc_levels = {}
    for lvl in ("primary", "fallback", "msa"):
        members = cohort_members(lvl, norm)
        gc_levels[lvl] = {"cohortMedianTop3": top3_cohort_median(members), "n": len(members)}
    if gc_levels["primary"]["n"] >= 10 and gc_levels["primary"]["cohortMedianTop3"] is not None:
        gc_used = "primary"
    elif gc_levels["fallback"]["n"] >= 10 and gc_levels["fallback"]["cohortMedianTop3"] is not None:
        gc_used = "fallback"
    else:
        gc_used = "msa"
    gc_med = gc_levels[gc_used]["cohortMedianTop3"]
    if t3 is not None and gc_med is not None:
        if t3 > gc_med + 0.05: pos = "more_concentrated"
        elif t3 < gc_med - 0.05: pos = "more_dispersed"
        else: pos = "near_cohort"
    else:
        pos = None
    geo_concentration = {"top3CityShare": t3, "cohortMedianTop3": gc_med,
                         "cohortLevel": gc_used, "linearPositionIndicator": pos}

    exec_summary = build_exec_summary(name, norm, q7, feats)
    distinguishing = build_distinguishing(name, norm, q7, feats)
    map_narrative = build_map_narrative(norm, q7, feats)

    for label, txt in (("executiveSummary", exec_summary), ("mapNarrativeAnnotation", map_narrative)):
        fails = operator_dignity_check(txt)
        if fails:
            validation_failures.append({"pm": name, "field": label, "tokens": fails, "text": txt})
    for i, b in enumerate(distinguishing):
        fails = operator_dignity_check(b)
        if fails:
            validation_failures.append({"pm": name, "field": f"distinguishingCharacteristics[{i}]", "tokens": fails, "text": b})

    pct_blocks = {}
    for metric in ("dom", "tenancy", "rentPerformance", "marketing", "communityVisibility", "composite"):
        if multi_pct[norm].get(metric):
            pct_blocks[metric] = multi_pct[norm][metric]

    composite_pct_block = multi_pct[norm].get("composite") or {}
    cohort_used_composite = (comp_star.get("cohortUsed") or "msa")
    cohort_fallback_indicator = None
    if cohort_used_composite == "fallback":
        n_primary = composite_pct_block.get("primaryCohortN", 0)
        cohort_fallback_indicator = f"Ranked against {MARKET_NAME} fallback cohort (primary N={n_primary} too small)."
    elif cohort_used_composite == "msa":
        n_primary = composite_pct_block.get("primaryCohortN", 0)
        n_fb = composite_pct_block.get("fallbackCohortN", 0)
        cohort_fallback_indicator = f"Ranked against {MARKET_NAME} MSA overall, primary N={n_primary} and fallback N={n_fb} too small in 7-cell cohort."

    t12_by_sub = dict(pm_t12_by_sub.get(norm, {}))

    cons_count = feats["concession_count"]
    cons_rate = round(cons_count / feats["t12_listings"], 4) if feats["t12_listings"] > 0 else None
    cons_patterns_top3 = [p for p, _ in feats["concession_patterns"].most_common(3)]
    cons_samples = list(feats["concession_samples"])
    cons_sample_text = cons_samples[0] if cons_samples else None

    pm_out = {
        "slug": slug, "name": name, "marketId": MARKET_ID,
        "primaryCity": (feats["top_cities"][0]["name"] if feats["top_cities"] else PRIMARY_CITY_FOR_MARKET),
        "claimed": False, "accentColor": "#0E5C73",
        "quadrant": legacy_q, "quadrant7Cell": q7,
        "hybrid": q7 == "Hybrid", "institutional": feats["institutional"],
        "newlyEligibleInV063": False,
        "rank": {
            "overall": overall_rank.get(norm),
            "overallTotal": overall_total,
            "quadrant": within_quad_rank.get(norm),
            "quadrantTotal": within_quad_total.get(norm),
            "composite": composite_values.get(norm),
            "weightingScheme": ("DOM30 Tenancy30 RentPerformance10 Marketing15 CV15"
                                if cv is not None else
                                "DOM35 Tenancy35 RentPerformance12 Marketing18 (CV suppressed; redistributed)"),
            "percentiles": pct_blocks,
            "compositeStar": comp_star.get("star"),
            "compositeCohortUsedForStar": comp_star.get("cohortUsed"),
            "compositeCohortName": comp_star.get("cohortName"),
            "cohortFallbackIndicator": cohort_fallback_indicator,
        },
        "coverage": coverage,
        "performance": perf,
        "rentTrajectory": feats["rent_trajectory_6q"],
        "rentPerformance": rp,
        "marketing": mkt,
        "tenancy": ten,
        "geographicCoverage": {
            "citiesText": feats["cities_text"],
            "topCities": [{"name": c["name"], "pct": c["pct"]} for c in feats["top_cities"]],
            "coverageMapPoints": feats["coverage_map_points"],
        },
        "classificationRationale": rationale,
        "lendingSignals": {"rentStability": rs_block, "geographicConcentration": geo_concentration},
        "generatedText": {
            "executiveSummary": exec_summary,
            "distinguishingCharacteristics": distinguishing,
            "mapNarrativeAnnotation": map_narrative,
            "generatedAt": NOW.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "generatedFromMethodologyVersion": "v0.6.4",
            "generatedFromDesignVersion": "v1.0",
        },
        "t12ListingsBySubmarket": t12_by_sub,
        "t12ListingsCount": feats["t12_listings"],
        "t24t12ListingsCount": feats["t24t12_listings"],
        "listingTrajectoryYoY": (round((feats["t12_listings"] - feats["t24t12_listings"]) / feats["t24t12_listings"], 4)
                                 if feats["t24t12_listings"] > 0 else None),
        "canonicalOperatorId": slug,
        "canonicalOperatorName": name,
        "concessionListingCount": cons_count,
        "concessionRate": cons_rate,
        "concessionPatterns": cons_patterns_top3,
        "concessionSampleText": cons_sample_text,
        "concessionSamples": cons_samples,
    }
    if cv is not None:
        pm_out["communityVisibility"] = cv
    pms.append(pm_out)

pms.sort(key=lambda p: (p["rank"]["overall"] if p["rank"]["overall"] is not None else 9999, p["name"]))


all_operators_t12_by_sub = {}
for norm, subs in pm_t12_by_sub.items():
    if not subs: continue
    all_operators_t12_by_sub[norm] = {
        "name": pm_display_name.get(norm, norm),
        "t12Listings": pm_t12_listings[norm],
        "t12ListingsBySubmarket": dict(subs),
    }


market = {
    "id": MARKET_ID, "msaCode": MSA_CODE,
    "city": PRIMARY_CITY_FOR_MARKET, "state": MARKET_STATE, "fullName": MSA_FULL_NAME,
    "operatorCountTotal": operator_count_total,
    "operatorCountEligible": operator_count_eligible,
    "medianDomT12": median_dom_t12, "medianDomLifetime": median_dom_t12,
    "msaIndexUrus": msa_index_urus, "msaTotalListings": msa_total_listings,
    "cohortMedianYoyRentChange": cohort_median_yoy_change,
    "quadrantSummary": quadrant_summary,
    "mapBounds": map_bounds, "msaBackdropPoints": backdrop_points,
    "quadrant7CellSummary": dict(sorted(q7_counts.items())),
    "eligibilityWindow": "T12",
    "activeOperatorCount": active_operator_count,
    "activeOperatorCountBySubmarket": active_operator_count_by_submarket,
    "marketRentGrowthT12": market_rent_growth_t12,
    "nationalRentGrowthT12": None,
    "marketRentGrowthDeltaVsNationalPp": None,
    "cohortMedianListingTrajectoryYoY": cohort_median_listing_trajectory_yoy,
    "nationalListingTrajectoryYoY": None,
    "listingTrajectoryDeltaVsNationalPp": None,
    "operatorsWithConcessions": operators_with_concessions,
    "concessionPatchVersion": "v0.6.4 Patch 2",
}

out = {
    "$schema": "https://iq.dwellsy.com/schema/scorecard-v0.6.4.json",
    "methodologyVersion": "v0.6.4",
    "designVersion": "v1.0",
    "dataAsOf": DATA_AS_OF,
    "generatedAt": NOW.strftime("%Y-%m-%dT%H:%M:%SZ"),
    "markets": [market],
    "pms": pms,
    "allOperatorsT12BySubmarket": all_operators_t12_by_sub,
    "canonicalOperators": {},
}

with open(OUT_JSON, "w") as f:
    json.dump(out, f, indent=2)
log(f"Wrote {OUT_JSON} ({os.path.getsize(OUT_JSON):,} bytes)")


# Summary markdown
top_ops = sorted(pms, key=lambda p: -(p["rank"]["composite"] or -1))[:5]
ranked_with_conc = [p for p in pms if p["concessionListingCount"] > 0]
conc_rate_pct = round(100 * len(ranked_with_conc) / len(pms), 1) if pms else 0
avg_conc_rate_among_active = (round(100 * statistics.mean([p["concessionRate"] for p in ranked_with_conc if p["concessionRate"] is not None]), 1)
                              if ranked_with_conc else 0.0)
inst_ranked = [p for p in pms if p["institutional"]]

lines = []
lines.append(f"# Scorecard Data v0.6.4 — {MARKET_NAME} Summary")
lines.append("")
lines.append(f"**Methodology version:** v0.6.4  ")
lines.append(f"**Design version:** v1.0  ")
lines.append(f"**Data as of:** {DATA_AS_OF}  ")
lines.append(f"**Generated:** {NOW.strftime('%Y-%m-%dT%H:%M:%SZ')}  ")
lines.append(f"**MSA:** {MSA_FULL_NAME} (code {MSA_CODE})  ")
lines.append(f"**Patches applied:** all v0.6 + v0.6.1 + v0.6.2 + v0.6.3 + v0.6.4 (full stack)  ")
lines.append("")
lines.append("## Market totals")
lines.append("")
lines.append(f"- BHM rows in CSV: **{rows_market:,}**")
lines.append(f"- Total operators observed (T12 >=1): **{operator_count_total}**")
lines.append(f"- Active operators (T12 >=3): **{active_operator_count}**")
lines.append(f"- Ranked operators (T12 >=30 + diversity rule): **{operator_count_eligible}**")
lines.append(f"- MSA median DOM (T12): **{median_dom_t12} days**")
lines.append(f"- MSA index urus (sum of distinct urus_t12): **{msa_index_urus:,}**")
lines.append(f"- MSA total listings (T12): **{msa_total_listings:,}**")
lines.append("")
lines.append("## 7-cell taxonomy distribution")
lines.append("")
lines.append("| Cell | Count |")
lines.append("|---|---:|")
for q in ("SFR Independent", "SFR Institutional", "Small MF/BTR Independent", "Small MF/BTR Institutional",
          "Large MF/BTR Independent", "Large MF/BTR Institutional", "Hybrid"):
    lines.append(f"| {q} | {q7_counts.get(q, 0)} |")
lines.append("")
lines.append("## Legacy 5-cell summary (with median DOM)")
lines.append("")
lines.append("| Cell | Count | Median DOM T12 |")
lines.append("|---|---:|---:|")
for q in ("MF/BTR / Institutional", "MF/BTR / Independent", "Scattered / Institutional", "Scattered / Independent", "Hybrid"):
    qs = quadrant_summary[q]
    lines.append(f"| {q} | {qs['count']} | {qs['medianDomT12']} |")
lines.append("")
lines.append("## Top 5 operators by composite")
lines.append("")
lines.append("| Rank | Name | 7-cell | Composite | Star | urusT12 | T12 listings |")
lines.append("|---:|---|---|---:|---|---:|---:|")
for p in top_ops:
    lines.append(f"| {p['rank']['overall']} | {p['name']} | {p['quadrant7Cell']} | {p['rank']['composite']} | {p['rank']['compositeStar'] or 'none'} | {p['coverage']['urusT12']} | {p['coverage']['t12Listings']} |")
lines.append("")
lines.append("## Institutional operators in ranked cohort")
lines.append("")
if inst_ranked:
    lines.append("| Name | 7-cell | National urus (incl BHM) | Composite | BHM urusT12 |")
    lines.append("|---|---|---:|---:|---:|")
    for p in sorted(inst_ranked, key=lambda x: -x["coverage"]["nationalObservedUnitsT12"]):
        lines.append(f"| {p['name']} | {p['quadrant7Cell']} | {p['coverage']['nationalObservedUnitsT12']:,} | {p['rank']['composite']} | {p['coverage']['urusT12']} |")
else:
    lines.append("_No institutional operators in this market's ranked cohort (no operator reaches the cross-market 500-urus threshold)._")
lines.append("")
lines.append("## Market rent growth T12")
lines.append("")
lines.append(f"- **marketRentGrowthT12** (median pmYoyChange across ranked operators): **{market_rent_growth_t12*100:+.2f}%** ({market_rent_growth_t12})")
lines.append(f"- Number of ranked operators with non-null pmYoyChange: **{len(valid_yoys)}** / {operator_count_eligible}")
lines.append("")
lines.append("## Listing trajectory (T24-T12 vs T12)")
lines.append("")
if cohort_median_listing_trajectory_yoy is not None:
    lines.append(f"- **cohortMedianListingTrajectoryYoY**: **{cohort_median_listing_trajectory_yoy*100:+.2f}%**")
    lines.append(f"- Number of operators with non-null trajectory: **{len(trajectories)}** / {operator_count_eligible}")
else:
    lines.append("- _No non-null trajectories in cohort._")
lines.append("")
lines.append("## Concession activity (v0.6.4 Patch 2)")
lines.append("")
lines.append(f"- **Ranked PMs with >=1 concession listing:** {len(ranked_with_conc)} / {operator_count_eligible} ({conc_rate_pct}%)")
lines.append(f"- **Avg concession rate among concession-offerers:** {avg_conc_rate_among_active}%")
lines.append("")
if ranked_with_conc:
    lines.append("### Top 5 by concession rate")
    lines.append("")
    lines.append("| Name | T12 listings | Concession listings | Rate | Top patterns |")
    lines.append("|---|---:|---:|---:|---|")
    for p in sorted(ranked_with_conc, key=lambda x: -(x["concessionRate"] or 0))[:5]:
        lines.append(f"| {p['name']} | {p['coverage']['t12Listings']} | {p['concessionListingCount']} | {p['concessionRate']*100:.1f}% | {', '.join(p['concessionPatterns']) or '-'} |")
    lines.append("")
lines.append("## Top submarkets by active operator count")
lines.append("")
top_subs = sorted(active_operator_count_by_submarket.items(), key=lambda x: -x[1])[:10]
lines.append("| Submarket slug | Active operators (T12 >=3) |")
lines.append("|---|---:|")
for slug_, n in top_subs:
    lines.append(f"| {slug_} | {n} |")
lines.append("")
lines.append("## Sample executive summaries (improved template validation)")
lines.append("")
sample_picks = []
seen_classes = set()
for p in pms:
    if p["quadrant7Cell"].startswith(("Small MF/BTR", "Large MF/BTR")) and p["coverage"]["observedCommunities"] == 1 and "mfbtr-single" not in seen_classes:
        sample_picks.append(("MF/BTR single-community", p))
        seen_classes.add("mfbtr-single"); break
for p in pms:
    if p["quadrant7Cell"].startswith(("Small MF/BTR", "Large MF/BTR")) and p["coverage"]["observedCommunities"] > 1 and "mfbtr-multi" not in seen_classes:
        sample_picks.append(("MF/BTR multi-community", p))
        seen_classes.add("mfbtr-multi"); break
for p in pms:
    if p["quadrant7Cell"].startswith("SFR") and "sfr" not in seen_classes:
        sample_picks.append(("SFR", p))
        seen_classes.add("sfr"); break
for p in pms:
    if p["quadrant7Cell"] == "Hybrid" and "hybrid" not in seen_classes:
        sample_picks.append(("Hybrid", p))
        seen_classes.add("hybrid"); break
if pms:
    sample_picks.append(("Top composite", pms[0]))
for label, p in sample_picks:
    lines.append(f"### {label}: {p['name']} ({p['quadrant7Cell']})")
    lines.append("")
    lines.append(f"> {p['generatedText']['executiveSummary']}")
    lines.append("")

lines.append("## Operator dignity validation")
lines.append("")
if validation_failures:
    lines.append(f"**FAILURES: {len(validation_failures)}**")
    for fail in validation_failures[:20]:
        lines.append(f"- {fail['pm']} / {fail['field']}: tokens={fail['tokens']}")
        lines.append(f"  > {fail['text']}")
else:
    lines.append("All generated text passes the operator-dignity language gate. No forbidden tokens found.")
lines.append("")
lines.append("## Anomalies and data quality notes")
lines.append("")
short_history = sum(1 for p in pms if p["tenancy"]["shortHistoryFlag"])
suppressed_rs = sum(1 for n in pm_features if rent_stab[n]["suppressed"])
ranked_with_null_yoy = sum(1 for p in pms if p["rentPerformance"]["pmYoyChange"] is None)
lines.append(f"- {short_history} of {len(pms)} ranked PMs flagged shortHistoryFlag (yearsVisible < 3).")
lines.append(f"- {suppressed_rs} PMs have rent stability suppressed (insufficient observation history).")
lines.append(f"- {ranked_with_null_yoy} PMs have null pmYoyChange (insufficient prior-quarter rent data).")
lines.append("")
lines.append("## Runtime")
lines.append("")
lines.append(f"- Total runtime: {time.time() - START_T:.1f}s")
lines.append(f"- Output JSON size: {os.path.getsize(OUT_JSON):,} bytes")
lines.append("")

with open(OUT_SUMMARY, "w") as f:
    f.write("\n".join(lines))
log(f"Wrote {OUT_SUMMARY} ({os.path.getsize(OUT_SUMMARY):,} bytes)")

print()
print("=== FINAL DIAGNOSTIC ===")
print(f"MSA: {MSA_FULL_NAME}")
print(f"BHM rows: {rows_market:,}")
print(f"Ranked operators: {operator_count_eligible}")
print(f"Active operators (T12 >=3): {active_operator_count}")
print(f"Total operators (T12 >=1): {operator_count_total}")
print(f"7-cell distribution: {dict(q7_counts)}")
print(f"Median DOM T12: {median_dom_t12} days")
print(f"marketRentGrowthT12: {market_rent_growth_t12*100:+.2f}%")
ct_str = f"{cohort_median_listing_trajectory_yoy*100:+.2f}%" if cohort_median_listing_trajectory_yoy is not None else 'n/a'
print(f"cohortMedianListingTrajectoryYoY: {ct_str}")
print(f"Operators with concessions: {operators_with_concessions} / {operator_count_eligible} ({conc_rate_pct}%)")
print(f"Operator dignity validation failures: {len(validation_failures)}")
print(f"Institutional in ranked cohort: {len(inst_ranked)}")
if slug_collisions:
    print(f"Slug collisions disambiguated: {len(slug_collisions)}")
    for norm, base_slug, new_slug in slug_collisions:
        print(f"  {base_slug!r} → {new_slug!r}  ({pm_display_name[norm]!r})")
if top_ops:
    print()
    print("Top 5 operators:")
    for p in top_ops:
        print(f"  #{p['rank']['overall']}: {p['name']} ({p['quadrant7Cell']}) — composite {p['rank']['composite']} ({p['rank']['compositeStar']})")
print(f"Runtime: {time.time() - START_T:.1f}s")
