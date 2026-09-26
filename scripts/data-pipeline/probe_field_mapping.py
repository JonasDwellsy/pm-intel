# scripts/data-pipeline/probe_field_mapping.py
"""Report where each of the 24 consumed export fields can be sourced.

Not a test — a one-shot investigation whose output is pasted into
field_mapping.md. Run it, read it, record conclusions.

Read-only and Bozeman-scoped (msa 14580): every listing query filters on
p.msa_code, and the only unscoped reads are catalog queries plus one aggregate
over organization_company_table (not a listing table). All DB access goes
through dwellsy_db.query (READ ONLY session, 120s statement timeout). Literal
'%' in SQL is written '%%' because query() always passes a params dict.

Sections:
  1  column-location probe            (the brief's Step 1, verbatim)
  2  hard-field catalog probes        (the brief's Step 3)
  3  full_export_view select-list     (the data team's own expressions)
  4  value agreement on matched rows  (seeded random sample joined on listing_id)
  5  company fields, full export      (every row, via the 433 child companies)
  6  parent = company or organization? + org multiplicity
  7  timestamp column types
  8  photo/amenity mismatch diagnosis (is it post-capture drift?)
  9  population reconciliation        (why the export has fewer rows)

Usage (from scripts/data-pipeline):
  python3 probe_field_mapping.py [path/to/merged_bozeman-mt_YYYYMMDD.csv]
"""
import collections
import csv
import os
import random
import re
import sys

import dwellsy_db

csv.field_size_limit(sys.maxsize)

EXPORT_CSV = (sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser(
    "~/Documents/Claude/Projects/Product Support/merged_bozeman-mt_20260908.csv"))
MSA = 14580            # Bozeman, MT
SAMPLE_N = 1000
SAMPLE_SEED = 20260926
MAX_EXAMPLES = 2

CONSUMED = [
    "uru_id", "community_id", "address1_id", "address_1", "address_city",
    "address_type", "bedrooms", "rent_amount", "amenities", "photos",
    "description", "creation_time", "deactivation_time", "msa_code",
    "property_listing_status", "top_down_community_count", "company_name",
    "child_company_id", "child_company_type", "parent_company_id",
    "parent_company_name", "parent_company_type", "latitude", "longitude",
]

# ---------------------------------------------------------------------------
# The mapping under test. Aliases are fixed by FROM_CLAUSE below; every join
# after l->p is a to-one join onto a PRIMARY KEY (id), so none multiplies rows.
# ---------------------------------------------------------------------------
FROM_CLAUSE = """
from dwellsy_prod.property_listing_table l
join dwellsy_prod.property_table p           on p.id   = l.property_id
left join dwellsy_prod.address_line1_table a1     on a1.id  = p.address1_id
left join dwellsy_prod.address_type_table aty     on aty.id = a1.address_type_id
left join dwellsy_prod.address_line2_table a2     on a2.id  = p.address2_id
left join dwellsy_prod.address_community_table ac on ac.id  = p.community_id
left join dwellsy_prod.company_table c            on c.id   = p.company_id
left join dwellsy_prod.company_type_table ct      on ct.id  = c.company_type_id
left join dwellsy_prod.company_table pc           on pc.id  = c.parent_company_id
left join dwellsy_prod.company_type_table pct     on pct.id = pc.company_type_id
"""

AMENITIES_SQL = """(select string_agg(ad.amenity_name, '; ' order by ad.amenity_name)
   from (select distinct a.amenity_name
           from dwellsy_prod.property_amenity_table pa
           join dwellsy_prod.amenity_table a on a.id = pa.amenity_id
          where pa.property_id = p.id and a.amenity_name <> 'Other') ad)"""

PHOTOS_SQL = """(select string_agg(replace(mp.media_url,
            'https://s3-us-west-2.amazonaws.com/v2media.dwellsy.com/',
            'https://media.dwellsy.com/'), ';'
          order by case when mp.media_type = 'image' then 0 else 1 end, mp.id)
   from dwellsy_prod.property_media_table mp
  where mp.property_id = any(array[p.id, p.parent_property_id])
    and mp.property_media_status = 'active'
    and mp.media_type in ('image', 'floorplan'))"""

LA = "America/Los_Angeles"

# export column -> (kind, candidate SQL expression)
MAPPING = {
    "uru_id":                   ("id",   "p.uru_id"),
    "community_id":             ("id",   "p.community_id"),
    "address1_id":              ("id",   "p.address1_id"),
    "address_1":                ("text", "p.address_1"),
    "address_city":             ("text", "p.address_city"),
    "address_type":             ("text", "coalesce(aty.address_type, p.property_category)"),
    "bedrooms":                 ("id",   "coalesce(a2.bedrooms::integer, a1.bedrooms::integer, p.bedrooms)"),
    "rent_amount":              ("num",  "l.listing_amount"),
    "amenities":                ("text", AMENITIES_SQL),
    "photos":                   ("text", PHOTOS_SQL),
    "description":              ("text", "l.listing_long_text"),
    "creation_time":            ("text", f"to_char(l.creation_time at time zone '{LA}', 'YYYY-MM-DD HH24:MI:SS')"),
    "deactivation_time":        ("text", f"to_char(l.deactivation_time at time zone '{LA}', 'YYYY-MM-DD HH24:MI:SS')"),
    "msa_code":                 ("id",   "p.msa_code"),
    "property_listing_status":  ("text", "l.property_listing_status::text"),
    "top_down_community_count": ("id",   "ac.count_top_down"),
    "company_name":             ("text", "coalesce(pc.company_name_displayed, c.company_name_displayed)"),
    "child_company_id":         ("id",   "c.id"),
    "child_company_type":       ("text", "ct.type"),
    "parent_company_id":        ("id",   "c.parent_company_id"),
    "parent_company_name":      ("text", "pc.company_name_displayed"),
    "parent_company_type":      ("text", "pct.type"),
    "latitude":                 ("num",  "coalesce(a1.ss_latitude, p.ss_latitude, p.latitude)"),
    "longitude":                ("num",  "coalesce(a1.ss_longitude, p.ss_longitude, p.longitude)"),
}
assert list(MAPPING) == CONSUMED

# Rejected alternatives, reported so the choice above is evidenced, not asserted.
# name -> (export column compared against, kind, SQL)
ALTERNATIVES = {
    "creation_time @ UTC":       ("creation_time", "text", "to_char(l.creation_time at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS')"),
    "creation_time @ Denver":    ("creation_time", "text", "to_char(l.creation_time at time zone 'America/Denver', 'YYYY-MM-DD HH24:MI:SS')"),
    "deactivation_time @ UTC":   ("deactivation_time", "text", "to_char(l.deactivation_time at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS')"),
    "description = coalesce(listing_long_text, property_description)":
                                 ("description", "text", "coalesce(l.listing_long_text, p.property_description)"),
    "bedrooms = p.bedrooms only": ("bedrooms", "id", "p.bedrooms"),
    "latitude = p.latitude only": ("latitude", "num", "p.latitude"),
    "longitude = p.longitude only": ("longitude", "num", "p.longitude"),
}


def hr(title):
    print(f"\n{'=' * 78}\n{title}\n{'=' * 78}")


# ---------------------------------------------------------------------------
# 1. The brief's Step 1 probe, verbatim.
# ---------------------------------------------------------------------------
def section_1_column_locations():
    hr("1. Column-location probe (information_schema, excluding full_export*)")
    SQL = """
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'dwellsy_prod'
  and column_name = %(col)s
  and table_name not like 'full_export%%'
order by table_name
limit 8
"""
    for col in CONSUMED:
        rows = dwellsy_db.query(SQL, {"col": col})
        where = ", ".join(f"{r['table_name']}.{r['column_name']}" for r in rows) or "NOT A COLUMN"
        print(f"{col:28s} {where}")


# ---------------------------------------------------------------------------
# 2. The brief's Step 3 probes (with '%' escaped), plus the lookup vocabularies.
# ---------------------------------------------------------------------------
def section_2_hard_fields():
    hr("2. Hard-field catalog probes")
    for q in [
        "select column_name from information_schema.columns where table_schema='dwellsy_prod' and table_name='amenity_map_table' order by ordinal_position",
        "select column_name from information_schema.columns where table_schema='dwellsy_prod' and table_name='address_type_table' order by ordinal_position",
        "select table_name from information_schema.tables where table_schema='dwellsy_prod' and (table_name ilike '%%media%%' or table_name ilike '%%image%%' or table_name ilike '%%photo%%')",
    ]:
        rows = dwellsy_db.query(q)
        print(q.split("table_name=")[-1][:40], "->", [list(r.values())[0] for r in rows])
    rows = dwellsy_db.query("select id, address_type from dwellsy_prod.address_type_table where id in (1,2,3) order by id")
    print("address_type_table ids 1-3:", [(r["id"], r["address_type"]) for r in rows])
    rows = dwellsy_db.query("select id, type from dwellsy_prod.company_type_table order by id")
    print("company_type_table:", [(r["id"], r["type"]) for r in rows])
    for enum in ["property_listing_table_property_listing_status", "property_media_table_media_type",
                 "property_media_table_property_media_status"]:
        rows = dwellsy_db.query(
            "select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid "
            "where t.typname = %(t)s order by e.enumsortorder", {"t": enum})
        print(f"enum {enum}:", [r["enumlabel"] for r in rows])


# ---------------------------------------------------------------------------
# 3. The data team's own view. Its select-list names 47 of the export's 53
#    columns (all but the six child_/parent_company_* columns), so it is the
#    primary evidence for each expression; section 4 then tests the values.
# ---------------------------------------------------------------------------
def section_3_view_definition():
    hr("3. full_export_view select-list lines for consumed fields")
    d = dwellsy_db.query("select pg_get_viewdef('dwellsy_prod.full_export_view'::regclass, true) as d")[0]["d"]
    select_list = d.split("\n   FROM ")[0].strip()
    select_list = select_list[len("SELECT"):] if select_list.upper().startswith("SELECT") else select_list
    # Split the select-list on TOP-LEVEL commas (not inside parens or quotes).
    items, buf, depth, quote = [], [], 0, False
    for ch in select_list:
        if ch == "'":
            quote = not quote
        elif not quote and ch == "(":
            depth += 1
        elif not quote and ch == ")":
            depth -= 1
        if ch == "," and depth == 0 and not quote:
            items.append("".join(buf)); buf = []
        else:
            buf.append(ch)
    items.append("".join(buf))
    by_alias = {}
    for it in items:
        m = re.search(r"\s+AS\s+(\w+)\s*$", it.strip(), re.S)
        expr = re.sub(r"\s+", " ", it.strip())
        alias = m.group(1) if m else expr.split(".")[-1]
        by_alias[alias] = expr
    print(f"view select-list items: {len(items)}")
    for col in CONSUMED:
        print(f"{col:26s} {by_alias.get(col, '(not in view select-list)')[:400]}")
    print("\nview FROM/WHERE (population filters, not field logic):")
    print("   FROM " + d.split("\n   FROM ", 1)[1])


# ---------------------------------------------------------------------------
# 4. Value agreement on matched rows.
# ---------------------------------------------------------------------------
def load_export():
    with open(EXPORT_CSV, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    # The export's description is not reliably quoted upstream; a row whose
    # creation_time is not a date has been column-shifted -> treat as noise.
    good = [r for r in rows if re.match(r"\d{4}-\d{2}-\d{2} ", r.get("creation_time") or "")]
    print(f"export rows {len(rows)}, well-formed {len(good)}, column-shifted noise {len(rows) - len(good)}")
    return good


def norm(kind, v):
    if v is None:
        return None
    s = str(v).strip()
    if s == "" or s.lower() == "null":
        return None
    if kind == "num":
        try:
            return round(float(s), 6)
        except ValueError:
            return s
    if kind == "id":
        return s[:-2] if s.endswith(".0") else s
    return str(v)          # text: exact, untrimmed


def count_semis(v):
    """How pipeline.py consumes amenities/photos: count of non-blank ';' parts."""
    return len([x for x in v.split(";") if x.strip()]) if v else 0


def section_4_value_agreement(export_rows):
    hr(f"4. Value agreement: {SAMPLE_N} seeded-random export rows joined to the DB on listing_id = l.id")
    sample = random.Random(SAMPLE_SEED).sample(export_rows, SAMPLE_N)
    ids = [int(r["listing_id"]) for r in sample]
    cols = [f"{sql} as \"{name}\"" for name, (_, sql) in MAPPING.items()]
    # Short positional aliases: Postgres truncates identifiers to 63 bytes.
    cols += [f"{sql} as \"alt{i}\"" for i, (_, _, sql) in enumerate(ALTERNATIVES.values())]
    sql = (f"select l.id as listing_id_db, {', '.join(cols)} {FROM_CLAUSE} "
           "where p.msa_code = %(msa)s and l.id = any(%(ids)s)")
    db = {r["listing_id_db"]: r for r in dwellsy_db.query(sql, {"msa": MSA, "ids": ids})}
    print(f"sample {len(sample)}; matched in DB {len(db)} "
          f"(join is 1:1 — l.id is the PK and every later join is to-one)")
    matched = [r for r in sample if int(r["listing_id"]) in db]
    n = len(matched)

    def report(label, pairs):
        bad = [(lid, e, d) for lid, e, d in pairs if e != d]
        ex = [(lid, str(e)[:40], str(d)[:40]) for lid, e, d in bad[:MAX_EXAMPLES]]
        print(f"  {label:62s} {n - len(bad):5d}/{n} = {100 * (n - len(bad)) / n:5.1f}%  {ex if ex else ''}")
        return bad

    print("\nchosen mapping:")
    mism = {}
    for col, (kind, _) in MAPPING.items():
        pairs = [(r["listing_id"], norm(kind, r[col]), norm(kind, db[int(r["listing_id"])][col])) for r in matched]
        mism[col] = report(col, pairs)
    print("\nas the pipeline consumes them (count of ';'-separated items):")
    for col in ("amenities", "photos"):
        pairs = [(r["listing_id"], count_semis(r[col]), count_semis(db[int(r["listing_id"])][col])) for r in matched]
        mism[f"{col}:count"] = report(f"{col} (count)", pairs)
    print("\njoin cross-check — (uru_id, creation date) agree on the listing_id-matched row:")
    pairs = [(r["listing_id"], (r["uru_id"], r["creation_time"][:10]),
              (norm("id", db[int(r["listing_id"])]["uru_id"]) or "", (db[int(r["listing_id"])]["creation_time"] or "")[:10]))
             for r in matched]
    report("(uru_id, creation_date)", pairs)
    print("\nrejected alternatives:")
    for i, (name, (col, kind, _)) in enumerate(ALTERNATIVES.items()):
        pairs = [(r["listing_id"], norm(kind, r[col]), norm(kind, db[int(r["listing_id"])][f"alt{i}"])) for r in matched]
        report(name, pairs)

    # Listing-level mismatches: did the listing change after the export was
    # pulled (2026-09-08 PT)? Status/deactivation: closed after the pull.
    # Rent/description: row last written after the pull.
    cut = "2026-09-08 07:00:00+00"
    changed = sorted({int(x[0]) for f in ("property_listing_status", "deactivation_time", "rent_amount", "description")
                      for x in mism[f]})
    if changed:
        rows = {r["id"]: r for r in dwellsy_db.query(
            "select l.id, l.deactivation_time >= %(cut)s::timestamptz as closed_after, "
            "l.last_update_time >= %(cut)s::timestamptz as written_after, "
            "l.listing_long_text is null as text_null "
            "from dwellsy_prod.property_listing_table l join dwellsy_prod.property_table p on p.id = l.property_id "
            "where p.msa_code = %(msa)s and l.id = any(%(ids)s)", {"msa": MSA, "ids": changed, "cut": cut})}
        print("\nlisting-level mismatch diagnosis (changed after the 2026-09-08 pull?):")
        for f, test, label in [("property_listing_status", "closed_after", "closed after the pull"),
                               ("deactivation_time", "closed_after", "closed after the pull"),
                               ("rent_amount", "written_after", "listing row written after the pull"),
                               ("description", "written_after", "listing row written after the pull")]:
            lids = [int(x[0]) for x in mism[f]]
            hit = sum(1 for i in lids if rows[i][test])
            print(f"  {f:24s} {len(lids)} mismatches, {hit} {label}")
        rest = [int(x[0]) for x in mism["description"] if not rows[int(x[0])]["written_after"]]
        print(f"  description mismatches NOT explained by a later write: {len(rest)}, "
              f"of which DB listing_long_text IS NULL while the export has text: "
              f"{sum(1 for i in rest if rows[i]['text_null'])}")

    # Same NULL-text anomaly, sized over the whole export (ids only, no text).
    all_ids = [int(r["listing_id"]) for r in export_rows]
    null_ids = {r["id"] for r in dwellsy_db.query(
        "select l.id from dwellsy_prod.property_listing_table l join dwellsy_prod.property_table p on p.id = l.property_id "
        "where p.msa_code = %(msa)s and l.id = any(%(ids)s) and l.listing_long_text is null", {"msa": MSA, "ids": all_ids})}
    exp_text = {int(r["listing_id"]) for r in export_rows if r["description"].strip()}
    print(f"\nfull export: description non-blank {len(exp_text)}/{len(all_ids)}; DB listing_long_text NULL "
          f"{len(null_ids)}; export has text but DB text is NULL: {len(exp_text & null_ids)}")
    return sample, db, mism


# ---------------------------------------------------------------------------
# 5. Company fields over the WHOLE export (cheap: one row per child company).
# ---------------------------------------------------------------------------
def section_5_company_full(export_rows):
    hr("5. Company fields over every export row (keyed by child_company_id)")
    fields = ["child_company_type", "parent_company_id", "parent_company_name", "parent_company_type", "company_name"]
    cids = sorted({int(r["child_company_id"]) for r in export_rows if r["child_company_id"].strip().isdigit()})
    sql = f"""select c.id as child_company_id,
        {MAPPING['child_company_type'][1]} as child_company_type,
        {MAPPING['parent_company_id'][1]} as parent_company_id,
        {MAPPING['parent_company_name'][1]} as parent_company_name,
        {MAPPING['parent_company_type'][1]} as parent_company_type,
        {MAPPING['company_name'][1]} as company_name
      from dwellsy_prod.company_table c
      left join dwellsy_prod.company_type_table ct  on ct.id  = c.company_type_id
      left join dwellsy_prod.company_table pc       on pc.id  = c.parent_company_id
      left join dwellsy_prod.company_type_table pct on pct.id = pc.company_type_id
     where c.id = any(%(ids)s)"""
    db = {r["child_company_id"]: r for r in dwellsy_db.query(sql, {"ids": cids})}
    print(f"distinct child companies {len(cids)}, found {len(db)}")
    for f in fields:
        kind = MAPPING[f][0]
        ok = sum(1 for r in export_rows
                 if int(r["child_company_id"]) in db
                 and norm(kind, r[f]) == norm(kind, db[int(r["child_company_id"])][f]))
        print(f"  {f:22s} {ok}/{len(export_rows)} = {100 * ok / len(export_rows):.2f}%")
    return cids


# ---------------------------------------------------------------------------
# 6. Is the export's parent a company_table parent or an organization?
# ---------------------------------------------------------------------------
def section_6_parent_and_orgs(export_rows, cids):
    hr("6. Parent = company_table.parent_company_id, or organization? + org multiplicity")
    orgs = collections.defaultdict(list)
    for r in dwellsy_db.query(
            "select oc.company_id, oc.organization_id, o.org_type "
            "from dwellsy_prod.organization_company_table oc "
            "join dwellsy_prod.organization_table o on o.id = oc.organization_id "
            "where oc.company_id = any(%(ids)s)", {"ids": cids}):
        orgs[r["company_id"]].append(r)
    parented = [r for r in export_rows if r["parent_company_id"].strip()]
    hit = sum(1 for r in parented
              if any(str(o["organization_id"]) == r["parent_company_id"].strip()
                     for o in orgs.get(int(r["child_company_id"]), [])))
    print(f"export rows with a parent_company_id: {len(parented)}; "
          f"parent_company_id equals one of the child's organization ids: {hit}")
    print("export parent_company_type vocabulary:",
          collections.Counter(r["parent_company_type"] for r in parented).most_common())
    print("organization_table.org_type vocabulary (orgs of export companies):",
          collections.Counter(o["org_type"] for c in orgs for o in orgs[c]).most_common())
    print("export child companies by # of organizations:",
          sorted(collections.Counter(len(orgs.get(c, [])) for c in cids).items()))
    rows = dwellsy_db.query(
        "select least(count(oc.organization_id), 3) as n_org, count(*) as companies "
        "from (select distinct p.company_id from dwellsy_prod.property_table p "
        "      where p.msa_code = %(msa)s and p.company_id is not null) x "
        "left join dwellsy_prod.organization_company_table oc on oc.company_id = x.company_id "
        "group by x.company_id", {"msa": MSA})
    dist = collections.Counter()
    for r in rows:
        dist[r["n_org"]] += 1
    print("ALL Bozeman property companies by # of organizations (3 = 3+):", sorted(dist.items()))
    rows = dwellsy_db.query(
        "select count(*) filter (where n > 1) as multi, count(*) as total from "
        "(select company_id, count(*) as n from dwellsy_prod.organization_company_table group by company_id) x")
    print(f"GLOBAL companies in organization_company_table with >1 org: {rows[0]['multi']} of {rows[0]['total']}")


# ---------------------------------------------------------------------------
# 7. Timestamp types.
# ---------------------------------------------------------------------------
def section_7_timestamps():
    hr("7. Timestamp column types")
    rows = dwellsy_db.query(
        "select table_name, column_name, data_type from information_schema.columns "
        "where table_schema = 'dwellsy_prod' and table_name = 'property_listing_table' "
        "and column_name in ('creation_time', 'deactivation_time', 'last_update_time') order by 2")
    for r in rows:
        print(f"  {r['table_name']}.{r['column_name']}: {r['data_type']}")
    print("  session TimeZone:", dwellsy_db.query("show timezone")[0])
    print("  export format: 'YYYY-MM-DD HH24:MI:SS', no offset (see section 4 for which zone agrees)")


# ---------------------------------------------------------------------------
# 8. Photo / amenity mismatches: post-capture drift?
# ---------------------------------------------------------------------------
def section_8_drift(sample, db, mism):
    hr("8. Photo/amenity mismatch diagnosis")
    by_lid = {int(r["listing_id"]): r for r in sample}
    lids = sorted({int(x[0]) for x in mism["photos:count"]})
    if lids:
        rows = dwellsy_db.query(
            """select l.id as lid, mp.media_url, mp.property_media_status::text as st, mp.media_type::text as mt,
                      mp.creation_time > coalesce(l.deactivation_time, now()) as after_close
                 from dwellsy_prod.property_listing_table l
                 join dwellsy_prod.property_table p on p.id = l.property_id
                 join dwellsy_prod.property_media_table mp on mp.property_id = any(array[p.id, p.parent_property_id])
                where p.msa_code = %(msa)s and l.id = any(%(ids)s)""", {"msa": MSA, "ids": lids})
        media = collections.defaultdict(list)
        for r in rows:
            media[r["lid"]].append(r)
        pfx = ("https://s3-us-west-2.amazonaws.com/v2media.dwellsy.com/", "https://media.dwellsy.com/")
        db_only = db_only_after = exp_only = 0
        for lid in lids:
            exp_urls = {u for u in by_lid[lid]["photos"].split(";") if u.strip()}
            active = {m["media_url"].replace(*pfx): m for m in media[lid]
                      if m["st"] == "active" and m["mt"] in ("image", "floorplan")}
            extra = [m for u, m in active.items() if u not in exp_urls]
            db_only += len(extra)
            db_only_after += sum(1 for m in extra if m["after_close"])
            exp_only += len([u for u in exp_urls if u not in active])
        print(f"photo-count mismatches: {len(lids)} listings; DB-only photos {db_only} "
              f"({db_only_after} created AFTER the listing closed); export-only photos {exp_only} "
              f"(no longer active in property_media_table)")
    amen_lids = sorted({int(x[0]) for x in mism["amenities"]})
    if amen_lids:
        rows = dwellsy_db.query(
            """select l.id, count(*) filter (where greatest(pa.creation_time, coalesce(pa.last_update_time, pa.creation_time))
                                             >= '2026-09-08 00:00:00-07'::timestamptz) as touched_after
                 from dwellsy_prod.property_listing_table l
                 join dwellsy_prod.property_table p on p.id = l.property_id
                 join dwellsy_prod.property_amenity_table pa on pa.property_id = p.id
                where p.msa_code = %(msa)s and l.id = any(%(ids)s) group by l.id""", {"msa": MSA, "ids": amen_lids})
        print(f"amenity-string mismatches: {len(amen_lids)} listings; "
              f"{sum(1 for r in rows if r['touched_after'] > 0)} have amenity rows written on/after the 2026-09-08 export")


# ---------------------------------------------------------------------------
# 9. Population reconciliation — context for Task 5, not field logic.
# ---------------------------------------------------------------------------
VIEW_FILTERS = {
    "lifecycle":   "(l.property_listing_status = 'active' and l.deactivation_time is null) or "
                   "(l.property_listing_status = 'inactive' and l.creation_time + interval '4 hours' < l.deactivation_time)",
    "a1_type_123": "a1.address_type_id in (1, 2, 3)",
    "p_dpv_Y":     "p.ss_raw_dpv_match_code = 'Y'",
    "a1_dpv_D":    "(a1.ss_raw_dpv_match_code = 'D' and p.address2_id is not null) or a1.ss_raw_dpv_match_code <> 'D'",
    "not_room":    "p.is_room = 0",
    "has_uru":     "p.uru_id is not null",
    "co_active":   "c.company_status::text = 'active'",
    "co_not_blacklisted": "c.blacklist_status is null or c.is_whitelisted",
    "not_waitlist": "p.property_category::text <> 'Waitlist'",
    "rent_band":   "l.listing_amount >= greatest(p.bedrooms, 1) * 250 and l.listing_amount <= 20000",
    "apt_only_clause": "a2.address_type_id = 1 or (a1.address_type_id = 1 and a2.address_type_id is null)",
    "before_export": "l.creation_time < '2026-09-08 07:00:00+00'::timestamptz",
}


def section_9_population(export_rows):
    hr("9. Population reconciliation (full_export_view WHERE clauses vs the export)")
    exp_ids = {int(r["listing_id"]) for r in export_rows}
    flags = ", ".join(f"coalesce(({sql}), false) as \"{k}\"" for k, sql in VIEW_FILTERS.items())
    rows = dwellsy_db.query(f"select l.id, {flags} {FROM_CLAUSE} where p.msa_code = %(msa)s", {"msa": MSA})
    in_exp = [r for r in rows if r["id"] in exp_ids]
    out_exp = [r for r in rows if r["id"] not in exp_ids]
    print(f"Bozeman DB listings {len(rows)}; export listing_ids {len(exp_ids)}; export ids found in DB {len(in_exp)}")
    for k in VIEW_FILTERS:
        a = sum(1 for r in in_exp if r[k]) / max(len(in_exp), 1)
        b = sum(1 for r in out_exp if r[k]) / max(len(out_exp), 1)
        print(f"  {k:20s} pass-rate: export rows {a:.4f}   non-export DB rows {b:.4f}")
    keep = [k for k in VIEW_FILTERS if k != "apt_only_clause"]
    passing = {r["id"] for r in rows if all(r[k] for k in keep)}
    print(f"DB rows passing every filter except apt_only_clause: {len(passing)} "
          f"(in export {len(passing & exp_ids)}, NOT in export {len(passing - exp_ids)})")
    gap = sorted(passing - exp_ids)
    if gap:
        g = dwellsy_db.query(
            "select l.id, p.uru_id, p.address1_id, l.creation_time < '2020-10-29'::timestamptz as pre_history "
            "from dwellsy_prod.property_listing_table l join dwellsy_prod.property_table p on p.id = l.property_id "
            "where p.msa_code = %(msa)s and l.id = any(%(ids)s)", {"msa": MSA, "ids": gap})
        exp_urus = {r["uru_id"] for r in export_rows}
        exp_a1 = {r["address1_id"] for r in export_rows}
        pre = sum(1 for r in g if r["pre_history"])
        rest = [r for r in g if not r["pre_history"]]
        print(f"  gap rows created before the export's first listing (2020-10-29): {pre}")
        print(f"  remaining {len(rest)}: uru absent from export {sum(1 for r in rest if str(r['uru_id']) not in exp_urus)}, "
              f"address1 absent from export {sum(1 for r in rest if str(r['address1_id']) not in exp_a1)}")


def main():
    print(f"export: {EXPORT_CSV}  msa: {MSA}")
    section_1_column_locations()
    section_2_hard_fields()
    section_3_view_definition()
    export_rows = load_export()
    sample, db, mism = section_4_value_agreement(export_rows)
    cids = section_5_company_full(export_rows)
    section_6_parent_and_orgs(export_rows, cids)
    section_7_timestamps()
    section_8_drift(sample, db, mism)
    section_9_population(export_rows)


if __name__ == "__main__":
    main()
